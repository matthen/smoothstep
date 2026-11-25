import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANIMATION_FORMAT } from './archive';
import { EMPTY_TEXTURE, newDocument, type AnimationDocument } from './document';
import { embedCode } from '../dialogs/Share';
import { isBrokenShareLink, parseHash, routeFromLink, routeHash } from './routes';
import { appLink, decodeDocument, encodeDocument, loadRoute, readAnimationFile, ShareError } from './share';

const PNG_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function withUserImage(): AnimationDocument {
  const doc = newDocument();
  doc.textures[1] = {id: "iTexture1", url: "abc123", isUserUploaded: true};
  doc.textures[2] = {id: "iTexture2", url: "photos/colourful.jpg", isUserUploaded: false};
  doc.variables[0] = {transitions: [{startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "smoothstep"}]};
  return doc;
}

function mockFetch(responses: Record<string, {status?: number; body: unknown}>) {
  const fetch = vi.fn((url: string) => {
    const response = responses[url];
    if (!response) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    const body = typeof response.body === "string" ? response.body : JSON.stringify(response.body);
    return Promise.resolve(new Response(body, {status: response.status ?? 200}));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("share links", () => {
  it("carry the animation, leaving the user's own images empty", () => {
    const doc = withUserImage();
    const data = encodeDocument(doc);
    expect(data).toMatch(/^[\w-]+$/);
    const shared = decodeDocument(data);
    expect(shared.textures[1]).toEqual({id: "iTexture1", url: EMPTY_TEXTURE, isUserUploaded: false});
    expect({...shared, textures: doc.textures}).toEqual(doc);
    expect(shared.textures[2]).toEqual(doc.textures[2]);
  });

  it("say when they've been cut short", () => {
    const data = encodeDocument(newDocument());
    expect(() => decodeDocument(data.slice(0, data.length / 2))).toThrow(ShareError);
  });

  it("round-trip through the hash", () => {
    const data = encodeDocument(newDocument());
    expect(parseHash("#share/" + data)).toEqual({kind: "share", data});
    expect(routeHash({kind: "share", data})).toBe("#share/" + data);
  });

  it("are made relative to wherever the app is served", () => {
    expect(appLink("#share/x", "app", "https://smoothstep.io/app/#example/1")).toBe("https://smoothstep.io/app/#share/x");
    expect(appLink("#share/x", "embed", "https://smoothstep.io/app/index.html")).toBe(
      "https://smoothstep.io/app/embed.html#share/x");
    expect(appLink("#gist/1", "app", "https://smoothstep.io/app/embed.html#gist/1")).toBe(
      "https://smoothstep.io/app/#gist/1");
  });
});

describe("parseHash", () => {
  it("reads file URLs, as typed or percent-encoded", () => {
    expect(parseHash("#url/https://example.com/a.json")).toEqual({kind: "url", url: "https://example.com/a.json"});
    expect(parseHash("#url/" + encodeURIComponent("https://example.com/a b.json"))).toEqual(
      {kind: "url", url: "https://example.com/a b.json"});
    expect(parseHash("#url/javascript:alert(1)")).toBeNull();
    expect(parseHash("#url/%E0%A4%A")).toBeNull();
  });

  it("reads gist ids, with or without the owner", () => {
    expect(parseHash("#gist/0123abcd")).toEqual({kind: "gist", id: "0123abcd"});
    expect(parseHash("#gist/matthen/0123abcd")).toEqual({kind: "gist", id: "0123abcd"});
  });

  it("ignores punctuation stuck to the end of a link, and spots links cut short", () => {
    expect(parseHash("#share/ab-c_1.")).toEqual({kind: "share", data: "ab-c_1"});
    expect(parseHash("#gist/0123abcd).")).toEqual({kind: "gist", id: "0123abcd"});
    expect(isBrokenShareLink("#share/")).toBe(true);
    expect(isBrokenShareLink("#url/ftp://example.com/a.json")).toBe(true);
    expect(isBrokenShareLink("#share/abc")).toBe(false);
    expect(isBrokenShareLink("#new")).toBe(false);
  });

  it("writes file URLs percent-encoded, so quotes and spaces can't break the link", () => {
    const route = {kind: "url" as const, url: 'https://example.com/a b.json?"><b>'};
    expect(routeHash(route)).toBe("#url/https://example.com/a%20b.json?%22%3E%3Cb%3E");
    expect(routeHash({kind: "url", url: "https://example.com/a%20b.json"})).toBe("#url/https://example.com/a%20b.json");
  });
});

describe("embedCode", () => {
  it("escapes the address and the title", () => {
    const doc = {...newDocument(), title: 'A "B" <c>'};
    const code = embedCode(doc, 'https://example.com/embed.html#x"><script>');
    expect(code).not.toContain("<script>");
    expect(code).toContain('src="https://example.com/embed.html#x&quot;>&lt;script>"');
    expect(code).toContain('title="A &quot;B&quot; &lt;c>"');
  });
});

describe("routeFromLink", () => {
  it("understands smoothstep.io links, gists, GitHub files and other addresses", () => {
    expect(routeFromLink(" https://smoothstep.io/app/#example/534226b1d5ed ")).toEqual(
      {kind: "example", id: "534226b1d5ed"});
    expect(routeFromLink("https://gist.github.com/someone/aa11bb22")).toEqual({kind: "gist", id: "aa11bb22"});
    expect(routeFromLink("https://gist.github.com/aa11bb22")).toEqual({kind: "gist", id: "aa11bb22"});
    // A revision's address, or a file's raw address, opens the gist itself.
    expect(routeFromLink("https://gist.github.com/someone/aa11bb22/ff00ee99")).toEqual({kind: "gist", id: "aa11bb22"});
    expect(routeFromLink("https://gist.githubusercontent.com/someone/aa11bb22/raw/ff00ee99/a.smoothstep.json"))
      .toEqual({kind: "gist", id: "aa11bb22"});
    expect(routeFromLink("https://github.com/o/r/blob/main/anims/a.smoothstep.json")).toEqual(
      {kind: "url", url: "https://raw.githubusercontent.com/o/r/main/anims/a.smoothstep.json"});
    expect(routeFromLink("https://example.com/a.json")).toEqual({kind: "url", url: "https://example.com/a.json"});
    expect(routeFromLink("not a link")).toBeNull();
    expect(routeFromLink("file:///home/a.json")).toBeNull();
  });
});

describe("readAnimationFile", () => {
  it("reads a bare document", () => {
    const loaded = readAnimationFile(JSON.stringify(newDocument()));
    expect(loaded.doc).toEqual(newDocument());
    expect(loaded.images.size).toBe(0);
  });

  it("reads a downloaded animation file with its images", () => {
    const file = {format: ANIMATION_FORMAT, version: 1, document: withUserImage(),
      images: {abc123: {filename: "a.png", width: 1, height: 1, data: PNG_DATA}, unused: {data: PNG_DATA}}};
    const loaded = readAnimationFile(JSON.stringify(file));
    expect([...loaded.images.keys()]).toEqual(["abc123"]);
    expect(loaded.images.get("abc123")!.type).toBe("image/png");
  });

  it("empties texture slots whose image isn't a built-in texture or an image id", () => {
    const doc = withUserImage();
    doc.textures[3] = {id: "iTexture3", url: "../../secret", isUserUploaded: false};
    doc.textures[4] = {id: "iTexture4", url: "/api/user", isUserUploaded: false};
    doc.textures[5] = {id: "iTexture5", url: "../x", isUserUploaded: true};
    const {textures} = readAnimationFile(JSON.stringify(doc)).doc;
    expect(textures.slice(1, 6).map(t => t.url)).toEqual(
      ["abc123", "photos/colourful.jpg", EMPTY_TEXTURE, EMPTY_TEXTURE, EMPTY_TEXTURE]);
    expect(textures[5]!.isUserUploaded).toBe(false);
  });

  it("refuses a video too big to be a texture, and keeps an unrecognised video's type", () => {
    const file = (data: string) => JSON.stringify({
      format: ANIMATION_FORMAT, version: 1, document: withUserImage(),
      images: {abc123: {filename: "clip", width: 64, height: 32, data}},
    });
    const big = "data:video/mp4;base64," + "A".repeat(Math.ceil(40 * 1024 * 1024 / 3) * 4);
    expect(() => readAnimationFile(file(big))).toThrow(ShareError);
    const {images} = readAnimationFile(file("data:video/x-m4v;base64," + btoa("not a known header")));
    expect(images.get("abc123")!.type).toBe("video/x-m4v");
  });

  it("says when a file isn't an animation", () => {
    expect(() => readAnimationFile("<html>")).toThrow("That isn't a smoothstep.io animation file.");
    expect(() => readAnimationFile('{"title": 1}')).toThrow(ShareError);
  });
});

describe("loadRoute", () => {
  it("opens a file from a URL", async () => {
    mockFetch({"https://example.com/a.json": {body: newDocument()}});
    const {doc} = await loadRoute({kind: "url", url: "https://example.com/a.json"});
    expect(doc).toEqual(newDocument());
  });

  it("explains when a site won't share its files", async () => {
    mockFetch({});
    await expect(loadRoute({kind: "url", url: "https://example.com/a.json"})).rejects.toThrow(
      /Couldn't download the animation from example.com/);
  });

  it("opens a gist's animation file, downloading it when GitHub left it out", async () => {
    const doc = {...newDocument(), title: "From a gist"};
    mockFetch({
      "https://api.github.com/gists/abc": {body: {files: {
        "notes.md": {filename: "notes.md", content: "hi"},
        "x.smoothstep.json": {filename: "x.smoothstep.json", truncated: true, raw_url: "https://gist.example/raw"},
      }}},
      "https://gist.example/raw": {body: doc},
    });
    expect((await loadRoute({kind: "gist", id: "abc"})).doc.title).toBe("From a gist");
  });

  it("says when a gist is missing or has no animation", async () => {
    mockFetch({
      "https://api.github.com/gists/gone": {status: 404, body: {}},
      "https://api.github.com/gists/text": {body: {files: {"a.txt": {filename: "a.txt", content: "hi"}}}},
    });
    await expect(loadRoute({kind: "gist", id: "gone"})).rejects.toThrow(/Couldn't find that GitHub gist/);
    await expect(loadRoute({kind: "gist", id: "text"})).rejects.toThrow(/no animation file/);
  });
});
