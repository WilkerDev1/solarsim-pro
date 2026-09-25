import sys
from pypdf import PdfReader

if len(sys.argv) < 2:
    print("Usage: python check_fillable_fields.py <pdf_path>")
    sys.exit(1)

reader = PdfReader(sys.argv[1])
if reader.get_fields():
    print("This PDF has fillable form fields")
else:
    print("This PDF does not have fillable form fields; you will need to visually determine where to enter data")
