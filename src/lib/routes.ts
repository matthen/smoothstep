// What the URL hash asks the app (or the embedded player) to open:
//   #anim/<id>       an animation saved in this browser
//   #example/<id>    a built-in example
//   #tutorial[/<n>]  a new animation with the tutorial open at lesson n
//   #share/<data>    an animation carried in the link itself, compressed (see share.ts)
//   #url/<url>       an animation file anyone can download from that URL
//   #gist/<id>       the animation file in a GitHub gist
export type Route =
  | {kind: "anim" | "example"; id: string}
  | {kind: "tutorial"; lesson: number | null}
  | {kind: "share"; data: string}
  | {kind: "url"; url: string}
  | {kind: "gist"; id: string};

export function parseHash(hash: string): Route | null {
  const url = hash.match(/^#url\/(.+)$/);
  if (url) {
    // People may paste the URL as it is, or percent-encoded.
    let text = url[1]!;
    if (!/^https?:/i.test(text)) {
      try {
        text = decodeURIComponent(text);
      } catch {
        return null;
      }
    }
    return /^https?:\/\/[^/]/i.test(text) ? {kind: "url", url: text} : null;
  }
  // Chat apps and sentences often leave punctuation stuck to the end of a link.
  hash = hash.replace(/[.,;:!?)\]'"]+$/, "");
  const tutorial = hash.match(/^#tutorial(?:\/(\d+))?$/);
  if (tutorial) {
    // Lessons are numbered from 1 in the URL.
    return {kind: "tutorial", lesson: tutorial[1] ? Math.max(0, Number(tutorial[1]) - 1) : null};
  }
  const stored = hash.match(/^#(anim|example)\/([a-f0-9]+)$/);
  if (stored) {
    return {kind: stored[1] as "anim" | "example", id: stored[2]!};
  }
  const share = hash.match(/^#share\/([\w-]+)$/);
  if (share) {
    return {kind: "share", data: share[1]!};
  }
  // A gist's id, optionally after its owner's name, as in gist.github.com/<owner>/<id>.
  const gist = hash.match(/^#gist\/(?:[\w-]+\/)?([a-f0-9]+)$/i);
  if (gist) {
    return {kind: "gist", id: gist[1]!};
  }
  return null;
}

// A link to a shared animation that parseHash couldn't read, usually because it was cut short.
export function isBrokenShareLink(hash: string): boolean {
  return /^#(share|gist|url)\//.test(hash) && parseHash(hash) === null;
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case "tutorial":
      return "#tutorial" + (route.lesson === null ? "" : "/" + (route.lesson + 1));
    case "share":
      return "#share/" + route.data;
    case "url":
      // The URL parser percent-encodes spaces, quotes and angle brackets, so they can't break the link.
      return "#url/" + new URL(route.url).href;
    default:
      return "#" + route.kind + "/" + route.id;
  }
}

// Turns something pasted into "Open from link" into a route: a smoothstep.io link, a GitHub
// gist's page, a file on GitHub, or the address of any animation file.
export function routeFromLink(text: string): Route | null {
  const input = text.trim();
  const hashAt = input.indexOf("#");
  if (hashAt >= 0) {
    const route = parseHash(input.slice(hashAt));
    if (route) {
      return route;
    }
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  // gist.github.com/[<owner>/]<id>[/<revision>], or a file's raw address, <owner>/<id>/raw/...: open the
  // gist itself, so the link follows its latest version.
  if (url.hostname === "gist.github.com" || url.hostname === "gist.githubusercontent.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = (parts.length === 1 && url.hostname === "gist.github.com" ? parts[0] : parts[1]) ?? "";
    return /^[a-f0-9]+$/i.test(id) ? {kind: "gist", id} : null;
  }
  // github.com/<owner>/<repo>/blob/<branch>/<path> is a web page; the file itself is on raw.githubusercontent.com.
  const blob = url.hostname === "github.com" && url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (blob) {
    return {kind: "url", url: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`};
  }
  return {kind: "url", url: url.href};
}
