// Link to a saved animation. Animations open from the URL hash, so any static host can serve the app.
export function documentHref(id) {
  return "#anim/" + id;
}

// The documentation lives in the repo's docs/ folder.
export const DOCS_URL = "https://github.com/matthen/smoothstep/tree/main/docs";
export const TUTORIAL_URL = "https://github.com/matthen/smoothstep/blob/main/docs/tutorial/README.md";

// URL of a file in public/. Builds use PUBLIC_URL="." so they work from any path.
export function asset(path) {
  return (process.env.PUBLIC_URL || "") + path;
}
