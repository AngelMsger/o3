# macOS Dock icon size + DMG icon & background

Date: 2026-07-15

## Problem

Three macOS packaging polish issues:

1. **Dock icon reads slightly oversized.** o3's app-icon squircle is 824x824 in the
   1024 canvas (100px padding). Measured against shipping system icons, Apple's real
   tile is smaller: Safari is 814x814 (105px padding, corner radius ~0.215 of the
   side) and TextEdit ~0.797 of canvas. o3 is ~10px (1.2 %) larger, so it sits a
   touch bigger than its Dock neighbours.
2. **DMG volume icon is the default.** `scripts/dmg.sh` runs a bare `hdiutil create`
   with no volume icon, so the mounted image shows the blank white disk.
3. **DMG window has no design.** Same bare `hdiutil create` means no background, no
   fixed icon layout, no drag-to-Applications affordance.

## Constraints

- The macOS release job runs headless in CI (`.github/workflows/release.yml`,
  `macos-latest`). The current script avoids AppleScript/Finder for that reason.
- Assets are committed, not generated in CI (mirrors today's `build/appicon.png`):
  the release job must not need Chrome or network to render art.
- Output contract unchanged: `build/bin/o3-<version>-universal.dmg`, UDZO compressed.

## Approach

Use **[dmgbuild](https://github.com/dmgbuild/dmgbuild)** (pure Python, no Finder /
AppleScript) to lay out the DMG window headlessly. Render icon and DMG art with the
existing headless-Chrome + HTML pattern already used for the app icon, and commit
the rendered assets.

## Changes

### 1. Icon retune — `build/icon/gen_icon_html.py`

Scale the whole monogram by `k = 814/824 ≈ 0.988` so the tile matches Apple's:

| field           | before | after |
|-----------------|--------|-------|
| squircle w/h    | 824    | 814   |
| left/top pad    | 100    | 105   |
| corner radius   | 185    | 176   |
| glow w/h        | 584    | 577   |
| mark font-size  | 453    | 448   |
| letter-spacing  | -17    | -16.8 |

Composition is unchanged — the same artwork fitted to the standard tile. Re-render
with `build/icon/render.sh`, copy `o3-void.png` -> `build/appicon.png` (the Void
variant is the shipping dock icon; Signal is regenerated for parity only).

### 2. DMG assets — new `build/dmg/` (committed)

- `render.sh` + HTML generator producing `background.png` at **2x** (Retina-crisp):
  Void aesthetic — deep `#06121a` radial gradient, faint teal (`#2dd4bf`) glow, small
  `o3` wordmark, "Drag o3 to Applications" caption, and a glowing teal arrow from the
  app-icon slot to the Applications slot.
- `volume.icns` — the mounted disk icon, generated from the retuned `appicon.png` via
  `iconutil`, so Finder shows the o3 mark instead of a blank disk.
- `settings.py` — dmgbuild config: volume name `o3`, window rect, `icon_size`,
  `background`, `.icns`, and fixed icon coordinates (app left, Applications symlink
  right, aligned under the arrow).

### 3. `scripts/dmg.sh` rewrite

Replace `hdiutil create` with `dmgbuild -s build/dmg/settings.py o3 <output>`. Keep
the app-bundle existence check and the output path; drop the manual staging + symlink
(settings.py declares the app and the Applications link). UDZO is dmgbuild's default.

### 4. CI + Makefile

Add a `pip install dmgbuild` step to the macOS packaging job in `release.yml`. The
`dmg` Makefile target is unchanged; note the `dmgbuild` prerequisite in a comment.

## Verification

- Build a real DMG locally (`pip install dmgbuild` + `scripts/dmg.sh`), mount it,
  screenshot the window: confirm background, arrow, app + Applications positions, and
  the volume icon all render.
- Confirm the re-rendered `build/appicon.png` measures an 814px squircle (matches
  Safari) via the alpha bounding-box check.

## Out of scope

Windows / Linux packaging, code signing / notarization, shipping the Signal (light)
icon anywhere.
