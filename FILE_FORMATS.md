# smoothstep file formats

smoothstep saves one animation as a JSON file, or all of them as a zip, and opens both
(`src/archive.js`). The old hosted smoothstep.io's "Download my data" made the same zip, so
those downloads open here too.

## The document JSON

An animation is a JSON object, as produced by `App.toJSON()`:

```json
{
  "title": "Untitled animation",
  "code": "void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }",
  "duration": 12,
  "aspectRatio": [1, 1],
  "textures": [{"id": "iTexture0", "url": "special/black.png", "isUserUploaded": false}, ...],
  "variables": [{"transitions": [{"startDSecs": 10, "endDSecs": 60, "startValue": 0,
                                  "endValue": 1, "type": "smoothstep"}]}, ...]
}
```

- `textures` has 8 slots, `iTexture0` to `iTexture7`. A built-in texture's `url` is its path
  under `public/images/textures/`; an uploaded one has `isUserUploaded: true` and `url` set to
  the image's id.
- `variables` has 16 entries. Each transition runs from `startDSecs` to `endDSecs`, in
  tenths of a second, with `type` one of `step`, `linear` or `smoothstep`.
- `aspectRatio` is one of `[1,1]`, `[4,3]`, `[16,9]`, `[3,4]`, `[9,16]`.
- `buffers` is optional: up to 4 entries, `[{"code": "..."}, ...]`, read in the code as
  `iBuffer0` to `iBuffer3`. An animation with no buffers leaves it out.
- `shared` is optional: code with definitions every tab can use. An animation with none leaves it
  out.

`archive.validateDocument` checks these rules on import.

## One animation: `<title>.smoothstep.json`

File → Download saves the open animation, and the download button in File → Open saves a
stored one. Either way you get a JSON file with the uploaded images it uses embedded:

```json
{
  "format": "smoothstep-animation",
  "version": 1,
  "id": "2fc97bf7c5d3",
  "title": "My animation",
  "created": "2026-11-19T12:00:00.000Z",
  "modified": "2026-11-19T12:30:00.000Z",
  "thumbnail": "data:image/png;base64,...",
  "document": { ...the document JSON... },
  "images": {
    "<image id>": {"filename": "photo.jpg", "width": 2048, "height": 1536,
                   "data": "data:image/jpeg;base64,..."}
  }
}
```

`thumbnail` may be null. A bare document JSON (just the object above) also opens.

## Everything: `smoothstep-animations-<date>.zip`

"Download all" in File → Open saves this zip:

```
manifest.json
animations/<id>.json      the document JSON
thumbnails/<id>.png       128px preview (optional)
images/<image id>.<ext>   uploaded images: PNG, JPEG, WebP or GIF (.png/.jpg/.webp/.gif)
```

```json
{
  "format": "smoothstep-export",
  "version": 1,
  "exported": "2026-11-19T12:00:00.000Z",
  "animations": [{"id": "2fc97bf7c5d3", "title": "My animation",
                  "created": "...", "modified": "...",
                  "file": "animations/2fc97bf7c5d3.json",
                  "thumbnail": "thumbnails/2fc97bf7c5d3.png"}],
  "images": [{"id": "9a3c61e0b2d4", "filename": "photo.jpg", "width": 2048, "height": 1536,
              "created": "...", "file": "images/9a3c61e0b2d4.jpg"}]
}
```

The files may sit inside one top-level folder (as when a zip is unpacked and re-zipped);
the importer finds `manifest.json` and reads the other paths relative to it. Times are ISO
8601. Other files and fields are ignored. Zips from the old hosted site also contain a
`README.txt`, and mark an animation that couldn't be read there with `"unreadable": true`.

## Importing

- Uploaded images are at most 4096px (or the GPU's texture limit, if lower). An image's type
  is read from its bytes, whatever its file name or data URL says.
- Importing the same file twice changes nothing: an animation is skipped when one with the
  same id has the same document (comparing the JSON, ignoring key order), or, for a bare
  document or an older copy of an edited animation, when any stored animation has it.
  Identical animations with different ids are all kept.
- Ids are hex strings. An imported animation keeps its id, so links to `#anim/<id>` keep
  working. If a different animation with that id is already in the browser and is newer, the
  import is saved alongside it under a new id; otherwise the import replaces it.
- A document without `aspectRatio` (saved before aspect ratios existed) gets `[1, 1]`.
- An image whose id is already in the browser is skipped, since uploaded images never change.
- An animation whose uploaded image is missing still opens; that texture slot is black.

## Share links: `#share/<data>`

A share link carries one document JSON: compressed with raw DEFLATE (RFC 1951), then written as
base64url without padding (`src/lib/share.ts`). Texture slots holding the user's own images are
set to the empty built-in texture first, since a link can't carry the images. Links to a file
(`#url/<address>`) or a GitHub gist (`#gist/<id>`) open a `.smoothstep.json` file or a bare
document JSON. A gist's file is the first one ending in `.smoothstep.json`, or else in `.json`.
