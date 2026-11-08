#!/usr/bin/env python3
"""
Renders pages of a reference PDF (IMSLP scan, published arrangement used for checking) to PNG,
so they can be read page by page and compared with an arrangement.

    .venv/bin/python tools/arrangement/pdf_pages.py source.pdf out-prefix [first-last] [dpi=110]
"""
import sys

import pymupdf

if len(sys.argv) < 3:
    raise SystemExit(__doc__)
doc = pymupdf.open(sys.argv[1])
first, last = 1, doc.page_count
if len(sys.argv) > 3:
    a, _, b = sys.argv[3].partition("-")
    first, last = int(a), int(b or a)
dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 110
for n in range(first, min(last, doc.page_count) + 1):
    out = f"{sys.argv[2]}-{n}.png"
    doc[n - 1].get_pixmap(dpi=dpi).save(out)
    print(out)
