const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { exec } = require('child_process');
const cliProgress = require('cli-progress');

// Simple CLI args parser
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const inputFolder = getArg('--input', './images');
const upscaledFolder = getArg('--upscaled', './upscaled_images');
const cmykFolder = getArg('--cmyk', './cmyk_tiff_images');
const iccProfile = getArg('--icc', './PSOcoated_v3.icc');
const machineReadable = args.includes('--mr'); // emit PROGRESS lines
const skipUpscale = args.includes('--skip-upscale'); // skip upscaling step

// Calculate required dimensions based on page size and DPI
// For 21.5cm x 21.5cm at 300 DPI: 21.5 / 2.54 * 300 = 2538 pixels
const DPI = 300;
const PAGE_SIZE_CM = 21.5; // cover and back
const REQUIRED_PX = Math.ceil((PAGE_SIZE_CM / 2.54) * DPI);
console.log(`📐 Target resolution: ${REQUIRED_PX}x${REQUIRED_PX}px for ${PAGE_SIZE_CM}cm @ ${DPI} DPI`);

// Prepare folders
if (!fs.existsSync(upscaledFolder)) fs.mkdirSync(upscaledFolder, { recursive: true });
if (!fs.existsSync(cmykFolder)) fs.mkdirSync(cmykFolder, { recursive: true });

// Step 1: Smart resize images to exact required dimensions (with parallelization)
const upscaleImages = async (files) => {
  console.log('Resizing images to target dimensions...');
  const total = files.length;
  const bar = machineReadable ? null : new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  if (bar) bar.start(total, 0);
  if (machineReadable) console.log(`PROGRESS|upscale|0|${total}`);

  const start = Date.now();
  let completed = 0;

  // Process images in parallel with limited concurrency
  const CONCURRENCY = 4;
  const processImage = async (file) => {
    const inputPath = path.join(inputFolder, file);
    const outputPath = path.join(upscaledFolder, file);

    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Smart resize: only resize if needed, use exact required dimensions
    let targetWidth = REQUIRED_PX;
    let targetHeight = REQUIRED_PX;

    // If source is already close to target (within 5%), skip resize for performance
    if (Math.abs(metadata.width - REQUIRED_PX) < REQUIRED_PX * 0.05 &&
        Math.abs(metadata.height - REQUIRED_PX) < REQUIRED_PX * 0.05) {
      // Just copy or do minimal processing
      await image.png({ quality: 100 }).toFile(outputPath);
    } else {
      // Resize to exact dimensions needed for print
      await image
        .resize({ width: targetWidth, height: targetHeight, fit: 'cover', kernel: 'lanczos3' })
        .png({ quality: 100 })
        .toFile(outputPath);
    }

    completed++;
    if (bar) bar.update(completed);
    if (machineReadable) console.log(`PROGRESS|upscale|${completed}|${total}`);
  };

  // Process files in batches with limited concurrency
  const processBatch = async (batch) => {
    return Promise.all(batch.map(file => processImage(file)));
  };

  // Split files into batches of CONCURRENCY size
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    await processBatch(batch);
  }

  if (bar) bar.stop();

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`✅ Resizing complete. Time taken: ${duration} seconds.`);
  return duration;
};

// Step 2: Convert upscaled images to CMYK TIFF (with parallelization)
const convertToCMYKTiff = async (files) => {
  console.log('Converting to CMYK TIFF...');
  const total = files.length;
  const bar = machineReadable ? null : new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  if (bar) bar.start(total, 0);
  if (machineReadable) console.log(`PROGRESS|convert|0|${total}`);

  const start = Date.now();
  let completed = 0;

  // Process images in parallel with limited concurrency (4 at a time)
  const CONCURRENCY = 4;
  const convertImage = async (file) => {
    const inputPath = path.join(upscaledFolder, file);
    const baseName = path.parse(file).name;
    const outputPath = path.join(cmykFolder, `${baseName}.tiff`);

    const command = `convert "${inputPath}" -profile "${iccProfile}" "${outputPath}"`;

    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          console.error(`❌ Error converting ${file}:`, error);
          reject(error);
          return;
        }
        completed++;
        if (bar) bar.update(completed);
        if (machineReadable) console.log(`PROGRESS|convert|${completed}|${total}`);
        resolve();
      });
    });
  };

  // Process files in batches with limited concurrency
  const processBatch = async (batch) => {
    return Promise.all(batch.map(file => convertImage(file)));
  };

  // Split files into batches of CONCURRENCY size
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    await processBatch(batch);
  }

  if (bar) bar.stop();

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`✅ CMYK TIFF conversion complete. Time taken: ${duration} seconds.`);
  return duration;
};

// 🏁 Run the full process
(async () => {
  try {
    const startTotal = Date.now();

    const files = fs.readdirSync(inputFolder).filter(file =>
      file.toLowerCase().match(/\.(png|jpg|jpeg)$/)
    ).sort();

    // Ensure cover/back (if present) appear first in deterministic order for downstream assumptions
    files.sort((a,b) => {
      const priority = name => {
        if (/^cover\./i.test(name)) return 0;
        if (/^back\./i.test(name)) return 1;
        return 2;
      };
      const pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

    if (files.length === 0) {
      console.log('❌ No PNG or JPG files found in the input folder.');
      return;
    }

    console.log(`🎯 Found ${files.length} image(s) to process.`);

    let upscaleTime = '0';
    if (skipUpscale) {
      console.log('⏭️ Skipping upscale step (--skip-upscale flag set)');
      // Copy files directly to upscaled folder without resizing
      if (machineReadable) console.log(`PROGRESS|upscale|0|${files.length}`);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const src = path.join(inputFolder, file);
        const dest = path.join(upscaledFolder, file);
        fs.copyFileSync(src, dest);
        if (machineReadable) console.log(`PROGRESS|upscale|${i + 1}|${files.length}`);
      }
      console.log('✅ Copied images without upscaling.');
    } else {
      upscaleTime = await upscaleImages(files);
    }
    const cmykTime = await convertToCMYKTiff(files);

    const totalTime = ((Date.now() - startTotal) / 1000).toFixed(2);

    console.log('\n🎉 Summary Report:');
    console.log('--------------------------');
    console.log(`Total images processed: ${files.length}`);
    console.log(`Upscaling time: ${upscaleTime} seconds`);
    console.log(`CMYK conversion time: ${cmykTime} seconds`);
    console.log(`Total time: ${totalTime} seconds`);
    console.log('✅ Process complete!');
    if (machineReadable) console.log('DONE');
  } catch (err) {
    console.error('❌ Error:', err);
    if (machineReadable) {
      console.log(`ERROR|${(err && err.message) || 'unknown'}`);
    }
    process.exit(1);
  }
})();
