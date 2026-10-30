import pymupdf
from pathlib import Path

out = Path(r"C:\Users\admin\Downloads\JOSTI\docs\manuals\build\preview")
out.mkdir(parents=True, exist_ok=True)
files = [
    Path(r"C:\Users\admin\Downloads\JOSTI\docs\manuals\JOSTI_Operations_Guide_EN.pdf"),
    Path(r"C:\Users\admin\Downloads\JOSTI\docs\manuals\JOSTI_Operations_Guide_AR.pdf"),
]
for pdf in files:
    doc = pymupdf.open(pdf)
    print("FILE", pdf.name)
    print("PAGES", doc.page_count)
    print("META", doc.metadata)
    fonts = set()
    for page in doc:
        for font in page.get_fonts():
            fonts.add(font[3])
    print("FONTS", sorted(fonts))
    text = "\n".join(page.get_text("text") for page in doc)
    sample = text[:500].replace("\n", " | ")
    print("TEXT_START", sample)
    print("HAS_JOSTI", "JOSTI" in text or "جوستي" in text)
    print("HAS_CONTENTS", "Contents" in text or "المحتويات" in text)
    print("CHARS", len(text))
    stem = "en" if pdf.name.endswith("_EN.pdf") else "ar"
    for index, page in enumerate(doc):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4), alpha=False)
        target = out / f"{stem}-{index + 1}.png"
        pix.save(target)
        print("PNG", target.name, pix.width, pix.height)
    doc.close()
