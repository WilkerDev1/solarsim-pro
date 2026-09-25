import sys

try:
    from pypdf import PdfReader
except ImportError:
    print("Error: El módulo 'pypdf' no está instalado en el intérprete de Python.")
    print("En Arch Linux / CachyOS / Manjaro, instálalo con:")
    print("  sudo pacman -S python-pypdf")
    print("O dentro de un entorno virtual:")
    print("  python3 -m venv .venv && .venv/bin/pip install pypdf")
    sys.exit(1)

if len(sys.argv) < 2:
    print("Uso: python check_fillable_fields.py <ruta_al_pdf>")
    sys.exit(1)

reader = PdfReader(sys.argv[1])
if reader.get_fields():
    print("This PDF has fillable form fields")
else:
    print("This PDF does not have fillable form fields; you will need to visually determine where to enter data")
