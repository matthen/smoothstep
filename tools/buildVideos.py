"""Draws the sample video textures in public/images/textures/videos/.

Each is 256x256 and loops without a jump: everything that moves goes round a whole number of
times in the video's length. Clouds, Colour flow and Waves also tile without seams. They're
H.264 MP4, which every browser plays, Safari on iPhone and iPad included. Needs ffmpeg with
libx264. Run buildTextures.py afterwards to make their thumbnails and list them:

  uv run --with numpy python tools/buildVideos.py
  uv run --with pillow python tools/buildTextures.py
"""

import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "images", "textures", "videos")
SIZE = 256
FPS = 30
SECONDS = 4
FRAMES = FPS * SECONDS

# Pixel coordinates from 0 to 1, x across and y down.
X, Y = np.meshgrid((np.arange(SIZE) + 0.5) / SIZE, (np.arange(SIZE) + 0.5) / SIZE)
TAU = 2 * np.pi


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return np.asarray(a) * (1 - t[..., None]) + np.asarray(b) * t[..., None]


def periodic_noise(rng, cells, cells_t):
    """Value noise that repeats every 1 in x and y and every 1 in phase."""
    grid = rng.random((cells_t, cells, cells))

    def sample(x, y, phase):
        fx, fy, ft = x * cells, y * cells, np.full_like(x, phase * cells_t)
        ix, iy, it = np.floor(fx).astype(int), np.floor(fy).astype(int), np.floor(ft).astype(int)
        sx, sy, st = (smoothstep(0, 1, f - i) for f, i in ((fx, ix), (fy, iy), (ft, it)))
        value = 0
        for dt, wt in ((0, 1 - st), (1, st)):
            for dy, wy in ((0, 1 - sy), (1, sy)):
                for dx, wx in ((0, 1 - sx), (1, sx)):
                    value = value + wt * wy * wx * grid[(it + dt) % cells_t, (iy + dy) % cells, (ix + dx) % cells]
        return value

    return sample


def clouds():
    rng = np.random.default_rng(1)
    octaves = [periodic_noise(rng, 4 * 2**o, 2) for o in range(5)]

    def frame(phase):
        n = 0
        for o, noise in enumerate(octaves):
            # A quarter of the width is a whole number of every octave's cells, so the loop closes.
            n = n + 0.5**o * noise((X + phase * 0.25) % 1, Y, phase)
        n = n / sum(0.5**o for o in range(5))
        return mix([0.25, 0.5, 0.85], [1.0, 1.0, 1.0], smoothstep(0.42, 0.72, n))

    return frame


def colour_flow(phase):
    a = TAU * phase
    x = X + 0.08 * np.sin(TAU * Y * 2 + a)
    y = Y + 0.08 * np.sin(TAU * X * 2 - a)
    v = (np.sin(TAU * x + a) + np.sin(TAU * 2 * y - a) + np.sin(TAU * (x + y) + 2 * a)
         + np.sin(TAU * (x - 2 * y) - a)) / 4
    return 0.5 + 0.5 * np.cos(TAU * (0.4 * v + phase + np.array([0, 0.33, 0.67])[:, None, None])).transpose(1, 2, 0)


def test_pattern(phase):
    # A checkerboard scrolling by one period, coloured by position, with a hand going round once.
    check = ((np.floor((X - phase * 0.25) * 8) + np.floor((Y - phase * 0.25) * 8)) % 2)
    colour = np.stack([X, Y, 1 - X * 0.5 - Y * 0.5], -1) * (0.55 + 0.45 * check[..., None])
    dx, dy = X - 0.5, Y - 0.5
    r = np.hypot(dx, dy)
    angle = TAU * phase
    hand_x, hand_y = np.sin(angle), -np.cos(angle)
    along = dx * hand_x + dy * hand_y
    across = np.abs(dx * hand_y - dy * hand_x)
    hand = (1 - smoothstep(0.006, 0.012, across)) * (along > 0) * (along < 0.36)
    ring = 1 - smoothstep(0.004, 0.009, np.abs(r - 0.38))
    white = np.maximum(hand, ring)
    return mix(colour, [1.0, 1.0, 1.0], white)


def ball(phase):
    floor_y, radius = 0.82, 0.1
    # Two bounces per loop, while crossing the frame once and coming round again.
    height = np.abs(np.sin(TAU * phase))
    cy = floor_y - radius - 0.55 * height
    cx = (0.5 + phase) % 1
    sky = mix([0.06, 0.06, 0.16], [0.16, 0.12, 0.3], Y / floor_y)
    ground = np.broadcast_to(np.array([0.12, 0.3, 0.18]), sky.shape)
    image = np.where((Y < floor_y)[..., None], sky, ground)
    for ox in (-1, 0, 1):
        dx = X - (cx + ox)
        shadow = (1 - smoothstep(0.6, 1.0, np.hypot(dx / (radius * (1.2 - 0.5 * height)), (Y - floor_y - 0.02) / 0.02)))
        image = mix(image, [0.0, 0.0, 0.0], 0.5 * shadow * (1 - 0.6 * height))
        d = np.hypot(dx, Y - cy)
        inside = 1 - smoothstep(radius - 0.005, radius + 0.005, d)
        light = np.clip(1 - np.hypot(dx + 0.035, Y - cy + 0.035) / (radius * 1.6), 0, 1)
        shade = mix([0.75, 0.12, 0.08], [1.0, 0.85, 0.7], light**2)
        image = mix(image, shade, inside)
    return image


def waves(phase):
    # Waves along whole-number directions, so the surface tiles.
    height = 0
    for kx, ky, speed, amp in ((3, 1, 1, 1.0), (-2, 3, 2, 0.7), (1, -4, 1, 0.5), (5, 2, 3, 0.35), (-4, -5, 2, 0.25)):
        height = height + amp * np.sin(TAU * (kx * X + ky * Y - speed * phase))
    gy, gx = np.gradient(height)
    shine = (gx - gy) * SIZE / 40
    water = mix([0.02, 0.16, 0.32], [0.15, 0.55, 0.7], np.clip(0.5 + 0.25 * height, 0, 1))
    return mix(water, [0.9, 0.97, 1.0], smoothstep(0.3, 1.0, shine))


VIDEOS = {
    "clouds": clouds(),
    "colourflow": colour_flow,
    "testpattern": test_pattern,
    "ball": ball,
    "waves": waves,
}


def write(name, frame):
    path = os.path.join(OUT, name + ".mp4")
    ffmpeg = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{SIZE}x{SIZE}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "veryslow",
        # A key frame each half second keeps seeking quick.
        "-g", str(FPS // 2), "-movflags", "+faststart", "-an", path,
    ], stdin=subprocess.PIPE)
    for i in range(FRAMES):
        pixels = np.clip(frame(i / FRAMES) * 255 + 0.5, 0, 255).astype(np.uint8)
        ffmpeg.stdin.write(pixels.tobytes())
    ffmpeg.stdin.close()
    if ffmpeg.wait():
        raise SystemExit(f"ffmpeg failed on {name}")
    print(name, os.path.getsize(path) // 1024, "KB")


os.makedirs(OUT, exist_ok=True)
for name, frame in VIDEOS.items():
    write(name, frame)
