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

  it("links the Shared GLSL tab by its old name too", () => {
    expect(linksIn("// See [Shared GLSL] or [Shared], not [Shared JS].").map(l => l.target))
      .toEqual(["Shared GLSL", "Shared"]);
  });
});
