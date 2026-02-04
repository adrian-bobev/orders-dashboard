import os
import sys
import json
import argparse
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from natsort import natsorted
from tqdm import tqdm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import numpy as np

# Disable stdout buffering for real-time progress reporting
sys.stdout.reconfigure(line_buffering=True)

# Try standard font (Helvetica is built-in). Keep custom for Cyrillic if needed.
FONT_PRIMARY = "Helvetica"
FONT_FALLBACK = "ShantellSans-Regular"
font_path = "./fonts/ShantellSans-Regular.ttf"
try:
    pdfmetrics.registerFont(TTFont(FONT_FALLBACK, font_path))
    # Use the fallback (Unicode TTF) as the primary so Cyrillic renders
    FONT_PRIMARY = FONT_FALLBACK
except Exception as e:
    print(f"⚠️ Could not register fallback font: {e}")

# Convert cm to points
def cm_to_points(cm_val):
    return (cm_val / 2.54) * 72

# Draw crop marks on the page
def draw_crop_marks(c, page_width, page_height, bleed_cm=0.3, mark_len=15):
    """Optionally draw crop marks if enabled via --crop-marks flag."""
    try:
        if not globals().get('CROP_MARKS_ENABLED', False):
            return
    except Exception:
        return
    trim = bleed_cm * cm
    # Left bottom
    c.line(trim - mark_len, trim, trim, trim)
    c.line(trim, trim - mark_len, trim, trim)
    # Left top
    c.line(trim - mark_len, page_height - trim, trim, page_height - trim)
    c.line(trim, page_height - trim, trim, page_height - trim + mark_len)
    # Right bottom
    c.line(page_width - trim, trim - mark_len, page_width - trim, trim)
    c.line(page_width - trim, trim, page_width - trim + mark_len, trim)
    # Right top
    c.line(page_width - trim, page_height - trim, page_width - trim + mark_len, page_height - trim)
    c.line(page_width - trim, page_height - trim, page_width - trim, page_height - trim + mark_len)

