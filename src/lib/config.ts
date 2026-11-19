import type { TextureSlot } from './document';
import { imageURL } from './localStore';

export const REPO_URL = "https://github.com/matthen/smoothstep";
export const DOCS_URL = REPO_URL + "/tree/main/docs";
export const TUTORIAL_URL = REPO_URL + "/blob/main/docs/tutorial/README.md";

// URL of a file in public/, relative to the page so builds work from any path.
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}

// Link to a saved animation. Animations open from the URL hash, so any static host can serve the app.
export function documentHref(id: string): string {
  return "#anim/" + id;
}

export function exampleHref(id: string): string {
  return "#example/" + id;
}

// Example animations, bundled in public/examples/: <id>.json, an <id>.png thumbnail and an <id>.mp4
// preview (made by tools/makeExamplePreviews.mjs).
export interface Example {
  id: string;
  title: string;
  description: string;
  // What it shows how to use.
  teaches: string[];
  group: "basics" | "showcase";
}

export const EXAMPLES: Example[] = [
  {id: "534226b1d5ed", title: "Minimal animation", group: "basics", teaches: ["iTime"],
    description: "Colours that shift over time. The smallest animated shader."},
  {id: "6c214a0d19e4", title: "Drawing a circle", group: "basics", teaches: ["distance", "smoothstep"],
    description: "A crisp circle drawn from the distance to its centre."},
  {id: "70bef4ffb215", title: "Fractals", group: "basics", teaches: ["loops"],
    description: "A Julia set, coloured by how quickly each point escapes."},
  {id: "b2482911f435", title: "Using textures", group: "basics", teaches: ["iTexture0"],
    description: "A photo, warped with sine waves."},
  {id: "adb1df38284c", title: "Using the animation timeline", group: "basics", teaches: ["iFloat0", "timeline"],
    description: "A circle whose size and colour follow the timeline."},
  {id: "f9ad362373e4", title: "3D ray tracing", group: "basics", teaches: ["ray marching"],
    description: "A sphere on a floor, drawn by ray marching, with shadows."},
  {id: "26d46785c1f6", title: "Stateful animations - iPrevFrame", group: "basics", teaches: ["iPrevFrame"],
    description: "A cellular automaton: each frame is worked out from the last."},
  {id: "19bb8790cb0d", title: "Domain warping", group: "showcase", teaches: ["noise", "timeline"],
    description: "Fractal noise fed back into itself, like marbled paper."},
  {id: "d692b3fe2561", title: "Kaleidoscope", group: "showcase", teaches: ["iTexture0", "polar coordinates"],
    description: "A painting, mirrored into turning segments."},
  {id: "3156da0acaeb", title: "Glowing trails", group: "showcase", teaches: ["iPrevFrame"],
    description: "Dots that leave fading trails, drawn on top of the last frame."},
  {id: "bd2cdbfe233d", title: "Truchet tiles", group: "showcase", teaches: ["grids", "random numbers"],
    description: "Tiles that turn smoothly, rejoining into winding paths."},
  {id: "c6e454d960df", title: "Mirror ball in a panorama", group: "showcase",
    teaches: ["ray casting", "equirectangular", "reflection"],
    description: "A camera circles a mirror ball, lit by a 360° photo."},
  {id: "3d6489cf0694", title: "Metaballs", group: "showcase", teaches: ["fwidth", "timeline"],
    description: "Blobs that melt into each other and pull apart, following the timeline."},
];

export function examplePreview(id: string): string {
  return asset("examples/" + id + ".mp4");
}

export function exampleThumbnail(id: string): string {
  return asset("examples/" + id + ".png");
}

const MISSING_TEXTURE = "images/textures/special/black.png";

// A texture slot's image: a built-in texture, or an upload from the browser's store (black if
// this browser doesn't have that image).
export function textureURL(texture: Pick<TextureSlot, "url" | "isUserUploaded">): string {
  if (!texture.isUserUploaded) {
    return asset("images/textures/" + texture.url);
  }
  return imageURL(texture.url) ?? asset(MISSING_TEXTURE);
}
