const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const { promisify } = require('util');
const { nanoid } = require('nanoid');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Load environment variables from parent .env.local file
require('dotenv').config({ path: '../../.env.local' });

const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 4001;

// Enable JSON body parsing
app.use(express.json());

// Detect Python executable: prefer venv if available, otherwise use system python3
const venvPython = path.join(__dirname, '.venv', 'bin', 'python');
const pythonExec = fs.existsSync(venvPython) ? venvPython : 'python3';
console.log(`🐍 Using Python: ${pythonExec}`);

const uploadsRoot = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot);

app.use(express.static(path.join(__dirname, 'public')));
// Expose generated job folders (including cmyk_tiff_images) for inspection/download.
// NOTE: This serves raw uploaded content; in production you would lock this down.
app.use('/files', express.static(uploadsRoot));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

// API token guard middleware
// Set PDF_SERVICE_ACCESS_TOKEN env var to enable protection
// Token must be passed via 'x-access-token' header
const ACCESS_TOKEN = process.env.PDF_SERVICE_ACCESS_TOKEN || null;
if (ACCESS_TOKEN) {
  console.log('🔐 API protection enabled (PDF_SERVICE_ACCESS_TOKEN is set)');
} else {
  console.warn('⚠️  API protection disabled (PDF_SERVICE_ACCESS_TOKEN not set)');
}

