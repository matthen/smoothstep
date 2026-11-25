"""Build a JSON file indexing the textures, with a thumbnail of each. Videos' thumbnails are their
first frame, taken with ffmpeg."""

import json
import os
import subprocess

from PIL import Image

json_obj = {}


def _thumbnail_fname(fname):
    prefix = fname[:-4]
    suffix = ".jpg" if fname.endswith(".mp4") else fname[-4:]
    return f"{prefix}_thumb{suffix}"


def _video_size(fname):
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            fname,
        ],
        text=True,
    )
    width, height = out.strip().split(",")
    return int(width), int(height)


root_dir = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "..", "public", "images", "textures"
)

for dirname in os.listdir(root_dir):
    if not os.path.isdir(os.path.join(root_dir, dirname)):
        continue

    json_obj[dirname] = []
    for image in os.listdir(os.path.join(root_dir, dirname)):
        if image.endswith(("_thumb.png", "_thumb.jpg")):
            os.remove(os.path.join(root_dir, dirname, image))

    for image in sorted(os.listdir(os.path.join(root_dir, dirname))):
        if not image.endswith((".png", ".jpg", ".mp4")):
            continue

        fname = os.path.join(root_dir, dirname, image)
        thumbnail_fname = _thumbnail_fname(image)
        if image.endswith(".mp4"):
            width, height = _video_size(fname)
            subprocess.check_call(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    fname,
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=128:128:force_original_aspect_ratio=decrease",
                    "-q:v",
                    "3",
                    os.path.join(root_dir, dirname, thumbnail_fname),
                ]
            )
        else:
            image_obj = Image.open(fname)
            width, height = image_obj.size
            image_obj.thumbnail((128, 128))
            image_obj.save(os.path.join(root_dir, dirname, thumbnail_fname))

        json_obj[dirname].append(
            {
                "fname": os.path.join(dirname, image),
                "width": width,
                "height": height,
                "thumbnail_fname": os.path.join(dirname, thumbnail_fname),
            }
        )

with open(
    os.path.join(root_dir, "..", "..", "..", "src", "dialogs", "textures.json"), "w"
) as f:
    f.write(json.dumps(json_obj, indent=4, sort_keys=True))
