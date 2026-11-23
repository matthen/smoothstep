// Snippets in the completion list: starting points that Tab steps through, for the Canvas2D tab's
// JavaScript and the shader tabs' GLSL. Fields are `${n:placeholder}`, and `${0}` is where the
// cursor ends up. A leading tab is one indent.
import { snippet, type Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import { IMPORT_LINE } from '../layer/libraries';

interface SnippetSpec {
  label: string;
  // What it is, shown beside the label.
  detail: string;
  template: string;
  // An import line it needs at the top of the code.
  needs?: string;
}

const SNIPPET_SECTION = { name: 'Snippets', rank: 1 };

// The template as it reads once inserted, with each field showing its placeholder.
function snippetText(template: string): string {
  return template.replace(/[#$]\{(?:\d+:)?([^{}]*)\}/g, (_, name: string) => /^\d+$/.test(name) ? '' : name)
    .replace(/^\t+/gm, (tabs) => '  '.repeat(tabs.length));
}

function preview(template: string) {
  const pre = document.createElement('pre');
  pre.className = 'ss-snippet-preview';
  pre.textContent = snippetText(template);
  return pre;
}

// Adds the import line at the top, unless the code already imports that library.
function addImport(view: EditorView, line: string) {
  const library = IMPORT_LINE.exec(line)?.[3];
  const text = view.state.doc.toString();
  if (text.split('\n').some((l) => IMPORT_LINE.exec(l)?.[3] === library)) return;
  view.dispatch({ changes: { from: 0, insert: line + (text.startsWith('import') ? '\n' : '\n\n') } });
}

function completion({ label, detail, template, needs }: SnippetSpec): Completion {
  const insert = snippet(template);
  return {
    label, detail, type: 'snippet', section: SNIPPET_SECTION, info: () => preview(template),
    apply: (view, picked, from, to) => {
      insert(view, picked, from, to);
      if (needs) addImport(view, needs);
    },
  };
}

const CANVAS2D_SNIPPETS: SnippetSpec[] = [
  {
    label: 'draw', detail: 'draw function, run each step',
    template: 'function draw(ctx, {time, width, height, floats, textures}) {\n\tclear(ctx);\n\t${0}\n}',
  },
  {
    label: 'setup', detail: 'setup function, run once',
    template: '// Runs once before the first draw; what it returns is draw\'s data.\n' +
      '// See [setup and draw](docs/canvas2d#setup-and-draw).\n' +
      'function setup({width, height}) {\n\treturn {${1:sides}: ${2:5}};\n}',
  },
  {
    label: 'drawList', detail: 'nested list of shapes, in draw',
    template: 'drawList(ctx, [\n\tSet({fillStyle: "${1:orange}"}),\n\tDisk({center: [0, 0], radius: ${2:0.3}}),\n' +
      '\t[\n\t\tSet({strokeStyle: "white"}),\n\t\tAbsoluteLineWidth(6),\n\t\tRotate({angle: ${3:0.5}}),\n' +
      '\t\tLine({pts: [[-0.8, 0], [0.8, 0]]}),\n\t],\n]);${0}',
  },
  {
    label: 'planck', detail: 'physics: a ball falling on the ground',
    needs: 'import planck from "planck";',
    template: 'let world, ball;\n\n' +
      'function setup() {\n' +
      '\tworld = new planck.World({gravity: new planck.Vec2(0, ${1:-10})});\n' +
      '\tworld.createBody().createFixture(new planck.Edge(new planck.Vec2(-1.5, -0.9), new planck.Vec2(1.5, -0.9)));\n' +
      '\tball = world.createDynamicBody(new planck.Vec2(0, 0.8));\n' +
      '\tball.createFixture(new planck.Circle(0.1), {density: 1, restitution: ${2:0.7}});\n' +
      '}\n\n' +
      'function draw(ctx) {\n' +
      '\tworld.step(1 / 60);  // One step is a 60th of a second.\n' +
      '\tconst p = ball.getPosition();\n' +
      '\tclear(ctx);\n' +
      '\tdrawList(ctx, [\n\t\tLine({pts: [[-1.5, -0.9], [1.5, -0.9]]}),\n\t\tDisk({center: [p.x, p.y], radius: 0.1}),\n\t]);${0}\n' +
      '}',
  },
  {
    label: 'textures', detail: 'draw texture slot 0, in draw',
    template: 'const image = textures[${1:0}];\nif (image) {\n\tctx.drawImage(image, 0, 0, width, height);\n}${0}',
  },
  {
    label: 'trail', detail: 'fade the last steps, in draw',
    template: '// Rub out a little of what\'s drawn, so moving things leave fading trails.\n' +
      'ctx.globalCompositeOperation = "destination-out";\n' +
      'ctx.fillStyle = "rgba(0, 0, 0, ${1:0.05})";\n' +
      'ctx.fillRect(0, 0, width, height);\n' +
      'ctx.globalCompositeOperation = "source-over";${0}',
  },
];

// `lastFrame` is how the tab reads what it drew last frame: iPrevFrame, or its own iBuffer.
function glslSnippets(lastFrame: string): SnippetSpec[] {
  return [
    {
      label: 'mainImage', detail: 'sets each pixel\'s colour',
      template: 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n' +
        '\tvec2 uv = fragCoord / iResolution.xy;\n\t${0}\n\tfragColor = vec4(${1:uv, 0.5}, 1.0);\n}',
    },
    {
      label: 'feedback', detail: `builds on its last frame, ${lastFrame}`,
      template: 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n' +
        '\tvec2 uv = fragCoord / iResolution.xy;\n' +
        `\tvec4 last = iFrame == 0 ? vec4(0.0) : texture(${lastFrame}, uv);\n` +
        '\tvec2 p = 0.5 + 0.3 * vec2(cos(iTime), sin(iTime));\n' +
        '\tfloat spot = smoothstep(${1:0.05}, 0.0, length(uv - p));\n' +
        '\tfragColor = vec4(last.rgb * ${2:0.98} + spot, 1.0);${0}\n}',
    },
    {
      label: 'raymarch', detail: 'ray march a distance function',
      template: '// The distance from p to the nearest surface.\nfloat sdf(vec3 p) {\n\treturn length(p) - ${1:1.0};\n}\n\n' +
        'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n' +
        '\tvec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;\n' +
        '\tvec3 ro = vec3(0.0, 0.0, 3.0);\n\tvec3 rd = normalize(vec3(uv, -1.5));\n' +
        '\tfloat t = 0.0;\n\tfor (int i = 0; i < 100 && t < 20.0; i++) {\n' +
        '\t\tfloat d = sdf(ro + rd * t);\n\t\tif (d < 0.001) break;\n\t\tt += d;\n\t}\n' +
        '\tvec3 col = vec3(0.0);\n\tif (t < 20.0) {\n\t\tvec3 p = ro + rd * t;\n\t\tvec2 e = vec2(0.001, 0.0);\n' +
        '\t\tvec3 n = normalize(vec3(sdf(p + e.xyy) - sdf(p - e.xyy), sdf(p + e.yxy) - sdf(p - e.yxy),\n' +
        '\t\t\tsdf(p + e.yyx) - sdf(p - e.yyx)));\n' +
        '\t\tcol = vec3(0.1 + 0.9 * max(dot(n, normalize(vec3(1.0, 2.0, 3.0))), 0.0));\n\t}\n' +
        '\tfragColor = vec4(col, 1.0);${0}\n}',
    },
    {
      label: 'iCanvas2D', detail: 'put the Canvas2D drawing over col',
      template: 'vec4 drawn = texture(iCanvas2D, fragCoord / iResolution.xy);\n' +
        'col = col * (1.0 - drawn.a) + drawn.rgb;${0}',
    },
  ];
}

// Every snippet's template, for the test that checks their links into the docs.
export const snippetTemplates = (): string[] =>
  [...CANVAS2D_SNIPPETS, ...glslSnippets('iPrevFrame')].map(spec => spec.template);

export const canvas2dSnippetCompletions = (): Completion[] => CANVAS2D_SNIPPETS.map(completion);
export const glslSnippetCompletions = (lastFrame: string): Completion[] => glslSnippets(lastFrame).map(completion);
