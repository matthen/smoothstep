import { describe, expect, it } from 'vitest';

import { linksIn } from './links';

describe("linksIn", () => {
  it("finds web addresses, leaving off closing punctuation", () => {
    expect(linksIn("// See https://example.com/a?b=1, or (http://x.org/y).").map(l => l.text))
      .toEqual(["https://example.com/a?b=1", "http://x.org/y"]);
  });

  it("finds menu paths that name a menu item, preferring the longest", () => {
    const text = "// Help → Tutorial, File → Open from link and File → Open. Help → Nothing isn't one.";
    expect(linksIn(text).map(l => l.text)).toEqual(["Help → Tutorial", "File → Open from link", "File → Open"]);
    expect(linksIn(text)[0]).toMatchObject({from: 3, to: 18});
  });
});
