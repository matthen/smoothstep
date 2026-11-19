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

const MISSING_TEXTURE = "images/textures/special/black.png";

// A texture slot's image: a built-in texture, or an upload from the browser's store (black if
// this browser doesn't have that image).
export function textureURL(texture: Pick<TextureSlot, "url" | "isUserUploaded">): string {
  if (!texture.isUserUploaded) {
    return asset("images/textures/" + texture.url);
  }
  return imageURL(texture.url) ?? asset(MISSING_TEXTURE);
}
