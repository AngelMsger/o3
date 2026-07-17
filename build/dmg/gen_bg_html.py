#!/usr/bin/env python3
"""Generate the o3 .dmg install-window background as a self-contained HTML.

Rendered at 1320x880 (2x of the 660x440 point window used by settings.py), so
every pixel here is exactly twice the icon-view point coordinate. render.sh
screenshots this, downscales it to the 1x variant, and combines both into a
Retina background.tiff.

Two Finder constraints drive this layout. Both are easy to get wrong and neither
shows up until you actually open the .dmg:

1. THE FILENAME LABELS ARE ALWAYS BLACK. Once a background image is set, Finder
   stops adapting the label colour to the system appearance: "o3" and
   "Applications" are drawn in black in BOTH Light and Dark Mode. Dark ground
   behind them is unreadable for everyone, not just Light Mode users, and going
   dark enough to hide them instead just yields an illegible smudge.
   See https://c-command.com/dropdmg/help/layouts

   So the black text needs somewhere pale to land. Rather than light up the
   whole icon slot — which drowns the Void ground in two big pale slabs — only
   the label line gets a chip, sized to its filename. It reads as the pill
   badge the app's own UI uses, and it is the smallest light area that does the
   job. Keep the chips' luminance high (~220+); darkening them is a regression.

2. THE BOTTOM OF THE IMAGE IS CLIPPED. Finder draws the background into the
   window's CONTENT area, so the ~28pt title bar eats the bottom of a
   window-height image, and another ~23pt goes if the user has the path bar on.
   The image stays a full 660x440 so it always covers the content area (a
   shorter image would leave a white band), but nothing meaningful may sit below
   y=381pt / 762px. Hence no full-bleed frame: the previous one was inset 11pt
   and its bottom edge was simply cut off.

Layout (2x px; halve for the settings.py point grid):
  - icon slots      centred at (320, 452) and (1000, 452) -> points (160, 226)
  - label chips     y 570..630, centred on each icon's x
  - teal arrow      y=452, spanning the gap (px 540..780)
  - safe zone ends  y=762 (=381pt); below that is plain gradient

The chips are deliberately taller and wider than the text they carry. Finder
picks its own label baseline and we cannot query it, so the padding is the
margin of error: a few points adrift still lands the text on the chip.

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
.glow {{ position:absolute; left:50%; top:452px; width:900px; height:560px;
  transform:translate(-50%,-50%); border-radius:50%;
  background:radial-gradient(circle, rgba(45,212,191,.13) 0%, transparent 66%); }}
.wordmark {{ position:absolute; left:0; right:0; top:64px; text-align:center;
  font-family:'JBMono',monospace; font-weight:800; font-size:112px; letter-spacing:-5px;
  color:#5df0dd; filter:drop-shadow(0 0 26px rgba(45,212,191,.55)); }}
.caption {{ position:absolute; left:0; right:0; top:206px; text-align:center;
  font-family:-apple-system,'Helvetica Neue',sans-serif; font-weight:500; font-size:30px;
  letter-spacing:1px; color:rgba(210,244,239,.72); }}
/* Label chips: the pale landing pad for Finder's always-black filenames (see the
   module docstring). Sized per filename — "o3" needs far less room than
   "Applications" — and centred under each icon. */
.chip {{ position:absolute; top:570px; height:60px; border-radius:30px;
  background:linear-gradient(180deg, rgba(206,238,233,.97) 0%, rgba(178,214,209,.95) 100%);
  box-shadow: 0 6px 18px rgba(0,0,0,.45),
              inset 0 0 0 2px rgba(45,212,191,.5),
              inset 0 2px 0 rgba(255,255,255,.7); }}
.chip.left {{ left:260px; width:120px; }}    /* "o3" */
.chip.right {{ left:890px; width:220px; }}   /* "Applications" */
/* arrow: shaft + head, teal with a soft glow, at the icon vertical centre. The
   shaft runs right up to the head so the two read as one mark. */
/* Gatekeeper notice: the app is unsigned, and macOS blocks the first launch
   BEFORE the app can explain anything — this window is the last thing the user
   reliably sees first, so the resolution lives here. The System Settings path
   is the only one that works on every supported macOS: Sequoia (15) removed
   the right-click→Open bypass for unsigned apps. Sits in the empty band between
   the chips (y=630) and the Finder clip line (y=762) — keep it above 762. */
.notice {{ position:absolute; left:0; right:0; top:664px; text-align:center;
  font-family:-apple-system,'Helvetica Neue',sans-serif; font-weight:500; font-size:26px;
  line-height:46px; color:rgba(210,244,239,.52); }}
.notice b {{ font-weight:600; color:rgba(210,244,239,.78); }}
.arrow {{ position:absolute; top:452px; left:540px; width:240px; height:0;
  transform:translateY(-50%); filter:drop-shadow(0 0 16px rgba(45,212,191,.6)); }}
.shaft {{ position:absolute; top:-4px; left:0; width:210px; height:8px; border-radius:4px;
  background:linear-gradient(90deg, rgba(93,240,221,.18) 0%, #5df0dd 100%); }}
.head {{ position:absolute; top:-20px; right:0; width:0; height:0;
  border-top:20px solid transparent; border-bottom:20px solid transparent;
  border-left:30px solid #5df0dd; }}
</style></head><body>
<div class="win">
  <div class="glow"></div>
  <div class="wordmark">o3</div>
  <div class="caption">Drag&nbsp; o3 &nbsp;onto&nbsp; Applications</div>
  <div class="chip left"></div>
  <div class="chip right"></div>
  <div class="arrow"><div class="shaft"></div><div class="head"></div></div>
  <div class="notice">macOS will warn on first launch — this build isn't code-signed.<br>
  Allow it via <b>System Settings → Privacy &amp; Security → "Open Anyway"</b>.</div>
</div>
</body></html>
""".format(b64=b64)

(outdir / "bg.html").write_text(HTML)
print("wrote bg.html to", outdir)
