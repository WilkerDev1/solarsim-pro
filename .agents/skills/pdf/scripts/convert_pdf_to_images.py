import os
import sys

try:
    from pdf2image import convert_from_path
except ImportError:
    print("Error: El módulo 'pdf2image' no está instalado en el intérprete de Python.")
    print("En Arch Linux / CachyOS / Manjaro, instálalo con:")
    print("  yay -S python-pdf2image")
    print("O en un entorno virtual:")
    print("  python3 -m venv .venv && .venv/bin/pip install pdf2image")
    sys.exit(1)




def convert(pdf_path, output_dir, max_dim=1000):
    images = convert_from_path(pdf_path, dpi=200)

    for i, image in enumerate(images):
        width, height = image.size
        if width > max_dim or height > max_dim:
            scale_factor = min(max_dim / width, max_dim / height)
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            image = image.resize((new_width, new_height))
        
        image_path = os.path.join(output_dir, f"page_{i+1}.png")
        image.save(image_path)
        print(f"Saved page {i+1} as {image_path} (size: {image.size})")

    print(f"Converted {len(images)} pages to PNG images")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: convert_pdf_to_images.py [input pdf] [output directory]")
        sys.exit(1)
    pdf_path = sys.argv[1]
    output_directory = sys.argv[2]
    convert(pdf_path, output_directory)
