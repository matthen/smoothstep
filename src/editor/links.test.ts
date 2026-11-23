import { describe, expect, it } from 'vitest';

import { linksIn } from './links';

describe("linksIn", () => {
  it("finds web addresses, leaving off closing punctuation", () => {
    expect(linksIn("// See https://example.com/a?b=1, or (http://x.org/y).").map(l => l.target))
      .toEqual(["https://example.com/a?b=1", "http://x.org/y"]);
  });

  it("finds places in the app named in square brackets, and nothing else in brackets", () => {
    const text = "// [Help → Tutorial], the [Sliders] tab and [iBuffer1]. Not Help → Tutorial, [Help → Nothing], a[i] or [sliders].";
    expect(linksIn(text).map(l => l.target)).toEqual(["Help → Tutorial", "Sliders", "iBuffer1"]);
    expect(linksIn(text)[0]).toMatchObject({from: 3, to: 20});
  });

  it("links the code tabs by their names, and by their old ones too", () => {
    expect(linksIn("// See [shared.glsl], [Shared GLSL] or [Shared], not [Shared JS].").map(l => l.target))
      .toEqual(["shared.glsl", "Shared GLSL", "Shared"]);
    expect(linksIn("// [Image.glsl], [Image], [Canvas2D.js], [iBuffer2.glsl], not [iBuffer4.glsl].").map(l => l.target))
      .toEqual(["Image.glsl", "Image", "Canvas2D.js", "iBuffer2.glsl"]);
  });

  it("finds Markdown links into the docs, by path or on the docs site, and leaves other Markdown links alone", () => {
    const text = "// See [drawList](docs/canvas2d#drawlist), [inputs](https://smoothstep.io/app/docs/reference.html) " +
      "and [MDN](https://developer.mozilla.org/x), not [x](docs/a b) or [y](other/page).";
    expect(linksIn(text).map(l => [l.target, l.text])).toEqual([
      ["docs/canvas2d#drawlist", "drawList"],
      ["https://smoothstep.io/app/docs/reference.html", "inputs"],
      ["https://developer.mozilla.org/x", undefined],
    ]);
    expect(linksIn(text)[0]).toMatchObject({from: 7, to: 7 + "[drawList](docs/canvas2d#drawlist)".length});
  });
});
