// The tutorial's shaders. Each lesson builds one animation, so each step's code is the one before
// it plus one idea.

// 1. Colour from position.

export const GRADIENT = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // uv runs from 0 to 1 across the canvas, whatever its size.
  vec2 uv = fragCoord / iResolution.xy;

  // Red grows to the right, and green grows upwards.
  fragColor = vec4(uv.x, uv.y, 0.6, 1.0);
}
`;

export const ONE_COLOUR = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // One colour, darker towards the bottom.
  vec3 colour = vec3(0.95, 0.45, 0.25);
  fragColor = vec4(colour * (0.4 + 0.6 * uv.y), 1.0);
}
`;

export const TWO_COLOURS = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // Blend from one colour on the left to another on the right.
  vec3 left = vec3(0.95, 0.45, 0.25);
  vec3 right = vec3(0.25, 0.3, 0.85);
  vec3 colour = mix(left, right, uv.x);

  fragColor = vec4(colour * (0.4 + 0.6 * uv.y), 1.0);
}
`;

// 2. Moving with time.

export const PULSE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 left = vec3(0.95, 0.45, 0.25);
  vec3 right = vec3(0.25, 0.3, 0.85);

  // sin(iTime) swings between -1 and 1, so t swings between 0 and 1.
  float t = 0.5 + 0.5 * sin(iTime);
  vec3 colour = mix(left, right, t);

  fragColor = vec4(colour * (0.4 + 0.6 * uv.y), 1.0);
}
`;

export const WAVES = PULSE.replace(
  `  // sin(iTime) swings between -1 and 1, so t swings between 0 and 1.
  float t = 0.5 + 0.5 * sin(iTime);`,
  `  // Each column swings a little later than the one to its left, which makes waves.
  float t = 0.5 + 0.5 * sin(2.0 * iTime - 12.0 * uv.x);`);

export const SHIMMER = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // A value that drifts across the canvas and over time.
  float t = uv.x + 0.3 * sin(4.0 * uv.y + iTime) + 0.1 * iTime;

  // A cosine palette: red, green and blue each follow a cosine, a third of a turn apart.
  vec3 colour = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));

  fragColor = vec4(colour, 1.0);
}
`;

// 3. Shapes.

export const CENTRED = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Centred coordinates: (0, 0) in the middle, y from -1 at the bottom to 1 at the top.
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

  // Red shows x and green shows y. Negative numbers show as black.
  fragColor = vec4(uv, 0.0, 1.0);
}
`;

export const HARD_CIRCLE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

  // The distance to the circle's edge: negative inside, positive outside.
  float radius = 0.5;
  float d = length(uv) - radius;

  // step(0.0, d) is 0 inside the circle and 1 outside.
  vec3 inside = vec3(1.0, 0.75, 0.3);
  vec3 outside = vec3(0.08, 0.08, 0.15);
  vec3 colour = mix(inside, outside, step(0.0, d));

  fragColor = vec4(colour, 1.0);
}
`;

export const SOFT_CIRCLE = HARD_CIRCLE.replace(
  `  // step(0.0, d) is 0 inside the circle and 1 outside.`,
  `  // smoothstep rises smoothly from 0 to 1 as d goes from 0.0 to 0.01.`,
).replace("step(0.0, d)", "smoothstep(0.0, 0.01, d)");

export const MOVING_CIRCLE = SOFT_CIRCLE.replace(
  `  float d = length(uv) - radius;`,
  `  vec2 centre = vec2(0.6 * sin(iTime), 0.0);
  float d = length(uv - centre) - radius;`);

export const TWO_CIRCLES = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

  // Two circles. The smaller of the two distances is inside either one.
  vec2 a = vec2(0.6 * sin(iTime), 0.0);
  vec2 b = vec2(0.0, 0.5 * cos(0.7 * iTime));
  float d = min(length(uv - a) - 0.4, length(uv - b) - 0.3);

  vec3 inside = vec3(1.0, 0.75, 0.3);
  vec3 outside = vec3(0.08, 0.08, 0.15);
  vec3 colour = mix(inside, outside, smoothstep(0.0, 0.01, d));

  fragColor = vec4(colour, 1.0);
}
`;

// 4. The timeline.

export const TIMELINE_CIRCLE = `// How much the circle has grown, from the first row of the timeline.
#define grow iFloat0

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  float radius = 0.15 + 0.5 * grow;
  float d = length(uv) - radius;

  vec3 inside = vec3(1.0, 0.75, 0.3);
  vec3 outside = vec3(0.08, 0.08, 0.15);
  vec3 colour = mix(inside, outside, smoothstep(0.0, 0.01, d));

  fragColor = vec4(colour, 1.0);
}
`;

export const TWO_VARIABLES = TIMELINE_CIRCLE.replace(
  `#define grow iFloat0
`,
  `#define grow iFloat0
// From cool (0) to warm (1), from the second row.
#define warmth iFloat1
`).replace(
  `  vec3 inside = vec3(1.0, 0.75, 0.3);`,
  `  vec3 inside = mix(vec3(0.3, 0.55, 1.0), vec3(1.0, 0.6, 0.2), warmth);`);

// 5. Patterns.

export const TILES = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

  // Tiles: fract keeps what's after the decimal point, so each tile runs from -1 to 1.
  vec2 cell = fract(3.0 * uv) * 2.0 - 1.0;

  float d = length(cell) - 0.6;
  vec3 inside = vec3(1.0, 0.75, 0.3);
  vec3 outside = vec3(0.08, 0.08, 0.15);
  vec3 colour = mix(inside, outside, smoothstep(0.0, 0.05, d));

  fragColor = vec4(colour, 1.0);
}
`;

