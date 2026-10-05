"""Build dist/Facilities_MIS_Dashboard.html: one self-contained file with the
3D library, spreadsheet reader, app code and both workbooks inlined, so it
opens from a phone, laptop or USB drive with no internet and no server.

Run after tools/build_workbooks.py:
    python3 tools/build_standalone.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app"
html = (APP / "index.html").read_text(encoding="utf-8")

LOCAL = {
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js": APP / "vendor/three.r128.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": APP / "vendor/xlsx-0.18.5.full.min.js",
    "mis-engine.js": APP / "mis-engine.js",
    "workbooks.js": APP / "workbooks.js",
    "stage3d.js": APP / "stage3d.js",
    "deck.js": APP / "deck.js",
}


def inline(match):
    src = match.group(1)
    code = LOCAL[src].read_text(encoding="utf-8")
    # A literal </script> inside a library would end the tag early.
    code = re.sub(r"</(script)", r"<\\/\1", code, flags=re.I)
    return "<script>\n" + code + "\n</script>"


out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
assert "<script src=" not in out, "an external script was left behind"
dest = ROOT / "dist" / "Facilities_MIS_Dashboard.html"
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding="utf-8")
print(f"Wrote {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")
