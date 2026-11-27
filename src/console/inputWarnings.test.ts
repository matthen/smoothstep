import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  bufferCodes, canvasLayer, emptyTextures, emptyVariables, newDocument, parseDocument, type AnimationDocument,
} from '../lib/document';
import { inputWarnings } from './inputWarnings';

const transition = {startDSecs: 0, endDSecs: 10, startValue: 0, endValue: 1, type: "linear" as const};

function warningsFor(doc: AnimationDocument): string[] {
  const shaders = [doc.code, doc.shared ?? "", ...bufferCodes(doc)].join("\n");
  return inputWarnings(shaders, canvasLayer(doc)?.code ?? null, doc.textures, doc.variables);
}

describe("inputWarnings", () => {
  it("warns about each empty texture slot the code reads, once", () => {
    const textures = emptyTextures();
    textures[1] = {...textures[1]!, url: "photos/a.jpg"};
    textures[3] = {...textures[3]!, url: "abc123", isUserUploaded: true};
    const shader = "texture(iTexture0, uv) + texture(iTexture1, uv) + texture(iTexture3, uv) + texture(iTexture0, p)";
    const warnings = inputWarnings(shader + " // iTexture5", null, textures, emptyVariables());
    expect(warnings).toEqual([expect.stringMatching(/^iTexture0 is empty, so it reads as black\./)]);
  });

  it("warns about empty slots the Canvas2D code reads that no shader does", () => {
    const warnings = inputWarnings("texture(iTexture2, uv)", "ctx.drawImage(textures[2]); ctx.drawImage(textures [4]);",
      emptyTextures(), emptyVariables());
    expect(warnings).toEqual([
      expect.stringMatching(/^iTexture2 is empty/),
      expect.stringMatching(/^textures\[4\] is empty, so it's null\. .* iTexture4 /),
    ]);
  });

  it("warns about an iFloat the code reads that's always 0, but not one with a transition or a slider value", () => {
    const variables = emptyVariables();
    variables[1] = {transitions: [transition]};
    // Set with its slider, even to 0.
    variables[2] = {transitions: [], value: 0};
    const warnings = inputWarnings("iFloat0 + iFloat1 + iFloat2", null, emptyTextures(), variables);
    expect(warnings).toEqual([expect.stringMatching(/^iFloat0 is always 0, /)]);
  });

  it("warns about always-0 floats the Canvas2D code reads that no shader does", () => {
    const variables = emptyVariables();
    variables[1] = {transitions: [transition]};
    const warnings = inputWarnings("iFloat0", "f(floats[0], floats [1], floats[ 2 ]); // floats[3]",
      emptyTextures(), variables);
    expect(warnings).toEqual([
      expect.stringMatching(/^iFloat0 is always 0, /),
      expect.stringMatching(/^floats\[2\] is always 0, since iFloat2 /),
    ]);
  });

  it("has nothing to say about a new animation or the bundled examples", () => {
    expect(warningsFor(newDocument())).toEqual([]);
    const folder = "public/examples";
    for (const file of readdirSync(folder).filter(name => name.endsWith(".json"))) {
      const doc = parseDocument(JSON.parse(readFileSync(`${folder}/${file}`, "utf8")));
      expect(warningsFor(doc), file).toEqual([]);
    }
  });
});