# Read text pages from markdown file
def read_text_pages_from_md(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    pages = content.split('---')
    return [page.strip() for page in pages if page.strip()]

# Cache for color extraction results to avoid re-opening images
_color_cache = {}

def extract_bg_colors(image_path):
    # Return cached result if available
    if image_path in _color_cache:
        return _color_cache[image_path]

    try:
        with Image.open(image_path) as im:
            # Resize small for speed
            small = im.convert('RGB').resize((64, 64))
            arr = np.array(small)
            avg = arr.mean(axis=(0,1))  # average color
            # Also get median to avoid outliers
            med = np.median(arr.reshape(-1,3), axis=0)
            # Blend average and median
            base = (0.5 * avg + 0.5 * med)
            r,g,b = base / 255.0

            # Calculate luminance to detect dark colors
            lum = 0.2126*r + 0.7152*g + 0.0722*b

            # If color is too dark (close to black), brighten it
            # Minimum luminance threshold of 0.25 (roughly 25% brightness)
            if lum < 0.25:
                # Scale up the color to reach minimum luminance
                scale_factor = 0.25 / lum if lum > 0 else 4.0
                r = min(r * scale_factor, 1.0)
                g = min(g * scale_factor, 1.0)
                b = min(b * scale_factor, 1.0)

            result = (r, g, b)
            _color_cache[image_path] = result
            return result
    except Exception as e:
        print(f"⚠️ Color extraction failed for {image_path}: {e}")
        result = (0.95,0.95,0.95)
        _color_cache[image_path] = result
        return result


def pick_text_color(r,g,b):
    # Relative luminance (sRGB)
    lum = 0.2126*r + 0.7152*g + 0.0722*b
    return (0,0,0) if lum > 0.6 else (1,1,1)

# Settings
input_folder = './cmyk_tiff_images'
output_pdf = 'output_book_with_crop_marks_and_bg.pdf'
markdown_file = 'text_content.md'

# --- Argparse for new JSON mode ---
parser = argparse.ArgumentParser(description='Generate book PDF either from markdown + tiff images OR from book.json + image set.')
parser.add_argument('--book-json', help='Path to book.json (activates JSON mode)')
parser.add_argument('--images-dir', help='Directory with scene images (jpg/png) when using JSON mode')
parser.add_argument('--output', help='Output PDF path override')
parser.add_argument('--cover-output', help='Output PDF path for separate cover when using --split-cover')
parser.add_argument('--mr', action='store_true', help='Emit machine-readable progress lines (PDFPAGE|current|total, PDFDONE)')
parser.add_argument('--crop-marks', action='store_true', help='Draw crop marks (disabled by default)')
parser.add_argument('--split-cover', action='store_true', help='If a cover image exists, place it in a separate cover PDF (cover.pdf) instead of first page of book')
parser.add_argument('--split-back', action='store_true', help='If a back image exists, export it to a separate back.pdf (never included in main book)')
parser.add_argument('--back-output', help='Output PDF path for separate back cover when using --split-back')
parser.add_argument('--auto-trim', action='store_true', help='Auto-detect trim size from first image aspect (square -> 19x19, else rectangular 22x15)')
parser.add_argument('--square-size-cm', type=float, default=19.0, help='Square trim size (cm) when aspect ~ 1:1 and --auto-trim enabled (default 19)')
parser.add_argument('--rect-width-cm', type=float, default=21.0, help='Rectangular (A5 landscape) width when aspect not square (default 21.0)')
parser.add_argument('--rect-height-cm', type=float, default=14.8, help='Rectangular (A5 landscape) height when aspect not square (default 14.8)')
parser.add_argument('--bleed-cm', type=float, default=0.5, help='Bleed (cm) each side added around trim area')
parser.add_argument('--page-width-cm', type=float, help='Explicit trim width (cm) overriding auto-trim logic when provided')
parser.add_argument('--page-height-cm', type=float, help='Explicit trim height (cm) overriding auto-trim logic when provided (defaults to width if omitted)')
parser.add_argument('--cover-width-cm', type=float, help='Explicit cover width (cm), defaults to page-width-cm if not provided')
parser.add_argument('--cover-height-cm', type=float, help='Explicit cover height (cm), defaults to cover-width-cm or page-height-cm if not provided')
parser.add_argument('--back-width-cm', type=float, help='Explicit back width (cm), defaults to cover-width-cm or page-width-cm if not provided')
parser.add_argument('--back-height-cm', type=float, help='Explicit back height (cm), defaults to back-width-cm or cover-height-cm or page-height-cm if not provided')
args, unknown = parser.parse_known_args()

json_mode = False
book_data = None
scene_images = []

cover_image_path = None
back_image_path = None
if args.book_json:
    json_mode = True
    with open(args.book_json, 'r', encoding='utf-8') as f:
        book_data = json.load(f)
    if not isinstance(book_data, dict):
        print('❌ book.json root must be an object')
        sys.exit(1)
    for field in ['shortDescription', 'motivationEnd', 'scenes']:
        if field not in book_data:
            print(f'❌ Missing field {field} in book.json')
            sys.exit(1)
    if not isinstance(book_data['scenes'], list):
        print('❌ scenes must be an array')
        sys.exit(1)
    # optional cover image
    for ext in ['tiff','tif','jpg','jpeg','png']:
        candidate = os.path.join(args.images_dir or os.path.dirname(args.book_json), f'cover.{ext}')
        if os.path.exists(candidate):
            cover_image_path = candidate
            break
    # optional back image
    for ext in ['tiff','tif','jpg','jpeg','png']:
        candidate = os.path.join(args.images_dir or os.path.dirname(args.book_json), f'back.{ext}')
        if os.path.exists(candidate):
            back_image_path = candidate
            break
    # collect scene images
    images_dir = args.images_dir or os.path.dirname(args.book_json)
    # Expect filenames scene_1.jpg ... or scene_1.png etc.
    for idx in range(1, len(book_data['scenes'])+1):
        found = None
        for ext in ['jpg','jpeg','png','tif','tiff']:
            candidate = os.path.join(images_dir, f'scene_{idx}.{ext}')
            if os.path.exists(candidate):
                found = candidate
                break
        if not found:
            print(f'❌ Missing image for scene_{idx}')
            sys.exit(1)
        scene_images.append(found)
    output_pdf = args.output or os.path.join(os.getcwd(), 'book-output.pdf')

# Flag global for crop marks
CROP_MARKS_ENABLED = bool(getattr(args, 'crop_marks', False))

# --- Dynamic page sizing (auto-trim or legacy square) ---
bleed_cm = getattr(args, 'bleed_cm', 0.5)
trim_width_cm = 19.0  # default square updated
trim_height_cm = 19.0

def _first_image_for_aspect():
    # Preference: cover, then first scene, then back, then first file in legacy folder
    if cover_image_path:
        return cover_image_path
    if scene_images:
        return scene_images[0]
    if back_image_path:
        return back_image_path
    try:
        for f in sorted(os.listdir(input_folder)):
            if f.lower().endswith(('.tif','.tiff','.jpg','.jpeg','.png')):
                return os.path.join(input_folder, f)
    except Exception:
        pass
    return None

if args.page_width_cm or args.page_height_cm:
    # Explicit override path
    if args.page_width_cm and args.page_height_cm:
        trim_width_cm = args.page_width_cm
        trim_height_cm = args.page_height_cm
    else:
        # If only one provided, make square
        v = args.page_width_cm or args.page_height_cm
        trim_width_cm = trim_height_cm = v
    print(f'📐 Fixed size override: {trim_width_cm}cm x {trim_height_cm}cm (bleed parameter will still be applied)')
elif getattr(args, 'auto_trim', False):
    sample = _first_image_for_aspect()
    if sample and os.path.exists(sample):
        try:
            with Image.open(sample) as im:
                w,h = im.size
            if h > 0:
                aspect = w / h
                tol = 0.02
                if abs(aspect - 1.0) <= tol:
                    trim_width_cm = trim_height_cm = args.square_size_cm
                    print(f'📐 Auto-trim: square detected (aspect {aspect:.3f}) -> {trim_width_cm}cm x {trim_height_cm}cm')
                else:
                    rect_w = args.rect_width_cm
                    rect_h = args.rect_height_cm
                    if aspect >= 1.0:
                        trim_width_cm = rect_w
                        trim_height_cm = rect_h
                    else:
                        trim_width_cm = rect_h
                        trim_height_cm = rect_w
                    print(f'📐 Auto-trim: aspect {aspect:.3f} -> {trim_width_cm}cm x {trim_height_cm}cm (rect mode)')
            else:
                print('⚠️ Auto-trim: invalid image height (0); using default square 17cm.')
        except Exception as e:
            print(f'⚠️ Auto-trim: could not read sample image ({e}); using default square 17cm.')
    else:
        print('⚠️ Auto-trim: no sample image found; using default square 17cm.')

final_width_cm = trim_width_cm + (bleed_cm * 2)
final_height_cm = trim_height_cm + (bleed_cm * 2)
page_width = cm_to_points(final_width_cm)
page_height = cm_to_points(final_height_cm)
print(f'🧾 Page size (with bleed): {final_width_cm:.3f}cm x {final_height_cm:.3f}cm | Trim: {trim_width_cm:.3f}cm x {trim_height_cm:.3f}cm | Bleed: {bleed_cm}cm')

# Calculate cover dimensions (default to book dimensions if not specified)
cover_width_cm = args.cover_width_cm if args.cover_width_cm else trim_width_cm
cover_height_cm = args.cover_height_cm if args.cover_height_cm else (args.cover_width_cm if args.cover_width_cm else trim_height_cm)
cover_final_width_cm = cover_width_cm + (bleed_cm * 2)
cover_final_height_cm = cover_height_cm + (bleed_cm * 2)
cover_page_width = cm_to_points(cover_final_width_cm)
cover_page_height = cm_to_points(cover_final_height_cm)

# Calculate back dimensions (default to cover dimensions if not specified)
back_width_cm = args.back_width_cm if args.back_width_cm else cover_width_cm
back_height_cm = args.back_height_cm if args.back_height_cm else (args.back_width_cm if args.back_width_cm else cover_height_cm)
back_final_width_cm = back_width_cm + (bleed_cm * 2)
back_final_height_cm = back_height_cm + (bleed_cm * 2)
back_page_width = cm_to_points(back_final_width_cm)
back_page_height = cm_to_points(back_final_height_cm)

# Read text pages
def wrap_and_draw_text(c, text, page_width, page_height, font_name=FONT_PRIMARY, base_font_size=26, max_width_ratio=0.7):
    font_size = base_font_size
    max_width = page_width * max_width_ratio
    line_spacing = font_size * 1.35

    def wrap_block(tb):
        lines = []
        for paragraph in tb.split('\n'):
            words = paragraph.split()
            line=''
            for w in words:
                candidate = (line + ' ' + w).strip() if line else w
                if c.stringWidth(candidate, font_name, font_size) <= max_width:
                    line = candidate
                else:
                    if line:
                        lines.append(line)
                    line = w
            if line:
                lines.append(line)
            lines.append('')
        if lines and lines[-1] == '':
            lines.pop()
        return lines

    while True:
        lines = wrap_block(text)
        effective = [l for l in lines]
        gaps = sum(1 for l in effective if l=='')
        total_height = len(effective) * line_spacing - (line_spacing * 0.3 * gaps)
        if total_height <= page_height * 0.85 or font_size < 14:
            break
        font_size -= 2
        line_spacing = font_size * 1.35

    c.setFont(font_name, font_size)
    line_spacing = font_size * 1.35
    effective = [l for l in lines]
    gaps = sum(1 for l in effective if l=='')
    total_height = len(effective) * line_spacing - (line_spacing * 0.3 * gaps)
    y_cursor = (page_height - total_height) / 2 + total_height - line_spacing
    for ln in lines:
        if ln == '':
            y_cursor -= line_spacing * 0.3
        else:
            lw = c.stringWidth(ln, font_name, font_size)
            x_pos = (page_width - lw) / 2
            c.drawString(x_pos, y_cursor, ln)
            y_cursor -= line_spacing


if not json_mode:
    # Original markdown + tiff mode
    text_pages = read_text_pages_from_md(markdown_file)
    print (f'📄 Found {len(text_pages)} text pages in markdown file.')
    image_files = [
        f for f in os.listdir(input_folder)
        if f.lower().endswith('.tiff') or f.lower().endswith('.tif')
    ]
    image_files = natsorted(image_files)
    print(f'🖼️ Found {len(image_files)} images in folder: {input_folder}')
    if not image_files or not text_pages:
        print('❌ Missing images or text pages!')
        sys.exit(1)
    if len(image_files) != len(text_pages):
        print('❌ The number of images and text pages does not match!')
        sys.exit(1)
    print(f'🎯 Creating PDF with {len(image_files)} scenes (with crop marks & soft CMYK background)...')
    c = canvas.Canvas(output_pdf, pagesize=(page_width, page_height))
    total_pages = len(image_files) * 2
    page_counter = 0
    if args.mr:
        print(f'PDFTOTAL|{total_pages}')
    pbar = tqdm(total=total_pages, desc='Generating book')
    for idx, (image_file, text) in enumerate(zip(image_files, text_pages), 1):
        image_path = os.path.join(input_folder, image_file)
        if idx % 2 != 0:
            r,g,b = extract_bg_colors(image_path)
            c.setFillColorRGB(r, g, b)
            c.rect(0,0,page_width,page_height,stroke=0,fill=1)
            tr,tg,tb = pick_text_color(r,g,b)
            c.setFillColorRGB(tr,tg,tb)
            wrap_and_draw_text(c, text, page_width, page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); pbar.update(1)
            page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
            c.drawImage(image_path, 0,0, width=page_width, height=page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); pbar.update(1)
            page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
        else:
            c.drawImage(image_path,0,0,width=page_width,height=page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); pbar.update(1)
            page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
            r,g,b = extract_bg_colors(image_path)
            c.setFillColorRGB(r,g,b)
            c.rect(0,0,page_width,page_height,stroke=0,fill=1)
            tr,tg,tb = pick_text_color(r,g,b)
            c.setFillColorRGB(tr,tg,tb)
            wrap_and_draw_text(c, text, page_width, page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); pbar.update(1)
            page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
    c.save(); pbar.close()
    if args.mr:
        print('PDFDONE')
    print(f'🎉 Book PDF created: {output_pdf}')
else:
    # JSON-driven mode
    scenes = book_data['scenes']
    print(f'📘 JSON mode: {len(scenes)} scenes; cover: {"yes" if cover_image_path else "no"} back: {"yes" if back_image_path else "no"}')
    # When splitting cover, create separate cover PDF first (if cover exists)
    cover_pdf_path = None
    if args.split_cover and cover_image_path:
        cover_pdf_path = args.cover_output
        if not cover_pdf_path:
            base_no_ext, ext = os.path.splitext(output_pdf)
            cover_pdf_path = base_no_ext + '-cover' + (ext or '.pdf')
        print(f'🧩 Splitting cover to separate PDF: {cover_pdf_path}')
        print(f'📐 Cover size: {cover_final_width_cm:.3f}cm x {cover_final_height_cm:.3f}cm | Trim: {cover_width_cm:.3f}cm x {cover_height_cm:.3f}cm')
        cover_canvas = canvas.Canvas(cover_pdf_path, pagesize=(cover_page_width, cover_page_height))
        cover_canvas.drawImage(cover_image_path, 0,0,width=cover_page_width,height=cover_page_height)
        draw_crop_marks(cover_canvas, cover_page_width, cover_page_height)
        cover_canvas.showPage()
        cover_canvas.save()
        print(f'✅ Cover PDF created: {cover_pdf_path}')

    back_pdf_path = None
    if back_image_path:
        # Generate back.pdf always for consistency (even without --split-back)
        back_pdf_path = args.back_output
        if not back_pdf_path:
            base_no_ext, ext = os.path.splitext(output_pdf)
            back_pdf_path = base_no_ext + '-back' + (ext or '.pdf')
        print(f'🧩 Creating back PDF: {back_pdf_path}')
        print(f'📐 Back size: {back_final_width_cm:.3f}cm x {back_final_height_cm:.3f}cm | Trim: {back_width_cm:.3f}cm x {back_height_cm:.3f}cm')
        try:
            back_canvas = canvas.Canvas(back_pdf_path, pagesize=(back_page_width, back_page_height))
            back_canvas.drawImage(back_image_path, 0,0,width=back_page_width,height=back_page_height)
            draw_crop_marks(back_canvas, back_page_width, back_page_height)
            back_canvas.showPage()
            back_canvas.save()
            print(f'✅ Back PDF created: {back_pdf_path}')
        except Exception as e:
            print(f'⚠️ Could not create back PDF: {e}')

    # Compute total pages for main book PDF (exclude cover if split)
    include_cover_in_main = not (args.split_cover and cover_image_path)
    # back page never included in main book if provided
    total_pages = (1 if (cover_image_path and include_cover_in_main) else 0) + 1 + (len(scenes) * 2) + 1
    c = canvas.Canvas(output_pdf, pagesize=(page_width, page_height))
    page_counter = 0
    if args.mr:
        print(f'PDFTOTAL|{total_pages}')

    # Cover page (only if not splitting or no cover image)
    if cover_image_path and include_cover_in_main:
        c.drawImage(cover_image_path, 0,0,width=page_width,height=page_height)
        draw_crop_marks(c, page_width, page_height)
        c.showPage(); page_counter += 1
        if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')

    # Short description page (white)
    c.setFillColorRGB(1,1,1)
    c.rect(0,0,page_width,page_height,stroke=0,fill=1)
    c.setFillColorRGB(0,0,0)
    wrap_and_draw_text(c, book_data['shortDescription'], page_width, page_height)
    draw_crop_marks(c, page_width, page_height)
    c.showPage(); page_counter += 1
    if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')

    # Pre-extract all colors in parallel for better performance
    print('🎨 Pre-extracting background colors from scene images...')
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(extract_bg_colors, scene_images[i]): i for i in range(len(scene_images))}
        for future in as_completed(futures):
            try:
                future.result()  # Ensure colors are cached
            except Exception as e:
                print(f'⚠️ Color extraction error: {e}')

    # Scenes loop (unchanged logic order-wise)
    for idx, scene in enumerate(scenes, 1):
        image_path = scene_images[idx-1]
        text = scene.get('sourceText_bg','').strip() or '[Empty scene text]'
        if idx % 2 != 0:
            # Text then image
            r,g,b = extract_bg_colors(image_path)
            c.setFillColorRGB(r,g,b)
            c.rect(0,0,page_width,page_height,stroke=0,fill=1)
            tr,tg,tb = pick_text_color(r,g,b)
            c.setFillColorRGB(tr,tg,tb)
            wrap_and_draw_text(c, text, page_width, page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
            c.drawImage(image_path,0,0,width=page_width,height=page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
        else:
            # Image then text
            c.drawImage(image_path,0,0,width=page_width,height=page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')
            r,g,b = extract_bg_colors(image_path)
            c.setFillColorRGB(r,g,b)
            c.rect(0,0,page_width,page_height,stroke=0,fill=1)
            tr,tg,tb = pick_text_color(r,g,b)
            c.setFillColorRGB(tr,tg,tb)
            wrap_and_draw_text(c, text, page_width, page_height)
            draw_crop_marks(c, page_width, page_height)
            c.showPage(); page_counter += 1
            if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')

    # Motivation End page
    c.setFillColorRGB(1,1,1)
    c.rect(0,0,page_width,page_height,stroke=0,fill=1)
    c.setFillColorRGB(0,0,0)
    wrap_and_draw_text(c, book_data['motivationEnd'], page_width, page_height)
    draw_crop_marks(c, page_width, page_height)
    c.showPage(); page_counter += 1
    if args.mr: print(f'PDFPAGE|{page_counter}|{total_pages}')

    c.save()
    if args.mr: print('PDFDONE')
    if (args.split_cover and cover_image_path) or back_pdf_path:
        print(f'🎉 JSON Book PDF created (main only): {output_pdf} (pages: {total_pages}); cover separate: {"yes" if cover_pdf_path else "no"}; back generated: {"yes" if back_pdf_path else "no"}')
    else:
        print(f'🎉 JSON Book PDF created: {output_pdf} (pages: {total_pages})')
