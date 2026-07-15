# dmgbuild settings for the o3 install .dmg. Consumed by scripts/dmg.sh, which
# passes absolute paths for the app bundle, volume icon and background via -D.
#
# The window is 660x440 points; build/dmg/gen_bg_html.py renders the background
# on the matching grid, so the drag arrow lines up with the icon positions below
# (app on the left, Applications on the right, both centred at y=230).
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
    appname: (160, 230),
    "Applications": (500, 230),
}
