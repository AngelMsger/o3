#!/usr/bin/env python3
"""Generate the o3 .dmg install-window background as a self-contained HTML.

Rendered at 1320x880 (2x of the 660x440 point window used by settings.py), so
every pixel here is exactly twice the icon-view point coordinate. render.sh
screenshots this, downscales it to the 1x variant, and combines both into a
Retina background.tiff.

Layout (in 2x px, so halve for the settings.py point grid):
  - app icon slot   centred at (320, 460)  -> point (160, 230)
  - Applications     centred at (1000, 460) -> point (500, 230)
  - the teal arrow between them sits at y=460 in the icon gap (px 500..820)

The dark Void palette matches the app icon (build/icon/gen_icon_html.py) and the
site: deep #06121a ground, teal #2dd4bf accents. Usage: gen_bg_html.py <font.ttf> <outdir>
"""
import base64
import pathlib
import sys

font_path, outdir = sys.argv[1], pathlib.Path(sys.argv[2])
b64 = base64.b64encode(pathlib.Path(font_path).read_bytes()).decode()

HTML = """<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face {{ font-family:'JBMono'; font-weight:800; font-style:normal;
  src:url(data:font/ttf;base64,{b64}) format('truetype'); }}
html,body {{ margin:0; padding:0; width:1320px; height:880px; }}
.win {{ position:relative; width:1320px; height:880px; overflow:hidden;
  background:radial-gradient(130% 120% at 50% -12%, #123039 0%, #0a1a20 46%, #06121a 100%); }}
/* faint teal glow pooled behind the centre / arrow */
.glow {{ position:absolute; left:50%; top:460px; width:900px; height:560px;
  transform:translate(-50%,-50%); border-radius:50%;
  background:radial-gradient(circle, rgba(45,212,191,.13) 0%, transparent 66%); }}
/* subtle hairline frame inside the window */
.frame {{ position:absolute; inset:22px; border-radius:26px;
  box-shadow: inset 0 0 0 2px rgba(45,212,191,.10); }}
.wordmark {{ position:absolute; left:0; right:0; top:86px; text-align:center;
  font-family:'JBMono',monospace; font-weight:800; font-size:132px; letter-spacing:-6px;
  color:#5df0dd; filter:drop-shadow(0 0 26px rgba(45,212,191,.55)); }}
.caption {{ position:absolute; left:0; right:0; top:268px; text-align:center;
  font-family:-apple-system,'Helvetica Neue',sans-serif; font-weight:500; font-size:34px;
  letter-spacing:1px; color:rgba(210,244,239,.72); }}
/* arrow: shaft + head, teal with a soft glow, at the icon vertical centre */
.arrow {{ position:absolute; top:460px; left:500px; width:320px; height:0;
  transform:translateY(-50%); filter:drop-shadow(0 0 16px rgba(45,212,191,.6)); }}
.shaft {{ position:absolute; top:-4px; left:0; width:262px; height:8px; border-radius:4px;
  background:linear-gradient(90deg, rgba(93,240,221,.25) 0%, #5df0dd 100%); }}
.head {{ position:absolute; top:-22px; right:0; width:0; height:0;
  border-top:22px solid transparent; border-bottom:22px solid transparent;
  border-left:34px solid #5df0dd; }}
</style></head><body>
<div class="win">
  <div class="glow"></div>
  <div class="frame"></div>
  <div class="wordmark">o3</div>
  <div class="caption">Drag&nbsp; o3 &nbsp;onto&nbsp; Applications</div>
  <div class="arrow"><div class="shaft"></div><div class="head"></div></div>
</div>
</body></html>
""".format(b64=b64)

(outdir / "bg.html").write_text(HTML)
print("wrote bg.html to", outdir)
