#!/usr/bin/env python3
"""Generate the o3 monogram icon variants as self-contained 1024x1024 HTML.

The app icon is the "o3" wordmark in JetBrains Mono ExtraBold, centered on a
macOS-standard squircle: an 824x824 rounded rect (radius 185) inside a 1024
canvas with 100px transparent padding on every side, so the Dock renders it at
the same visual size as system icons. Void ships for dark appearance, Signal
for light. Usage: gen_icon_html.py <font.ttf> <outdir>
"""
import base64
import pathlib
import sys

font_path, outdir = sys.argv[1], pathlib.Path(sys.argv[2])
b64 = base64.b64encode(pathlib.Path(font_path).read_bytes()).decode()

HEAD = """<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face {{ font-family:'JBMono'; font-weight:800; font-style:normal;
  src:url(data:font/ttf;base64,{b64}) format('truetype'); }}
html,body {{ margin:0; padding:0; width:1024px; height:1024px; background:transparent; }}
.wrap {{ width:1024px; height:1024px; position:relative; }}
.sq {{ position:absolute; left:100px; top:100px; width:824px; height:824px;
  border-radius:185px; overflow:hidden; display:flex; align-items:center; justify-content:center; }}
.glow {{ position:absolute; left:50%; top:54%; width:584px; height:584px;
  transform:translate(-50%,-50%); border-radius:50%; }}
.hi {{ position:absolute; inset:0; }}
.mark {{ position:relative; font-family:'JBMono',monospace; font-weight:800;
  font-size:453px; letter-spacing:-17px; line-height:1; }}
</style></head><body><div class="wrap">
""".format(b64=b64)
TAIL = "</div></body></html>"

void = HEAD + """
<div class="sq" style="
  background:radial-gradient(120% 120% at 30% 8%, #123039 0%, #0a1a20 42%, #06121a 100%);
  box-shadow: inset 0 0 0 3px rgba(45,212,191,.18), inset 0 3px 0 rgba(255,255,255,.10);">
  <div class="glow" style="background:radial-gradient(circle, rgba(45,212,191,.20) 0%, transparent 62%);"></div>
  <span class="mark" style="color:#5df0dd; filter:drop-shadow(0 0 48px rgba(45,212,191,.65));">o3</span>
</div>
""" + TAIL

signal = HEAD + """
<div class="sq" style="
  background:linear-gradient(165deg,#39e6d0 0%,#2dd4bf 46%,#18b7a4 100%);
  box-shadow: inset 0 3px 0 rgba(255,255,255,.35);">
  <div class="hi" style="background:linear-gradient(180deg,rgba(255,255,255,.26),transparent 42%);"></div>
  <span class="mark" style="color:#06181a;">o3</span>
</div>
""" + TAIL

(outdir / "void.html").write_text(void)
(outdir / "signal.html").write_text(signal)
print("wrote void.html, signal.html to", outdir)
