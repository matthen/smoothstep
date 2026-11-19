"""Build a JSON file indexing the textures."""

import json
import os

from PIL import Image

json_obj = {}


def _thumbnail_fname(fname):
    prefix = fname[:-4]
    suffix = fname[-4:]
    return f"{prefix}_thumb{suffix}"


root_dir = os.path.join(
    os.path.dirname(os.path.realpath(__file__)),
    "..", "public", "images", "textures")

for dirname in os.listdir(root_dir):
    if not os.path.isdir(os.path.join(root_dir, dirname)):
        continue

    json_obj[dirname] = []
    for image in os.listdir(os.path.join(root_dir, dirname)):
        if image.endswith("_thumb.png") or image.endswith("_thumb.jpg"):
            os.remove(os.path.join(root_dir, dirname, image))

    for image in sorted(os.listdir(os.path.join(root_dir, dirname))):
        if not image.endswith(".png") and not image.endswith(".jpg"):
            continue

        fname = os.path.join(root_dir, dirname, image)
        image_obj = Image.open(fname)
        width, height = image_obj.size
        thumbnail_fname = _thumbnail_fname(image)
        image_obj.thumbnail((128, 128))
        image_obj.save(os.path.join(root_dir, dirname, thumbnail_fname))

        json_obj[dirname].append(
            dict(
                fname=os.path.join(dirname, image),
                width=width,
                height=height,
                thumbnail_fname=os.path.join(dirname, thumbnail_fname),
            )
        )

with open(os.path.join(root_dir, "..", "..", "..", "src", "textures.json"), "w") as f:
    f.write(json.dumps(json_obj, indent=4, sort_keys=True))
