#!/usr/bin/env python3
"""
Convert PDF pages to optimized web images for book preview.

This script extracts pages from a PDF and converts them to optimized images
suitable for web preview (JPEG format, optimized size and quality).
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image
from tqdm import tqdm

# Try to import pdf2image
try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

# Try to import PyMuPDF (independent of pdf2image)
try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

def convert_with_pdf2image(pdf_path, output_dir, dpi=150, max_width=1200, quality=85, format='JPEG'):
    """Convert PDF to images using pdf2image (requires poppler)."""
    try:
        images = convert_from_path(pdf_path, dpi=dpi)
        return images
    except Exception as e:
        # If pdf2image fails (e.g., poppler not installed), raise with helpful message
        raise RuntimeError(f"pdf2image failed (poppler may not be installed): {e}")

def convert_with_pymupdf(pdf_path, output_dir, dpi=150, max_width=1200, quality=85, format='JPEG'):
    """Convert PDF to images using PyMuPDF (pure Python)."""
    doc = fitz.open(pdf_path)
    images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        # Render page to image at specified DPI
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        # Convert to PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    doc.close()
    return images

def optimize_image(img, max_width=1200, quality=85, format='JPEG'):
    """Optimize image for web use."""
    # Convert to RGB if needed (for JPEG compatibility)
    if img.mode in ('RGBA', 'LA', 'P'):
        # Create white background for transparent images
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode in ('RGBA', 'LA'):
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        else:
            img = img.convert('RGB')
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Resize if needed
    if img.width > max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
    
    return img

def pdf_to_images(pdf_path, output_dir, dpi=150, max_width=1200, quality=85, format='JPEG', 
                  prefix='page', start_page=None, end_page=None):
    """
    Convert PDF pages to optimized web images.
    
    Args:
        pdf_path: Path to input PDF file
        output_dir: Directory to save output images
        dpi: DPI for rendering PDF pages (default: 150)
        max_width: Maximum width in pixels for output images (default: 1200)
        quality: JPEG quality (1-100, default: 85)
        format: Output format ('JPEG' or 'PNG', default: 'JPEG')
        prefix: Filename prefix for output images (default: 'page')
        start_page: First page to convert (1-indexed, None = start from beginning)
        end_page: Last page to convert (1-indexed, None = convert all)
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        print(f'❌ PDF file not found: {pdf_path}')
        sys.exit(1)
    
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine which library to use
    images = None
    if HAS_PDF2IMAGE:
        try:
            print('📄 Using pdf2image library (poppler)...')
            images = convert_with_pdf2image(pdf_path, output_dir, dpi, max_width, quality, format)
        except RuntimeError as e:
            print(f'⚠️  pdf2image failed: {e}')
            if HAS_PYMUPDF:
                print('📄 Falling back to PyMuPDF library...')
                images = convert_with_pymupdf(pdf_path, output_dir, dpi, max_width, quality, format)
            else:
                print('❌ PyMuPDF not available. Please install: pip install pymupdf')
                print('   Or install poppler for pdf2image:')
                print('   - macOS: brew install poppler')
                print('   - Linux: sudo apt-get install poppler-utils')
                sys.exit(1)
    elif HAS_PYMUPDF:
        print('📄 Using PyMuPDF library...')
        images = convert_with_pymupdf(pdf_path, output_dir, dpi, max_width, quality, format)
    else:
        print('❌ No PDF library found! Please install either:')
        print('   - pdf2image (requires poppler): pip install pdf2image')
        print('   - PyMuPDF: pip install pymupdf')
        sys.exit(1)
    
    if images is None or len(images) == 0:
        print('❌ No images extracted from PDF')
        sys.exit(1)
    
    # Apply page range if specified
    if start_page is not None:
        start_idx = max(0, start_page - 1)
    else:
        start_idx = 0
    
    if end_page is not None:
        end_idx = min(len(images), end_page)
    else:
        end_idx = len(images)
    
    images = images[start_idx:end_idx]
    
    print(f'🖼️  Converting {len(images)} pages to optimized web images...')
    print(f'   Output: {output_dir}')
    print(f'   Max width: {max_width}px, Quality: {quality}, Format: {format}')
    
    # Process and save images
    total_size = 0
    for idx, img in enumerate(tqdm(images, desc='Processing pages')):
        page_num = start_idx + idx + 1 if start_page else idx + 1
        
        # Optimize image
        optimized = optimize_image(img, max_width=max_width, quality=quality, format=format)
        
        # Save image
        filename = f'{prefix}_{page_num:04d}.{format.lower()}'
        output_path = output_dir / filename
        
        save_kwargs = {'format': format}
        if format == 'JPEG':
            save_kwargs['quality'] = quality
            save_kwargs['optimize'] = True
        
        optimized.save(output_path, **save_kwargs)
        total_size += output_path.stat().st_size
    
    # Print summary
    avg_size = total_size / len(images) if images else 0
    print(f'\n✅ Successfully converted {len(images)} pages')
    print(f'   Total size: {total_size / 1024 / 1024:.2f} MB')
    print(f'   Average per page: {avg_size / 1024:.2f} KB')
    print(f'   Output directory: {output_dir}')

def main():
    parser = argparse.ArgumentParser(
        description='Convert PDF pages to optimized web images for book preview',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert all pages with default settings
  python pdf-to-images.py book-output.pdf --output preview-images

  # Convert with custom size and quality
  python pdf-to-images.py book-output.pdf --output preview-images --max-width 800 --quality 75

  # Convert specific pages only
  python pdf-to-images.py book-output.pdf --output preview-images --start-page 1 --end-page 10

  # Convert to PNG format
  python pdf-to-images.py book-output.pdf --output preview-images --format PNG
        """
    )
    parser.add_argument('pdf', help='Input PDF file path')
    parser.add_argument('--output', '-o', default='preview-images', 
                       help='Output directory for images (default: preview-images)')
    parser.add_argument('--dpi', type=int, default=150,
                       help='DPI for rendering PDF pages (default: 150)')
    parser.add_argument('--max-width', type=int, default=1200,
                       help='Maximum width in pixels for output images (default: 1200)')
    parser.add_argument('--quality', type=int, default=85,
                       help='JPEG quality 1-100 (default: 85, only for JPEG format)')
    parser.add_argument('--format', choices=['JPEG', 'PNG'], default='JPEG',
                       help='Output image format (default: JPEG)')
    parser.add_argument('--prefix', default='page',
                       help='Filename prefix for output images (default: page)')
    parser.add_argument('--start-page', type=int,
                       help='First page to convert (1-indexed, default: first page)')
    parser.add_argument('--end-page', type=int,
                       help='Last page to convert (1-indexed, default: last page)')
    
    args = parser.parse_args()
    
    pdf_to_images(
        pdf_path=args.pdf,
        output_dir=args.output,
        dpi=args.dpi,
        max_width=args.max_width,
        quality=args.quality,
        format=args.format,
        prefix=args.prefix,
        start_page=args.start_page,
        end_page=args.end_page
    )

if __name__ == '__main__':
    main()