function requireToken(req, res, next) {
  if (!ACCESS_TOKEN) return next(); // no protection configured
  const token = req.headers['x-access-token'];
  if (token === ACCESS_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// In-memory progress store
const progress = {}; // workId -> { stage, message, percent }

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// R2 Storage Client
function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
}

// Upload preview images to R2 (parallel uploads for speed)
// folderPath format: <orderId> or <orderId>/<bookConfigId>
async function uploadPreviewImagesToR2(folderPath, imageFiles) {
  const r2Client = getR2Client();
  if (!r2Client) {
    throw new Error('R2 not configured - check R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }

  const bucket = process.env.R2_PREVIEWS_BUCKET || 'book-previews';

  // Process and upload all images in parallel
  const uploadPromises = imageFiles.map(async ({ localPath, name, type, pageNumber }) => {
    // Read and compress image with sharp
    // Use high quality JPEG compression for small file size with good quality
    const imageBuffer = await sharp(localPath)
      .jpeg({
        quality: 85,
        mozjpeg: true, // Use mozjpeg for better compression
      })
      .toBuffer();

    const key = `${folderPath}/${name}.jpg`;

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
    });

    await r2Client.send(putCommand);

    console.log(`[R2] Uploaded ${key} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);

    return {
      key,
      type,
      name,
      size: imageBuffer.length,
      pageNumber,
    };
  });

  // Wait for all uploads to complete
  const results = await Promise.all(uploadPromises);
  return results;
}

// Helper to write or update manifest
function writeManifest(workDir, data) {
  const file = path.join(workDir, 'manifest.json');
  let existing = {};
  if (fs.existsSync(file)) {
    try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (_) { existing = {}; }
  }
  const merged = { ...existing, ...data };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf-8');
  return file;
}

// Validate ZIP contents and return book data
function validateZipContents(workDir) {
  const bookJsonPath = path.join(workDir, 'book.json');
  if (!fs.existsSync(bookJsonPath)) {
    return { error: 'book.json not found in ZIP. Please ensure it exists at the root level.' };
  }

  let book;
  try {
    const raw = fs.readFileSync(bookJsonPath, 'utf-8');
    book = JSON.parse(raw);
  } catch (e) {
    return { error: `Invalid book.json format: ${e.message}. Check JSON syntax.` };
  }

  if (!book.shortDescription || !book.motivationEnd || !Array.isArray(book.scenes)) {
    const missing = [];
    if (!book.shortDescription) missing.push('shortDescription');
    if (!book.motivationEnd) missing.push('motivationEnd');
    if (!Array.isArray(book.scenes)) missing.push('scenes (must be an array)');
    return { error: `book.json missing: ${missing.join(', ')}` };
  }

  if (book.scenes.length === 0) {
    return { error: 'book.json has no scenes. Add at least one scene.' };
  }

  const rgbImagesDir = path.join(workDir, 'images');
  if (!fs.existsSync(rgbImagesDir)) {
    return { error: 'images/ folder not found in ZIP. Create an images folder with scene images.' };
  }

  const imageFiles = fs.readdirSync(rgbImagesDir).filter(f => f.match(/\.(png|jpg|jpeg)$/i));
  if (imageFiles.length === 0) {
    return { error: 'images/ folder is empty. Add scene images (PNG/JPG).' };
  }

  if (imageFiles.length < book.scenes.length) {
    return { error: `Need ${book.scenes.length} scene images, but found only ${imageFiles.length}` };
  }

  return { book, bookJsonPath, rgbImagesDir, imageFiles };
}

// Generate PDF using python script (with streaming progress)
async function generatePdf(workId, workDir, bookJsonPath, imagesDir) {
  progress[workId] = { stage: 'pdf', message: 'Generating PDF', percent: 0 };
  const pythonScript = path.join(__dirname, 'pdf-bleed.py');
  const outPdf = path.join(workDir, 'book-output.pdf');
  const coverPdf = path.join(workDir, 'cover.pdf');
  const backPdf = path.join(workDir, 'back.pdf');

  const cmd = `"${pythonExec}" "${pythonScript}" --book-json "${bookJsonPath}" --images-dir "${imagesDir}" --output "${outPdf}" --cover-output "${coverPdf}" --split-cover --back-output "${backPdf}" --split-back --page-width-cm 20.5 --page-height-cm 20.5 --cover-width-cm 21.5 --cover-height-cm 21.5 --back-width-cm 21.5 --back-height-cm 21.5 --bleed-cm 0 --mr`;

  return new Promise((resolve) => {
    const pdfStart = Date.now();
    let stderrBuffer = '';
    let stdoutBuffer = '';

    const pdfProcess = exec(cmd, { cwd: __dirname });

    pdfProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = chunk.toString().trim().split(/\n+/);
      lines.forEach(line => {
        if (line.startsWith('PDFPAGE|')) {
          const parts = line.split('|');
          const current = parseInt(parts[1], 10) || 0;
          const total = parseInt(parts[2], 10) || 0;
          const percent = total ? Math.round((current / total) * 100) : 0;
          progress[workId] = { stage: 'pdf', message: `Generating PDF (${current}/${total} pages)`, percent };
        }
      });
    });

    pdfProcess.stderr.on('data', (chunk) => {
      stderrBuffer += chunk;
    });

    pdfProcess.on('exit', (code) => {
      const pdfDurationSec = ((Date.now() - pdfStart) / 1000).toFixed(2);
      if (code !== 0) {
        const errorMsg = stderrBuffer || 'PDF generation failed';
        const shortMsg = errorMsg.includes('ModuleNotFoundError')
          ? 'Python dependencies missing. Install: pip install -r requirements.txt'
          : errorMsg.split('\n')[0] || 'PDF generation failed';
        resolve({ error: shortMsg, fullError: errorMsg, stderr: stderrBuffer, stdout: stdoutBuffer });
      } else {
        resolve({ outPdf, coverPdf, backPdf, pdfDurationSec });
      }
    });
  });
}

// Core processing function for PDF generation
async function processJob(workId, workDir, options = {}) {
  const { skipUpscale = false } = options;

  try {
    // Validate ZIP contents
    const validation = validateZipContents(workDir);
    if (validation.error) {
      progress[workId] = { stage: 'error', message: validation.error };
      return;
    }

    const { book, bookJsonPath, rgbImagesDir } = validation;
    const createdAt = new Date().toISOString();
    writeManifest(workDir, {
      workId,
      createdAt,
      scenesCount: book.scenes.length,
      status: 'processing',
      type: 'generate',
      skipUpscale
    });

    // Run upscale + CMYK pipeline
    const iccProfile = path.join(__dirname, 'PSOcoated_v3.icc');
    progress[workId] = { stage: 'upscale', message: skipUpscale ? 'Processing images (no upscale)' : 'Upscaling images', percent: 0 };
    const pipelineStart = Date.now();
    const skipUpscaleFlag = skipUpscale ? ' --skip-upscale' : '';

    await new Promise((resolve) => {
      let stderrBuffer = '';
      const pipeline = exec(`node index.js --input "${rgbImagesDir}" --upscaled "${path.join(workDir, 'upscaled_images')}" --cmyk "${path.join(workDir, 'cmyk_tiff_images')}" --icc "${iccProfile}" --mr${skipUpscaleFlag}`, { cwd: __dirname });
      pipeline.stdout.on('data', (chunk) => {
        const lines = chunk.toString().trim().split(/\n+/);
        lines.forEach(line => {
          if (line.startsWith('PROGRESS|')) {
            const parts = line.split('|');
            const stage = parts[1];
            const current = parseInt(parts[2], 10) || 0;
            const total = parseInt(parts[3], 10) || 0;
            const percent = total ? Math.round((current / total) * 100) : 0;
            let message = stage === 'upscale'
              ? (skipUpscale ? 'Processing images (no upscale)' : 'Upscaling images')
              : (stage === 'convert' ? 'Converting to CMYK' : stage);
            progress[workId] = { stage, message, percent };
          } else if (line.startsWith('ERROR|')) {
            progress[workId] = { stage: 'error', message: line.substring(6) };
          }
        });
      });
      pipeline.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
      });
      pipeline.on('exit', (code) => {
        if (progress[workId].stage !== 'error' && code !== 0) {
          const errorMsg = stderrBuffer.trim() || 'Pipeline failed';
          console.error(`Pipeline failed with code ${code}:`, errorMsg);
          progress[workId] = { stage: 'error', message: errorMsg.split('\n')[0] || 'Pipeline failed' };
        }
        resolve();
      });
    });

    if (progress[workId].stage === 'error') return;

    const pipelineDurationSec = ((Date.now() - pipelineStart) / 1000).toFixed(2);
    writeManifest(workDir, { pipelineDurationSec });

    const imagesDir = path.join(workDir, 'cmyk_tiff_images');

    // Generate PDF
    const pdfResult = await generatePdf(workId, workDir, bookJsonPath, imagesDir);
    if (pdfResult.error) {
      progress[workId] = { stage: 'error', message: pdfResult.error };
      writeManifest(workDir, {
        status: 'error',
        error: pdfResult.fullError,
        stderr: pdfResult.stderr || '',
        stdout: pdfResult.stdout || ''
      });
      console.error(`PDF generation failed for ${workId}:`, pdfResult.fullError);
      return;
    }

    writeManifest(workDir, { pdfDurationSec: pdfResult.pdfDurationSec });

    progress[workId] = { stage: 'done', message: 'Complete', percent: 100 };
    writeManifest(workDir, { status: 'done', completedAt: new Date().toISOString() });

  } catch (e) {
    progress[workId] = { stage: 'error', message: e.message };
  }
}

// Request handler for /generate
async function handleGenerate(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const skipUpscale = req.query.skipUpscale === 'false' || req.body?.skipUpscale === false ? false : true;
  const workId = nanoid(8);

  progress[workId] = { stage: 'init', message: 'Starting', percent: 0 };

  res.json({
    ok: true,
    workId,
    poll: `/progress/${workId}`,
    download: `/download/${workId}`,
    type: 'generate',
    options: { skipUpscale }
  });

  try {
    const workDir = path.join(uploadsRoot, workId);
    fs.mkdirSync(workDir);
    const zipPath = req.file.path;
    progress[workId] = { stage: 'unzip', message: 'Unzipping archive', percent: 0 };
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(workDir, true);

    await processJob(workId, workDir, { type: 'generate', skipUpscale });
  } catch (e) {
    progress[workId] = { stage: 'error', message: e.message };
  }
}

// POST /generate - Generate print-ready book PDF (with upscaling + CMYK conversion)
app.post('/generate', requireToken, upload.single('archive'), handleGenerate);

// Legacy /upload endpoint - backwards compatible with /generate
app.post('/upload', requireToken, upload.single('archive'), handleGenerate);

app.get('/progress/:id', requireToken, (req, res) => {
  const state = progress[req.params.id];
  if (!state) return res.status(404).json({ error: 'Unknown work id' });
  res.json(state);
});

// Helper function to generate preview images and upload to R2
// Returns array of uploaded image info
async function generatePreviewImages(workId, workDir, coverPdf, outPdf, backPdf, r2FolderPath) {
  const previewDir = path.join(workDir, 'preview-images-temp');
  if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

  try {
    console.log(`[PreviewImages] Starting image generation for ${workDir}`);
    progress[workId] = { stage: 'images', message: 'Converting PDFs to images', percent: 10 };

    // Convert PDFs to PNGs
    if (fs.existsSync(coverPdf)) {
      console.log(`[PreviewImages] Converting cover.pdf to PNG`);
      await execAsync(`convert "${coverPdf}" "${path.join(previewDir, 'cover.png')}"`);
    }

    // Convert book PDF pages to PNGs
    console.log(`[PreviewImages] Converting book-output.pdf pages to PNGs`);
    await execAsync(`convert "${outPdf}" "${path.join(previewDir, 'page-%d.png')}"`);

    if (backPdf && fs.existsSync(backPdf)) {
      console.log(`[PreviewImages] Converting back.pdf to PNG`);
      await execAsync(`convert "${backPdf}" "${path.join(previewDir, 'back.png')}"`);
    }

    progress[workId] = { stage: 'watermark', message: 'Adding watermarks', percent: 30 };

    // Add watermark to all PNGs
    const pngFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.png'));
    console.log(`[PreviewImages] Found ${pngFiles.length} PNG files, adding watermarks`);

    if (pngFiles.length === 0) {
      throw new Error('No PNG files generated from PDFs');
    }

    for (let i = 0; i < pngFiles.length; i++) {
      const img = pngFiles[i];
      const imgPath = path.join(previewDir, img);
      await execAsync(`convert "${imgPath}" -gravity center -pointsize 80 -fill 'rgba(255,255,255,0.4)' -annotate +0+0 'Приказко БГ' "${imgPath}"`);
      const percent = 30 + Math.round((i / pngFiles.length) * 30);
      progress[workId] = { stage: 'watermark', message: `Adding watermark (${i + 1}/${pngFiles.length})`, percent };
    }

    progress[workId] = { stage: 'upload', message: 'Uploading images to R2', percent: 60 };

    // Sort files: cover, pages (numerically), back
    const sortedFiles = [];
    if (pngFiles.includes('cover.png')) {
      sortedFiles.push({ name: 'cover', localPath: path.join(previewDir, 'cover.png'), type: 'cover' });
    }

    const pageFiles = pngFiles.filter(f => f.startsWith('page-')).sort((a, b) => {
      const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
      const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
      return numA - numB;
    });

    pageFiles.forEach((f, idx) => {
      sortedFiles.push({
        name: `page-${idx}`,
        localPath: path.join(previewDir, f),
        type: 'page',
        pageNumber: idx
      });
    });

    if (pngFiles.includes('back.png')) {
      sortedFiles.push({ name: 'back', localPath: path.join(previewDir, 'back.png'), type: 'back' });
    }

    console.log(`[PreviewImages] Uploading ${sortedFiles.length} images to R2 folder: ${r2FolderPath}`);

    // Upload to R2
    const uploadedImages = await uploadPreviewImagesToR2(r2FolderPath, sortedFiles);

    progress[workId] = { stage: 'done', message: 'Complete', percent: 100 };

    // Move temp directory to permanent location for local preview/download
    const finalPreviewDir = path.join(workDir, 'preview-images');
    fs.renameSync(previewDir, finalPreviewDir);

    console.log(`[PreviewImages] Successfully uploaded ${uploadedImages.length} images`);
    return uploadedImages;

  } catch (error) {
    console.error(`[PreviewImages] Error generating preview images:`, error.message);
    if (error.stderr) console.error(`[PreviewImages] stderr:`, error.stderr);
    // Cleanup on error
    if (fs.existsSync(previewDir)) {
      fs.rmSync(previewDir, { recursive: true, force: true });
    }
    throw error;
  }
}

// POST /preview-images - Generate preview images and upload to R2
// Query params:
//   - orderId (required): The order ID for organizing in R2
//   - bookConfigId (required): The book config ID
app.post('/preview-images', requireToken, upload.single('archive'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const orderId = req.query.orderId || req.body?.orderId;
  const bookConfigId = req.query.bookConfigId || req.body?.bookConfigId;

  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  if (!bookConfigId) {
    return res.status(400).json({ error: 'bookConfigId is required' });
  }

  // Build R2 folder path: <orderId>/<bookConfigId>
  const r2FolderPath = `${orderId}/${bookConfigId}`;

  const workId = nanoid(8);
  progress[workId] = { stage: 'init', message: 'Starting', percent: 0 };

  // Send immediate response
  res.json({
    ok: true,
    workId,
    poll: `/progress/${workId}`,
    r2Folder: r2FolderPath,
  });

  try {
    const workDir = path.join(uploadsRoot, workId);
    fs.mkdirSync(workDir);
    const zipPath = req.file.path;

    progress[workId] = { stage: 'unzip', message: 'Unzipping archive', percent: 0 };
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(workDir, true);

    // Validate ZIP contents
    const validation = validateZipContents(workDir);
    if (validation.error) {
      progress[workId] = { stage: 'error', message: validation.error };
      return;
    }

    const { book, bookJsonPath, rgbImagesDir } = validation;
    const createdAt = new Date().toISOString();

    writeManifest(workDir, {
      workId,
      createdAt,
      scenesCount: book.scenes.length,
      status: 'processing',
      type: 'preview-images',
      orderId,
      bookConfigId: bookConfigId || null,
      r2Folder: r2FolderPath,
    });

    // Generate PDF (using original images, no upscale)
    const pdfResult = await generatePdf(workId, workDir, bookJsonPath, rgbImagesDir);
    if (pdfResult.error) {
      progress[workId] = { stage: 'error', message: pdfResult.error };
      writeManifest(workDir, { status: 'error', error: pdfResult.fullError });
      return;
    }

    // Generate preview images and upload to R2
    const uploadedImages = await generatePreviewImages(
      workId,
      workDir,
      pdfResult.coverPdf,
      pdfResult.outPdf,
      pdfResult.backPdf,
      r2FolderPath
    );

    writeManifest(workDir, {
      status: 'done',
      completedAt: new Date().toISOString(),
      pdfDurationSec: pdfResult.pdfDurationSec,
      uploadedImages,
    });

  } catch (e) {
    console.error(`[PreviewImages] Job ${workId} failed:`, e.message);
    progress[workId] = { stage: 'error', message: e.message };
  }
});

// GET /preview-images/:id - Get info about uploaded preview images
app.get('/preview-images/:id', requireToken, (req, res) => {
  const workDir = path.join(uploadsRoot, req.params.id);
  const manifestPath = path.join(workDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    if (manifest.status === 'error') {
      return res.json({
        ok: false,
        status: 'error',
        error: manifest.error,
      });
    }

    if (manifest.status !== 'done') {
      return res.json({
        ok: true,
        status: manifest.status,
        message: 'Job still processing',
      });
    }

    // Return uploaded images info
    const bucket = process.env.R2_PREVIEWS_BUCKET || 'book-previews';
    const r2Endpoint = process.env.R2_ENDPOINT || '';

    // Build public URLs (if R2 bucket has public access) or just return keys
    const images = (manifest.uploadedImages || []).map(img => ({
      ...img,
      // R2 public URL format: https://<account>.r2.dev/<bucket>/<key>
      // Or use a custom domain if configured
      r2Key: img.key,
    }));

    res.json({
      ok: true,
      status: 'done',
      workId: req.params.id,
      orderId: manifest.orderId,
      bookConfigId: manifest.bookConfigId,
      r2Folder: manifest.r2Folder,
      r2Bucket: bucket,
      images,
      scenesCount: manifest.scenesCount,
      completedAt: manifest.completedAt,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read job manifest' });
  }
});

// GET /preview-images/:id/download - Download preview images as ZIP
app.get('/preview-images/:id/download', requireToken, (req, res) => {
  const workDir = path.join(uploadsRoot, req.params.id);
  const previewImagesDir = path.join(workDir, 'preview-images');

  if (!fs.existsSync(previewImagesDir)) {
    return res.status(404).json({ error: 'Preview images not found' });
  }

  try {
    const zip = new AdmZip();
    const pngFiles = fs.readdirSync(previewImagesDir).filter(f => f.endsWith('.png'));

    // Sort files: cover, pages (numerically), back
    const sortedFiles = [];
    if (pngFiles.includes('cover.png')) sortedFiles.push('cover.png');

    const pageFiles = pngFiles.filter(f => f.startsWith('page-')).sort((a, b) => {
      const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
      const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
      return numA - numB;
    });
    sortedFiles.push(...pageFiles);

    if (pngFiles.includes('back.png')) sortedFiles.push('back.png');

    sortedFiles.forEach(f => {
      zip.addLocalFile(path.join(previewImagesDir, f));
    });

    const buff = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="preview-images-${req.params.id}.zip"`);
    res.end(buff);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create ZIP' });
  }
});

app.get('/download/:id', requireToken, async (req, res) => {
  const workDir = path.join(uploadsRoot, req.params.id);
  const outPdf = path.join(workDir, 'book-output.pdf');
  const coverPdf = path.join(workDir, 'cover.pdf');
  const backPdf = path.join(workDir, 'back.pdf');
  const previewPdf = path.join(workDir, 'book-preview.pdf');

  if (!fs.existsSync(outPdf)) return res.status(404).send('Not found');

  // If cover exists, zip both; else just send book
  if (fs.existsSync(coverPdf) || (backPdf && fs.existsSync(backPdf))) {
    const zip = new AdmZip();
    zip.addLocalFile(outPdf, '', 'book.pdf');
    if (fs.existsSync(coverPdf)) zip.addLocalFile(coverPdf, '', 'cover.pdf');
    if (backPdf && fs.existsSync(backPdf)) zip.addLocalFile(backPdf, '', 'back.pdf');

    // Use pre-generated preview PDF (created during generation phase)
    if (fs.existsSync(previewPdf)) {
      console.log(`[Download] Adding pre-generated preview PDF to zip`);
      zip.addLocalFile(previewPdf, '', 'book-preview.pdf');
    } else {
      console.warn(`[Download] Preview PDF not found at ${previewPdf}, skipping`);
    }

    const buff = zip.toBuffer();
    res.setHeader('Content-Type','application/zip');
    res.setHeader('Content-Disposition','attachment; filename="final-book.zip"');
    return res.end(buff);
  }
  res.download(outPdf, 'book.pdf');
});

// Protected static routes for files
app.use('/secure/files', requireToken, express.static(uploadsRoot));
app.get('/secure/tiffs/:id', requireToken, (req, res, next) => {
  // Delegate to the same gallery handler logic by rewriting url
  req.url = `/tiffs/${req.params.id}`;
  next();
});

// Recent jobs endpoint (reads manifests)
app.get('/api/jobs/recent', requireToken, (req, res) => {
  const limit = parseInt(req.query.limit || '20',10);
  const jobs = [];
  if (fs.existsSync(uploadsRoot)) {
    fs.readdirSync(uploadsRoot).forEach(id => {
      const manifestPath = path.join(uploadsRoot, id, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const m = JSON.parse(fs.readFileSync(manifestPath,'utf-8'));
          jobs.push({ workId: id, status: m.status, createdAt: m.createdAt, completedAt: m.completedAt, scenesCount: m.scenesCount, totalPages: m.totalPages });
        } catch(_){}
      }
    });
  }
  jobs.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json(jobs.slice(0, limit));
});

