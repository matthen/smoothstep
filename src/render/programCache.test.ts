import { describe, expect, it } from 'vitest';

import { ProgramCache } from './programCache';

// A cache of programs named by their source, recording which it frees.
function cache() {
  const freed: string[] = [];
  const programs = new ProgramCache<string>(p => freed.push(p));
  const build = (source: string) => {
    const program = programs.get(source) ?? source;
    programs.add(source, program);
    return program;
  };
  return {programs, freed, build};
}

describe("ProgramCache", () => {
  it("keeps each slot's program and the one before, and frees older ones", () => {
    const {programs, freed, build} = cache();
    programs.use([["image", build("a")], ["buffer0", build("b")]]);
    programs.use([["image", build("a2")], ["buffer0", build("b")]]);
    expect(freed).toEqual([]);
    expect(programs.get("a")).toBe("a");
    programs.use([["image", build("a3")]]);
    expect(freed).toEqual(["a"]);
    expect(programs.get("a")).toBeUndefined();
    expect(programs.get("b")).toBe("b");
  });

  it("frees the programs of a build that failed partway", () => {
    const {programs, freed, build} = cache();
    programs.use([["image", build("a")]]);
    build("a2");
    build("b");
    programs.prune();
    expect(freed.sort()).toEqual(["a2", "b"]);
    expect(programs.get("a")).toBe("a");
  });

  it("keeps a program two slots share until neither holds it", () => {
    const {programs, freed, build} = cache();
    programs.use([["buffer0", build("same")], ["buffer1", build("same")]]);
    programs.use([["buffer0", build("x")], ["buffer1", build("y")]]);
    programs.use([["buffer0", build("x2")]]);
    expect(freed).toEqual([]);
    programs.use([["buffer1", build("y2")]]);
    expect(freed).toEqual(["same"]);
  });

  it("keeps the probe's program after it's turned off, so showing it again needn't build it", () => {
    const {programs, freed, build} = cache();
    programs.use([["probe", build("p")]]);
    programs.use([["probe", null]]);
    programs.use([["image", build("a")]]);
    programs.use([["image", build("a2")]]);
    expect(freed).toEqual([]);
    expect(programs.get("p")).toBe("p");
  });
});
