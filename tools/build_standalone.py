"""Build the offline, single-file apps in dist/.

Each output is one .html file with every script, the fonts and (for the MIS
deck) both workbooks inlined. It makes no network request, so it opens from a
phone, laptop, USB drive or shared folder with no internet and no server.

    dist/Facilities_MIS_Dashboard.html   MIS Command Deck (app/)
    dist/SOP_Maintenance_App.html        SOP & maintenance app (sop/)

Run after tools/build_workbooks.py:
    python3 tools/build_standalone.py
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
VENDOR = ROOT / "app" / "vendor"
CDN = {
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js": VENDOR / "three.r128.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": VENDOR / "xlsx-0.18.5.full.min.js",
}
# Scripts the page can run without (sop/register.js falls back to demo data).
OPTIONAL = {"register.js"}
FACES = [("Archivo", "archivo", w) for w in (500, 600, 700, 800)] + \
        [("IBM Plex Mono", "ibm-plex-mono", w) for w in (400, 500, 600)] + \
        [("IBM Plex Sans", "ibm-plex-sans", w) for w in (400, 500, 600)]


def font_css():
    out = []
    for family, slug, weight in FACES:
        data = base64.b64encode((VENDOR / f"fonts/{slug}-latin-{weight}-normal.woff2").read_bytes()).decode()
        out.append(f'@font-face{{font-family:"{family}";font-style:normal;font-weight:{weight};font-display:swap;'
                   f'src:url(data:font/woff2;base64,{data}) format("woff2")}}')
    return "".join(out)


def build(src_dir, dest_name, short_name, theme):
    html = (src_dir / "index.html").read_text(encoding="utf-8")

    def inline(match):
        src = match.group(1)
        path = CDN.get(src) or src_dir / src
        if src in OPTIONAL and not path.exists():
            print(f"  {src} not found; building without it")
            return ""
        code = path.read_text(encoding="utf-8")
        # A literal </script> inside a library would end the tag early.
        code = re.sub(r"</(script)", r"<\\/\1", code, flags=re.I)
        return "<script>\n" + code + "\n</script>"

    out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    assert "<script src=" not in out, "an external script was left behind"
    # Fonts: drop any Google Fonts links and embed the faces as data URIs.
    out = re.sub(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^"]+"[^>]*>\n?', "", out)
    head_extra = ('<link rel="icon" href="data:,">\n'
                  f'<meta name="theme-color" content="{theme}">\n'
                  '<meta name="mobile-web-app-capable" content="yes">\n'
                  '<meta name="apple-mobile-web-app-capable" content="yes">\n'
                  f'<meta name="apple-mobile-web-app-title" content="{short_name}">\n'
                  '<style>' + font_css() + '</style>\n')
    out = out.replace("<style>", head_extra + "<style>", 1)
    # Nothing in the page may reach the network.
    for bad in ("https://fonts.", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", 'src="http', 'href="http'):
        assert bad not in out, f"{dest_name}: external reference left: {bad}"
    dest = ROOT / "dist" / dest_name
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(out, encoding="utf-8")
    print(f"Wrote {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


build(ROOT / "app", "Facilities_MIS_Dashboard.html", "MIS Deck", "#060a0e")
build(ROOT / "sop", "SOP_Maintenance_App.html", "SOP App", "#0d7a4c")
