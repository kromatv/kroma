import os.path

app = defines["app"]
background = defines["background"]
icon = defines["icon"]

name = os.path.basename(app.rstrip("/"))

format = "ULFO"
files = [app]
symlinks = {"Applications": "/Applications"}
hide_extensions = [name]

window_rect = ((200, 120), (640, 432))
default_view = "icon-view"
icon_size = 128
text_size = 13
icon_locations = {
    name: (176, 214),
    "Applications": (464, 214),
}
