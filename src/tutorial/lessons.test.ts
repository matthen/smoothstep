import { afterEach, describe, expect, it } from 'vitest';

import { parseHash } from '../app/routing';
import { EXAMPLES } from '../lib/config';
import { DEFAULT_CODE, newDocument, type Transition } from '../lib/document';
import { floatsUsed, LESSONS, uses, type Step, type TutorialState } from './lessons';
import * as shaders from './shaders';
import { loadProgress, openingProgress, saveProgress } from './progress';

function state(change: Partial<TutorialState> = {}): TutorialState {
  const doc = newDocument();
  return {
    code: DEFAULT_CODE, builtCode: DEFAULT_CODE, built: true, isPlaying: false, time: 0,
    variables: doc.variables, textures: doc.textures, duration: doc.duration, aspectRatio: doc.aspectRatio,
    ...change,
  };
}

// The editor with `code` typed and built.
function builtWith(code: string, change: Partial<TutorialState> = {}): TutorialState {
  return state({code, builtCode: code, built: true, ...change});
}

function step(id: string): Step {
  const found = LESSONS.flatMap(l => l.steps).find(s => s.id === id);
  if (!found) {
    throw new Error("No step " + id);
  }
  return found;
}

function check(id: string, now: TutorialState, atStart: TutorialState = state()): boolean {
  return step(id).check!(now, atStart);
}

function withTransition(row: number, transition: Partial<Transition>): TutorialState["variables"] {
  const variables = newDocument().variables;
  variables[row] = {transitions: [
    {startDSecs: 10, endDSecs: 30, startValue: 0, endValue: 0, type: "smoothstep", ...transition},
  ]};
  return variables;
}

