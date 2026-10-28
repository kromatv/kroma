import os.path
import struct

app = defines["app"]
background = defines["background"]
icon = defines["icon"]

with open(background, "rb") as png:
    width, height = struct.unpack(">II", png.read(24)[16:])

name = os.path.basename(app.rstrip("/"))

format = "ULFO"
files = [app]
symlinks = {"Applications": "/Applications"}
hide_extensions = [name]

window_rect = ((200, 120), (width, height))
default_view = "icon-view"
icon_size = 128
text_size = 13
icon_locations = {
    name: (176, 214),
    "Applications": (464, 214),
}
