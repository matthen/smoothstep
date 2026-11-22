// Looking for names in GLSL code, ignoring comments.

export function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function uses(code: string, pattern: RegExp): boolean {
  return pattern.test(stripComments(code));
}
