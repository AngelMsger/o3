# dmgbuild settings for the o3 install .dmg. Consumed by scripts/dmg.sh, which
# passes absolute paths for the app bundle, volume icon and background via -D.
#
# The window is 660x440 points; build/dmg/gen_bg_html.py renders the background
# on the matching grid, so the drag arrow lines up with the icon positions below
# (app on the left, Applications on the right, both centred at y=216).
#
# y=216 is not arbitrary: it lands each icon's filename on the pale chip painted
# on the background. The chips exist because Finder always draws the labels in
# black once a background image is set — in Dark Mode as well as Light. Move the
# icons and the labels walk off their chips onto the Void ground, where nobody
# can read them, so keep these coordinates in step with gen_bg_html.py.
#
# The exact figure comes from what Finder actually does, not from the icon box:
# it centres the filename about 84pt below the icon centre, so 216 + 84 = 300 is
# the chips' centre line. An earlier revision used 226 on the assumption that the
# label sits flush under the 128pt icon, and shipped labels that rode the bottom
# edge of their chips with the descenders hanging off.
#
# icon_size is load-bearing here too: that 84pt offset scales with the icon, so
# resizing the icon moves the text without moving the chip.
import os.path

# -D app=/abs/o3.app  -D volicon=/abs/volume.icns  -D background=/abs/background.tiff
application = defines["app"]
appname = os.path.basename(application)

# ---- image -----------------------------------------------------------------
format = "UDZO"          # zlib-compressed, matches the previous hdiutil output
size = None              # auto-size to contents

# ---- contents --------------------------------------------------------------
files = [application]
symlinks = {"Applications": "/Applications"}
icon = defines["volicon"]   # the mounted volume's icon

# ---- window / icon view ----------------------------------------------------
background = defines["background"]
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False

window_rect = ((300, 200), (660, 440))
icon_size = 128
text_size = 13
label_pos = "bottom"
arrange_by = None

icon_locations = {
    appname: (160, 216),
    "Applications": (500, 216),
}
