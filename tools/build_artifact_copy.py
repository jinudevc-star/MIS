"""Turn a dist/ single-file app into the body-only page claude.ai artifacts expect
(the artifact service adds its own doctype, html, head and body).

    python3 tools/build_artifact_copy.py dist/SOP_Maintenance_App.html OUT.html
"""
import re
import sys

src, dest = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()
for pat in (r"<!doctype html>\s*", r"<html[^>]*>\s*", r"</?head>\s*", r"<body>\s*", r"</body>\s*", r"</html>\s*",
            r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*'):
    s = re.sub(pat, "", s, flags=re.I)
# Libraries (SheetJS codepage tables) contain literal U+FFFD inside JS strings;
# write them as the equivalent escape so the artifact service accepts the page.
parts = re.split(r"(<script>.*?</script>)", s, flags=re.S)
s = "".join(p.replace("\ufffd", "\\uFFFD") if p.startswith("<script>") else p for p in parts)
assert "\ufffd" not in s, "U+FFFD left outside a script"
open(dest, "w", encoding="utf-8").write(s)
print("Wrote", dest, len(s) // 1024, "KB")
