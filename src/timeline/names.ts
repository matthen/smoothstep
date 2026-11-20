// Names the code gives the timeline's variables, as in `#define radius iFloat1`, by row.
// The first name wins when a variable has more than one.
export function floatNames(code: string, count = 16): (string | null)[] {
  const names: (string | null)[] = Array.from({length: count}, () => null);
  for (const match of code.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+\(?[ \t]*iFloat(\d+)[ \t]*\)?[ \t]*(?:\/\/.*)?$/gm)) {
    const row = Number(match[2]);
    if (row < count && names[row] === null) {
      names[row] = match[1]!;
    }
  }
  return names;
}