app.listen(port, () => console.log(`📘 Book UI server listening on http://localhost:${port}`));

// Gallery route for TIFFs with thumbnails
app.get('/tiffs/:id', async (req, res) => {
  const workId = req.params.id;
  const workDir = path.join(uploadsRoot, workId);
  const cmykDir = path.join(workDir, 'cmyk_tiff_images');
  if (!fs.existsSync(cmykDir)) return res.status(404).send('Not found');
  const thumbDir = path.join(workDir, 'thumbs');
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir);
  const files = fs.readdirSync(cmykDir).filter(f => f.toLowerCase().match(/\.(tiff|tif)$/));
  // Generate thumbnails if missing
  await Promise.all(files.map(async f => {
    const base = f.replace(/\.(tiff|tif)$/i,'');
    const thumbPath = path.join(thumbDir, base + '.jpg');
    if (!fs.existsSync(thumbPath)) {
      try {
        await sharp(path.join(cmykDir, f)).resize({ width: 300 }).jpeg({ quality: 80 }).toFile(thumbPath);
      } catch (e) {
        // fallback: ignore
      }
    }
  }));
  const manifestPath = path.join(workDir,'manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath,'utf-8')); } catch(_){} }
  const rows = files.map(f => {
    const base = f.replace(/\.(tiff|tif)$/i,'');
    const thumbRel = `/files/${workId}/thumbs/${base}.jpg`;
    const fullRel = `/files/${workId}/cmyk_tiff_images/${f}`;
    return `<div class="item"><a href="${fullRel}" target="_blank"><img loading="lazy" src="${thumbRel}" alt="${f}"/><span>${f}</span></a></div>`;
  }).join('\n');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!DOCTYPE html><html><head><meta charset='utf-8'/><title>TIFF Gallery ${workId}</title><style>body{font-family:system-ui,sans-serif;margin:1.5rem;background:#f5f6f8;color:#222}h1{margin-top:0} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;} .item{background:#fff;border:1px solid #e2e8f0;padding:8px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);text-align:center;} .item img{max-width:100%;height:auto;display:block;margin:0 auto 4px;border-radius:4px;} .meta{font-size:.85rem;margin-bottom:1rem;color:#555} a.dl{display:inline-block;margin-top:.5rem;font-size:.8rem;color:#2563eb;text-decoration:none} a.dl:hover{text-decoration:underline}</style></head><body><h1>TIFF Gallery – ${workId}</h1><div class='meta'>Scenes: ${manifest.scenesCount || '?'} | Created: ${manifest.createdAt || ''} | Status: ${manifest.status || ''}</div><div class='grid'>${rows}</div><p><a href="/download/${workId}" class="dl">Download PDF</a> | <a href="/files/${workId}/manifest.json" class="dl" target="_blank">Manifest JSON</a></p></body></html>`);
});
