// Link to a saved animation. Animations open from the URL hash, so any static host can serve the app.
export function documentHref(id) {
  return "#anim/" + id;
}

// URL of a file in public/. Builds use PUBLIC_URL="." so they work from any path.
export function asset(path) {
  return (process.env.PUBLIC_URL || "") + path;
}
