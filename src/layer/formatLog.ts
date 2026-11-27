// Turns the arguments of a console.log call into one line of text, roughly as a browser's devtools
// would: strings as they are, and numbers, arrays and objects as short readable text. It runs inside
// the Canvas2D layer's worker, which gets it as source text, so it must not use anything from outside
// its own body, and gets its limits as an argument.
export function formatLogWithin(args: readonly unknown[], limits: FormatLimits): string {
  const {length: MAX_LENGTH, items: MAX_ITEMS, keys: MAX_KEYS, depth: MAX_DEPTH, string: MAX_STRING} = limits;

  const typeName = (value: object): string => {
    try {
      const prototype = Object.getPrototypeOf(value) as {constructor?: {name?: unknown}} | null;
      const name = prototype?.constructor?.name;
      return typeof name === "string" ? name : "";
    } catch {
      return "";
    }
  };

  const quote = (text: string) =>
    JSON.stringify(text.length > MAX_STRING ? text.slice(0, MAX_STRING) + "…" : text);

  const number = (n: number) => Object.is(n, -0) ? "-0" : String(n);

  const key = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name) ? name : quote(name);

  // A value that isn't an object, or null for one that is.
  const primitive = (value: unknown, depth: number): string | null => {
    switch (typeof value) {
      case "string":
        return depth === 0 ? value : quote(value);
      case "number":
        return number(value);
      case "bigint":
        return String(value) + "n";
      case "boolean":
      case "undefined":
        return String(value);
      case "symbol":
        return value.toString();
      case "function": {
        const name = (value as {name?: unknown}).name;
        return typeof name === "string" && name ? `ƒ ${name}()` : "ƒ ()";
      }
    }
    return value === null ? "null" : null;
  };

  const list = (items: string[], total: number, open: string, close: string) => {
    const more = total > items.length ? [`…${total - items.length} more`] : [];
    return open + [...items, ...more].join(", ") + close;
  };

  // An array or typed array, with the objects it's inside in `inner`.
  const arrayLike = (object: object, depth: number, inner: object[]): string => {
    const items = object as unknown as ArrayLike<unknown>;
    const prefix = Array.isArray(object) ? "" : `${typeName(object)}(${items.length}) `;
    if (depth >= MAX_DEPTH) {
      return prefix + (items.length === 0 ? "[]" : "[…]");
    }
    const shown: string[] = [];
    for (let i = 0; i < Math.min(items.length, MAX_ITEMS); i++) {
      shown.push(i in items ? format(items[i], depth + 1, inner) : "empty");
    }
    return prefix + list(shown, items.length, "[", "]");
  };

  const collection = (object: Map<unknown, unknown> | Set<unknown>, depth: number, inner: object[]): string => {
    const name = `${typeName(object)}(${object.size})`;
    if (depth >= MAX_DEPTH) {
      return name + (object.size === 0 ? " {}" : " {…}");
    }
    const shown: string[] = [];
    for (const entry of object instanceof Map ? object.entries() : object.values()) {
      if (shown.length >= MAX_ITEMS) {
        break;
      }
      shown.push(object instanceof Map
        ? `${format((entry as [unknown, unknown])[0], depth + 1, inner)} => ${format((entry as [unknown, unknown])[1], depth + 1, inner)}`
        : format(entry, depth + 1, inner));
    }
    return name + " " + list(shown, object.size, "{", "}");
  };

  // Any other object, by its own enumerable keys.
  const keyed = (object: object, depth: number, inner: object[]): string => {
    const name = typeName(object);
    const prefix = name && name !== "Object" ? name + " " : "";
    const keys = Object.keys(object);
    if (depth >= MAX_DEPTH) {
      return prefix + (keys.length === 0 ? "{}" : "{…}");
    }
    const shown = keys.slice(0, MAX_KEYS).map(k => {
      let item: string;
      try {
        item = format((object as Record<string, unknown>)[k], depth + 1, inner);
      } catch {
        item = "?";
      }
      return `${key(k)}: ${item}`;
    });
    return prefix + list(shown, keys.length, "{", "}");
  };

  const format = (value: unknown, depth: number, seen: object[]): string => {
    const text = primitive(value, depth);
    if (text !== null) {
      return text;
    }
    const object = value as object;
    if (seen.includes(object)) {
      return "[Circular]";
    }
    try {
      if (object instanceof Error) {
        return depth === 0 ? `${object.name}: ${object.message}` : `${object.name}(${quote(object.message)})`;
      }
      if (object instanceof Date) {
        return Number.isNaN(object.getTime()) ? "Invalid Date" : object.toISOString();
      }
      if (object instanceof RegExp) {
        return String(object);
      }
      const inner = [...seen, object];
      if (Array.isArray(object) || ArrayBuffer.isView(object)) {
        return arrayLike(object, depth, inner);
      }
      if (object instanceof Map || object instanceof Set) {
        return collection(object, depth, inner);
      }
      return keyed(object, depth, inner);
    } catch {
      return "[object]";
    }
  };

  // A first string can hold %s, %d, %i, %f, %o and %O, each filled from the arguments after it, and
  // %c, whose style is skipped.
  const parts: string[] = [];
  let rest = args;
  const first = args[0];
  if (typeof first === "string" && first.includes("%") && args.length > 1) {
    let next = 1;
    parts.push(first.replace(/%([sdifoOc%])/g, (match, code: string) => {
      if (code === "%") {
        return "%";
      }
      if (next >= args.length) {
        return match;
      }
      const value = args[next++];
      if (code === "c") {
        return "";
      }
      if (code === "d" || code === "i") {
        return typeof value === "bigint" ? String(value) + "n" : number(Math.trunc(Number(value)));
      }
      if (code === "f") {
        return number(Number(value));
      }
      return format(value, code === "s" ? 0 : 1, []);
    }));
    rest = args.slice(next);
  }
  for (const value of rest) {
    parts.push(format(value, 0, []));
  }
  const text = parts.join(" ");
  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + "…" : text;
}

// Longer lines are cut off; arrays, objects and nesting are shortened before that.
export interface FormatLimits {
  length: number;
  items: number;
  keys: number;
  depth: number;
  string: number;
}

export const FORMAT_LIMITS: FormatLimits = {length: 1000, items: 20, keys: 12, depth: 2, string: 200};

export function formatLog(args: readonly unknown[]): string {
  return formatLogWithin(args, FORMAT_LIMITS);
}