export const ROTATED_TILES = TILES.replace(
  `  // Tiles:`,
  `  // Turn the coordinates with a rotation matrix.
  float angle = 0.3 * iTime;
  uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;

  // Tiles:`);

export const POLAR_TILES = ROTATED_TILES.replace(
  `  // Tiles: fract keeps what's after the decimal point, so each tile runs from -1 to 1.
  vec2 cell = fract(3.0 * uv) * 2.0 - 1.0;`,
  `  // Polar coordinates: how far round the centre (0 to 1), and how far out.
  vec2 polar = vec2(atan(uv.y, uv.x) / 6.28318, length(uv));

  // Tiles in polar coordinates: 12 segments round, and rings of width 1/3.
  vec2 cell = fract(polar * vec2(12.0, 3.0)) * 2.0 - 1.0;`);

// 6. Textures.

export const TEXTURE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // uv from 0 to 1 covers the whole image.
  vec2 uv = fragCoord / iResolution.xy;

  fragColor = texture(iTexture0, uv);
}
`;

export const WARPED_TEXTURE = TEXTURE.replace(
  `
  fragColor =`,
  `
  // Shift each row sideways by a wave that moves over time.
  uv.x += 0.02 * sin(10.0 * uv.y + iTime);

  fragColor =`);

export const FOLDED_TEXTURE = WARPED_TEXTURE.replace(
  `
  // Shift each row`,
  `
  // Fold the canvas in half both ways, so it mirrors about the centre.
  uv = abs(uv - 0.5) * 2.0;

  // Shift each row`);

// 7. Memory with iPrevFrame.

export const FADE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // The previous frame, a little darker.
  vec3 colour = 0.97 * texture(iPrevFrame, uv).rgb;

  fragColor = vec4(colour, 1.0);
}
`;

export const TRAIL = FADE.replace(
  `
  fragColor =`,
  `
  // A dot moving in a loop, drawn on top.
  vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  vec2 position = 0.6 * vec2(cos(1.3 * iTime), sin(2.1 * iTime));
  vec3 dotColour = 0.5 + 0.5 * cos(iTime + vec3(0.0, 2.0, 4.0));
  float inDot = 1.0 - smoothstep(0.05, 0.08, length(p - position));
  colour = max(colour, dotColour * inDot);

  fragColor =`);

export const FIRST_FRAME = TRAIL.replace(
  `
  // A dot moving`,
  `
  // The first frame starts from a gradient, which then fades away.
  if (iFrame == 0) {
    colour = 0.5 * vec3(uv, 1.0);
  }

  // A dot moving`);

// Lesson 8: a heat map in a buffer, painted by a moving dot.
export const HEAT_BUFFER = `// iBuffer0 holds heat: a number for each pixel, which can go well above 1.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // This buffer's own last frame, cooled a little.
  float heat = 0.99 * texture(iBuffer0, uv).r;

  // A dot moving in a loop heats up wherever it is.
  vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  vec2 position = 0.6 * vec2(cos(1.3 * iTime), sin(2.1 * iTime));
  heat += 0.2 * (1.0 - smoothstep(0.05, 0.1, length(p - position)));

  // Start cold.
  if (iFrame == 0) {
    heat = 0.0;
  }
  fragColor = vec4(heat, 0.0, 0.0, 1.0);
}
`;

export const HEAT_IMAGE = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // The heat that iBuffer0 holds here.
  float heat = texture(iBuffer0, uv).r;

  // Black when cold, then red, yellow, and white from a heat of 3.
  vec3 colour = clamp(vec3(heat, heat - 1.0, heat - 2.0), 0.0, 1.0);

  fragColor = vec4(colour, 1.0);
}
`;

export const SPREADING_HEAT_BUFFER = HEAT_BUFFER.replace(
  `
  // This buffer's own last frame, cooled a little.
  float heat = 0.99 * texture(iBuffer0, uv).r;`,
  `
  // The average of this pixel and its four neighbours last frame, so the heat spreads out,
  // cooled a little.
  vec2 offset = 2.0 / iResolution.xy;
  float heat = 0.99 * (
    texture(iBuffer0, uv).r +
    texture(iBuffer0, uv + vec2(offset.x, 0.0)).r +
    texture(iBuffer0, uv - vec2(offset.x, 0.0)).r +
    texture(iBuffer0, uv + vec2(0.0, offset.y)).r +
    texture(iBuffer0, uv - vec2(0.0, offset.y)).r
  ) / 5.0;`);

export const DOT_SHARED = `// Code here can be used in every tab: the image and each buffer.

// Where the dot is at time t.
vec2 dotPosition(float t) {
  return 0.6 * vec2(cos(1.3 * t), sin(2.1 * t));
}
`;

export const SHARED_HEAT_BUFFER = SPREADING_HEAT_BUFFER.replace(
  "vec2 position = 0.6 * vec2(cos(1.3 * iTime), sin(2.1 * iTime));",
  "vec2 position = dotPosition(iTime);");

export const HEAT_IMAGE_WITH_DOT = HEAT_IMAGE.replace(
  `
  fragColor =`,
  `
  // The dot itself, as a ring, from the same function the buffer uses.
  vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  float ring = 1.0 - smoothstep(0.0, 0.01, abs(length(p - dotPosition(iTime)) - 0.1));
  colour = mix(colour, vec3(0.3, 0.8, 1.0), ring);

  fragColor =`);