describe("lessons", () => {
  it("have unique step ids, a task for every check, and real examples", () => {
    const ids = LESSONS.flatMap(l => l.steps.map(s => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of LESSONS.flatMap(l => l.steps)) {
      expect(s.check === undefined || s.task !== undefined, s.id).toBe(true);
      for (const id of s.examples ?? []) {
        expect(EXAMPLES.some(e => e.id === id), id).toBe(true);
      }
    }
    expect(LESSONS).toHaveLength(8);
  });

  it("finds code use, ignoring comments", () => {
    expect(uses("x = iTime;", /\biTime\b/)).toBe(true);
    expect(uses("// iTime\nx = 1.; /* iTime */", /\biTime\b/)).toBe(false);
    expect(floatsUsed("mix(a, b, iFloat0) + iFloat12; // iFloat3")).toEqual([0, 12]);
  });
});

describe("shaders", () => {
  it("each step adds to the one before", () => {
    const pairs: [string, string][] = [
      [shaders.PULSE, shaders.WAVES], [shaders.HARD_CIRCLE, shaders.SOFT_CIRCLE],
      [shaders.SOFT_CIRCLE, shaders.MOVING_CIRCLE], [shaders.TIMELINE_CIRCLE, shaders.TWO_VARIABLES],
      [shaders.TILES, shaders.ROTATED_TILES], [shaders.ROTATED_TILES, shaders.POLAR_TILES],
      [shaders.TEXTURE, shaders.WARPED_TEXTURE], [shaders.WARPED_TEXTURE, shaders.FOLDED_TEXTURE],
      [shaders.FADE, shaders.TRAIL], [shaders.TRAIL, shaders.FIRST_FRAME],
    ];
    for (const [before, after] of pairs) {
      expect(after).not.toBe(before);
    }
    expect(shaders.SOFT_CIRCLE).toContain("smoothstep(0.0, 0.01, d)");
    expect(shaders.TWO_VARIABLES).toContain("#define warmth iFloat1");
    expect(shaders.POLAR_TILES).toContain("atan(uv.y, uv.x)");
  });

  it("every step with code passes its own check once built, played and set up", () => {
    const textures = newDocument().textures;
    textures[0] = {...textures[0]!, url: "photos/a.jpg"};
    const variables = withTransition(0, {endValue: 1});
    variables[1] = withTransition(1, {endValue: 1})[1]!;
    for (const s of LESSONS.flatMap(l => l.steps)) {
      if (!s.code || !s.check || s.id === "pick-colour") {
        continue;
      }
      expect(s.check(builtWith(s.code, {isPlaying: true, textures, variables}), state()), s.id).toBe(true);
    }
  });
});

describe("lesson 1: colour from position", () => {
  it("gradient: a new build that uses iResolution", () => {
    const code = step("gradient").code!;
    expect(check("gradient", builtWith(code))).toBe(true);
    // Typed but not built, or failed to compile.
    expect(check("gradient", state({code}))).toBe(false);
    expect(check("gradient", builtWith(code, {built: false}))).toBe(false);
    // The starter shader, unchanged.
    expect(check("gradient", state(), state())).toBe(false);
  });

  it("pick a colour: built with something other than the step's code", () => {
    const code = shaders.ONE_COLOUR;
    expect(check("pick-colour", builtWith(code))).toBe(false);
    expect(check("pick-colour", builtWith(code.replace("0.95, 0.45, 0.25", "0.2, 0.8, 0.4")), builtWith(code))).toBe(true);
  });

  it("mix: rebuilt with mix()", () => {
    expect(check("mix-colours", builtWith(shaders.TWO_COLOURS), builtWith(shaders.ONE_COLOUR))).toBe(true);
    expect(check("mix-colours", builtWith(shaders.ONE_COLOUR), builtWith(shaders.GRADIENT))).toBe(false);
  });
});

describe("lesson 2: moving with time", () => {
  it("iTime: built with iTime, and played", () => {
    const atStart = builtWith(shaders.TWO_COLOURS);
    expect(check("itime", builtWith(shaders.PULSE), atStart)).toBe(false);
    expect(check("itime", builtWith(shaders.PULSE, {isPlaying: true}), atStart)).toBe(true);
    expect(check("itime", builtWith(shaders.PULSE, {time: 2.5}), atStart)).toBe(true);
    expect(check("itime", builtWith(shaders.TWO_COLOURS, {isPlaying: true}), atStart)).toBe(false);
  });

  it("shimmer: a cosine palette with iTime", () => {
    expect(check("shimmer", builtWith(shaders.SHIMMER), builtWith(shaders.WAVES))).toBe(true);
    expect(check("shimmer", builtWith(shaders.WAVES), builtWith(shaders.PULSE))).toBe(false);
  });
});

describe("lesson 3: shapes", () => {
  it("circle, soft edge, moving, two circles", () => {
    expect(check("circle", builtWith(shaders.HARD_CIRCLE))).toBe(true);
    expect(check("circle", builtWith(shaders.CENTRED))).toBe(false);
    expect(check("soft-edge", builtWith(shaders.SOFT_CIRCLE), builtWith(shaders.HARD_CIRCLE))).toBe(true);
    expect(check("soft-edge", builtWith(shaders.HARD_CIRCLE), builtWith(shaders.CENTRED))).toBe(false);
    expect(check("move-circle", builtWith(shaders.MOVING_CIRCLE), builtWith(shaders.SOFT_CIRCLE))).toBe(true);
    expect(check("move-circle", builtWith(shaders.SOFT_CIRCLE), builtWith(shaders.HARD_CIRCLE))).toBe(false);
    expect(check("two-circles", builtWith(shaders.TWO_CIRCLES), builtWith(shaders.MOVING_CIRCLE))).toBe(true);
    expect(check("two-circles", builtWith(shaders.MOVING_CIRCLE), builtWith(shaders.SOFT_CIRCLE))).toBe(false);
  });
});

describe("lesson 4: the timeline", () => {
  const code = shaders.TIMELINE_CIRCLE;

  it("a transition that changes the iFloat the code uses, played", () => {
    expect(check("define-grow", builtWith(code))).toBe(true);
    expect(check("define-grow", builtWith(shaders.SOFT_CIRCLE))).toBe(false);
    expect(code).toContain("float radius = 0.15 + 0.5 * grow;");
    // A new transition starts and ends at the same value.
    expect(check("transition", builtWith(code, {isPlaying: true, variables: withTransition(0, {})}))).toBe(false);
    expect(check("transition", builtWith(code, {variables: withTransition(0, {endValue: 0.6})}))).toBe(false);
    expect(check("transition", builtWith(code, {isPlaying: true, variables: withTransition(0, {endValue: 0.6})})))
      .toBe(true);
    // A row the code doesn't use.
    expect(check("transition", builtWith(code, {isPlaying: true, variables: withTransition(2, {endValue: 1})})))
      .toBe(false);
  });

  it("slider: a value set for an iFloat the code uses", () => {
    const variables = newDocument().variables;
    expect(check("slider", builtWith(code, {variables}))).toBe(false);
    variables[2] = {transitions: [], value: 0.5};
    expect(check("slider", builtWith(code, {variables}))).toBe(false);
    variables[0] = {transitions: [], value: 0.5};
    expect(check("slider", builtWith(code, {variables}))).toBe(true);
  });

  it("transition types: another type, or a second transition", () => {
    expect(check("transition-types", builtWith(code, {variables: withTransition(0, {endValue: 1})}))).toBe(false);
    expect(check("transition-types", builtWith(code, {variables: withTransition(0, {type: "linear"})}))).toBe(true);
    const two = withTransition(0, {endValue: 1});
    two[0]!.transitions.push({startDSecs: 40, endDSecs: 60, startValue: 1, endValue: 0, type: "smoothstep"});
    expect(check("transition-types", builtWith(code, {variables: two}))).toBe(true);
  });

  it("a second number: two animated iFloats", () => {
    const one = withTransition(0, {endValue: 1});
    expect(check("second-variable", builtWith(shaders.TWO_VARIABLES, {variables: one}))).toBe(false);
    const both = withTransition(0, {endValue: 1});
    both[1] = withTransition(1, {endValue: 1})[1]!;
    expect(check("second-variable", builtWith(shaders.TWO_VARIABLES, {variables: both}))).toBe(true);
    expect(check("second-variable", builtWith(code, {variables: both}))).toBe(false);
  });

  it("duration: changed since the step opened", () => {
    expect(check("duration", state({duration: 12}), state({duration: 12}))).toBe(false);
    expect(check("duration", state({duration: 5}), state({duration: 12}))).toBe(true);
  });
});

describe("lesson 5: patterns", () => {
  it("tiles, rotation, polar coordinates", () => {
    expect(check("tiles", builtWith(shaders.TILES))).toBe(true);
    expect(check("tiles", builtWith(shaders.TWO_CIRCLES))).toBe(false);
    expect(check("rotate", builtWith(shaders.ROTATED_TILES), builtWith(shaders.TILES))).toBe(true);
    expect(check("rotate", builtWith(shaders.TILES), builtWith(shaders.CENTRED))).toBe(false);
    expect(check("polar", builtWith(shaders.POLAR_TILES), builtWith(shaders.ROTATED_TILES))).toBe(true);
    expect(check("polar", builtWith(shaders.ROTATED_TILES), builtWith(shaders.TILES))).toBe(false);
  });
});

describe("lesson 6: textures", () => {
  it("a texture the code reads has an image", () => {
    expect(check("texture", builtWith(shaders.TEXTURE))).toBe(false);
    const textures = newDocument().textures;
    textures[0] = {...textures[0]!, url: "photos/sunflower.jpg"};
    expect(check("texture", builtWith(shaders.TEXTURE, {textures}))).toBe(true);
    const uploaded = newDocument().textures;
    uploaded[0] = {...uploaded[0]!, url: "abc123", isUserUploaded: true};
    expect(check("texture", builtWith(shaders.TEXTURE, {textures: uploaded}))).toBe(true);
    // An image in a slot the code doesn't read.
    expect(check("texture", builtWith(shaders.TEXTURE.replace("iTexture0", "iTexture3"), {textures}))).toBe(false);
    expect(check("fold", builtWith(shaders.FOLDED_TEXTURE, {textures}), builtWith(shaders.WARPED_TEXTURE))).toBe(true);
  });
});

describe("lesson 7: memory", () => {
  it("iPrevFrame played, then iFrame", () => {
    expect(check("fade", builtWith(shaders.FADE))).toBe(false);
    expect(check("fade", builtWith(shaders.FADE, {isPlaying: true}))).toBe(true);
    expect(check("trail", builtWith(shaders.TRAIL, {isPlaying: true}), builtWith(shaders.FADE))).toBe(true);
    expect(check("iframe", builtWith(shaders.FIRST_FRAME), builtWith(shaders.TRAIL))).toBe(true);
    expect(check("iframe", builtWith(shaders.TRAIL), builtWith(shaders.FADE))).toBe(false);
  });
});

describe("progress", () => {
  afterEach(() => window.localStorage.clear());

  it("starts at the beginning, and survives bad data", () => {
    expect(loadProgress()).toEqual({lesson: 0, step: 0, completed: []});
    window.localStorage.setItem("smoothstep.tutorial", "{not json");
    expect(loadProgress()).toEqual({lesson: 0, step: 0, completed: []});
    window.localStorage.setItem("smoothstep.tutorial", JSON.stringify({lesson: 99, step: 0}));
    expect(loadProgress().lesson).toBe(0);
  });

  it("is saved, and reopening starts a lesson from its first step, as the code starts afresh", () => {
    saveProgress({lesson: 1, step: 3, completed: ["red-square"]});
    expect(openingProgress(null)).toEqual({lesson: 1, step: 0, completed: ["red-square"]});
    expect(openingProgress(1)).toEqual({lesson: 1, step: 0, completed: ["red-square"]});
    expect(openingProgress(2)).toEqual({lesson: 2, step: 0, completed: ["red-square"]});
    // A step past the end of the lesson lands on its last step.
    saveProgress({lesson: 2, step: 40, completed: []});
    expect(loadProgress().step).toBe(LESSONS[2]!.steps.length - 1);
  });
});

describe("tutorial route", () => {
  it("parses #tutorial and #tutorial/<n>", () => {
    expect(parseHash("#tutorial")).toEqual({kind: "tutorial", lesson: null});
    expect(parseHash("#tutorial/2")).toEqual({kind: "tutorial", lesson: 1});
    expect(parseHash("#tutorial/x")).toBeNull();
    expect(parseHash("#example/534226b1d5ed")).toEqual({kind: "example", id: "534226b1d5ed"});
  });
});
