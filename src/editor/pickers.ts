// Inline value pickers drawn on canvases, ported from the old glslEditor (originally from tangram-play).
import { hsvToRgb, rgbToHsv } from './pickerValues';

export interface PickerWidget {
  dom: HTMLElement;
  width: number;
  destroy?(): void;
}

const DIM = '#8be9fd';
const FG = '#f8f8f2';
const SELECTED = '#50fa7b';

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.className = 'ss-picker-canvas';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);
  return { canvas, ctx };
}

function makeModal(className: string, width: number, height: number) {
  const dom = document.createElement('div');
  dom.className = `ss-picker ${className}`;
  dom.style.width = `${width}px`;
  dom.style.height = `${height}px`;
  return dom;
}

interface DragHandlers {
  down?(x: number, y: number, e: PointerEvent): void;
  move(x: number, y: number, e: PointerEvent): void;
  up?(): void;
}

// Pointer drags on `el` with coordinates local to it; captures the pointer so drags can leave the element.
function onDrag(el: HTMLElement, handlers: DragHandlers) {
  let active: number | null = null;
  const local = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    active = e.pointerId;
    el.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    handlers.down?.(x, y, e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    const [x, y] = local(e);
    handlers.move(x, y, e);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    handlers.up?.();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}

// A ruler that scrolls under a fixed needle: drag sideways to change the value, up and down to zoom.
// `onChange` also gets the ruler's width, the range of values it shows.
export function createFloatPicker(
  initial: number, onChange: (value: number, scale: number) => void, initialScale = 2,
): PickerWidget {
  const width = 256;
  const height = 96;
  const dom = makeModal('ss-float-picker', width, height);
  const { canvas, ctx } = makeCanvas(width, height);
  dom.appendChild(canvas);
  let value = initial;
  let zoom = 0;
  let scale = initialScale;
  let prev: [number, number] = [0, 0];

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5 + height / 2);
    ctx.lineTo(width, 0.5 + height / 2);
    ctx.stroke();

    ctx.strokeStyle = FG;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height - 18);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = FG;
    ctx.beginPath();
    ctx.moveTo(width / 2, 12);
    ctx.lineTo(width * 0.475, 0);
    ctx.lineTo(width * 0.525, 0);
    ctx.closePath();
    ctx.fill();

    // Ticks at three scales from ... 0.1, 0.5, 1, 5, 10, ...
    const rough = 10 ** Math.floor(Math.log10(scale));
    const scales = 5 * rough < scale ? [5 * rough, rough, rough / 2] : [rough, rough / 2, rough / 10];
    const minVal = value - scale / 2;
    const maxVal = value + scale / 2;
    const isMultiple = (x: number, y: number) => Math.abs(y * Math.round(Math.abs(x) / y) - Math.abs(x)) < 1e-6;
    ctx.font = '12px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = DIM;
    ctx.beginPath();
    scales.forEach((step, i) => {
      const tick = Math.max(3, height * 0.35 * Math.exp((-0.1 * scale) / step));
      for (let x = step * Math.floor(minVal / step); x < maxVal; x += step) {
        if (scales.slice(0, i).some((s) => isMultiple(x, s))) continue;
        const px = (width * (x - minVal)) / scale;
        ctx.moveTo(px, height / 2 - tick);
        ctx.lineTo(px, height / 2 + tick);
        if (scale / step < 5) {
          const places = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
          ctx.fillText(x.toFixed(places), px, height - 16);
        }
      }
    });
    ctx.stroke();
  };

  // A finger wobbles, so a touch drag either slides or zooms, decided by its first few pixels.
  let axis: 'both' | 'x' | 'y' | null = 'both';
  let start: [number, number] = [0, 0];
  onDrag(canvas, {
    down: (x, y, e) => {
      prev = start = [x, y];
      axis = e.pointerType === 'mouse' ? 'both' : null;
    },
    move: (x, y) => {
      if (axis === null) {
        const dx = Math.abs(x - start[0]);
        const dy = Math.abs(y - start[1]);
        if (Math.max(dx, dy) < 8) return;
        axis = dx >= dy ? 'x' : 'y';
      }
      if (axis !== 'y') value -= ((x - prev[0]) * scale) / width;
      if (axis !== 'x') zoom -= y - prev[1];
      scale = initialScale * Math.exp(0.04 * zoom);
      prev = [x, y];
      draw();
      onChange(value, scale);
    },
  });
  draw();
  return { dom, width };
}

// A 2D pad over [-1, 1]²: the point jumps to wherever you press and drag.
export function createVec2Picker(initial: number[], onChange: (values: number[]) => void): PickerWidget {
  const size = 200;
  const min = -1;
  const range = 2;
  const dom = makeModal('ss-vec2-picker', size, size);
  const { canvas, ctx } = makeCanvas(size, size);
  dom.appendChild(canvas);
  let [vx, vy] = [initial[0] ?? 0, initial[1] ?? 0];
  let dragging = false;

  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    ctx.beginPath();
    ctx.lineWidth = 0.25;
    const step = size / 20;
    for (let i = 0; i < 20; i++) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5 + size / 2);
    ctx.lineTo(size, 0.5 + size / 2);
    ctx.moveTo(0.5 + size / 2, 0);
    ctx.lineTo(0.5 + size / 2, size);
    ctx.stroke();

    const half = 3;
    const px = Math.min(size - half, Math.max(half, Math.round(((vx - min) / range) * size)));
    const py = Math.min(size - half, Math.max(half, Math.round((1 - (vy - min) / range) * size)));
    ctx.fillStyle = dragging ? SELECTED : FG;
    ctx.beginPath();
    ctx.arc(px, py, dragging ? 4 : 2, 0, 2 * Math.PI);
    ctx.fill();
  };

  const set = (x: number, y: number) => {
    vx = min + (range * x) / size;
    vy = -(min + (range * y) / size);
    draw();
    onChange([vx, vy]);
  };
  onDrag(canvas, {
    down: (x, y) => {
      dragging = true;
      set(x, y);
    },
    move: set,
    up: () => {
      dragging = false;
      draw();
    },
  });
  draw();
  return { dom, width: size };
}

type Mat3 = number[][];
const identity = (): Mat3 => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const mulVec = (m: Mat3, v: number[]) => m.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);
const mulMat = (a: Mat3, b: Mat3): Mat3 =>
  a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!));
const transpose = (m: Mat3): Mat3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[j]![i]!));
const rotX = (t: number): Mat3 => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rotY = (t: number): Mat3 => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];

// A 3D direction: drag the point's tip to move it, drag elsewhere to orbit, double-click an axis label to look down it.
export function createDirectionPicker(initial: number[], onChange: (values: number[]) => void): PickerWidget {
  const size = 200;
  const scale = 50;
  const dom = makeModal('ss-direction-picker', size, size);
  const { canvas, ctx } = makeCanvas(size, size);
  dom.appendChild(canvas);
  const value = [initial[0] ?? 0, initial[1] ?? 0, initial[2] ?? 0];
  let camera = identity();
  let overPoint = false;
  let prev: [number, number] = [0, 0];

  const axes: [number[], number[]][] = [
    [[-50, 0, 0], [50, 0, 0]],
    [[0, -50, 0], [0, 50, 0]],
    [[0, 0, -50], [0, 0, 50]],
  ];
  const labels: [string, number[]][] = [
    ['x', [68, 0, 0]], ['-x', [-68, 0, 0]], ['y', [0, 68, 0]], ['-y', [0, -68, 0]], ['z', [0, 0, 68]], ['-z', [0, 0, -68]],
  ];
  const project = (p: number[]) => {
    const a = mulVec(camera, p);
    return [a[0]! + size / 2, size / 2 - a[1]!] as const;
  };
  const point = () => value.map((v) => v * scale);
  const line = (a: number[], b: number[], colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(...project(a));
    ctx.lineTo(...project(b));
    ctx.stroke();
  };

  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    for (const [a, b] of axes) line(a, b, DIM);
    ctx.fillStyle = FG;
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'middle';
    for (const [text, p] of labels) ctx.fillText(text, ...project(p));
    line([0, 0, 0], point(), FG);
    ctx.fillStyle = overPoint ? SELECTED : FG;
    ctx.beginPath();
    ctx.arc(...project(point()), overPoint ? 4 : 2, 0, 2 * Math.PI);
    ctx.fill();
  };

  onDrag(canvas, {
    down: (x, y) => {
      prev = [x, y];
      const [px, py] = project(point());
      overPoint = Math.hypot(px - x, py - y) < 10;
      draw();
    },
    move: (x, y) => {
      const dx = 0.01 * (x - prev[0]);
      const dy = 0.01 * (y - prev[1]);
      prev = [x, y];
      if (overPoint) {
        const vel = mulVec(transpose(camera), [dx, -dy, 0]);
        for (let i = 0; i < 3; i++) value[i]! += 2 * vel[i]!;
        onChange([...value]);
      } else {
        camera = mulMat(rotY(dx), mulMat(rotX(dy), camera));
      }
      draw();
    },
    up: () => {
      overPoint = false;
      draw();
    },
  });
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    const hit = labels.find(([, p]) => {
      const [px, py] = project(p);
      return Math.hypot(px - (e.clientX - r.left), py - (e.clientY - r.top)) < 10;
    });
    const quarter = Math.PI / 2;
    const views: Record<string, Mat3> = {
      'x': rotY(-quarter), '-x': rotY(quarter), 'y': rotX(-quarter), '-y': rotX(quarter), 'z': identity(),
      '-z': rotY(2 * quarter),
    };
    camera = (hit && views[hit[0]]) || identity();
    draw();
  });
  draw();
  return { dom, width: size };
}

// An HSV colour wheel with a value bar, under a patch of the current colour. "+" swaps to the direction picker.
export function createColorPicker(
  initial: number[],
  onChange: (rgb: number[]) => void,
  onLink?: (rgb: number[]) => void,
): PickerWidget {
  const width = 250;
  const disc = 200;
  const bar = 25;
  const dom = makeModal('ss-color-picker', width, 250);
  dom.innerHTML = `
    <div class="ss-color-patch"></div>
    <div class="ss-color-map">
      <canvas class="ss-color-disc"></canvas>
      <div class="ss-color-disc-cover"></div>
      <div class="ss-color-disc-cursor"></div>
      <div class="ss-color-bar"><div class="ss-color-bar-white"></div><div class="ss-color-bar-black"></div>
        <div class="ss-color-bar-cursor-left"></div><div class="ss-color-bar-cursor-right"></div></div>
    </div>
    <button type="button" class="ss-color-link" title="Edit as a direction">+</button>`;
  const q = (sel: string) => dom.querySelector<HTMLElement>(sel)!;
  const patch = q('.ss-color-patch');
  const discCanvas = dom.querySelector<HTMLCanvasElement>('.ss-color-disc')!;
  const cover = q('.ss-color-disc-cover');
  const cursor = q('.ss-color-disc-cursor');
  const barEl = q('.ss-color-bar');
  const barWhite = q('.ss-color-bar-white');
  const barCursors = [q('.ss-color-bar-cursor-left'), q('.ss-color-bar-cursor-right')];

  const ratio = window.devicePixelRatio || 1;
  const px = Math.round(disc * ratio);
  discCanvas.width = discCanvas.height = px;
  const dctx = discCanvas.getContext('2d')!;
  const image = dctx.createImageData(px, px);
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = (i + 0.5) / px * 2 - 1;
      const y = (j + 0.5) / px * 2 - 1;
      const r = Math.hypot(x, y);
      if (r > 1) continue;
      const h = (1 - Math.atan2(y, x) / (2 * Math.PI)) % 1;
      const [cr, cg, cb] = hsvToRgb(h, r, 1);
      const k = 4 * (j * px + i);
      image.data[k] = cr * 255;
      image.data[k + 1] = cg * 255;
      image.data[k + 2] = cb * 255;
      image.data[k + 3] = 255 * Math.min(1, (1 - r) * px / 2);
    }
  }
  dctx.putImageData(image, 0, 0);

  let [h, s, v] = rgbToHsv(...(initial.map((c) => Math.min(1, Math.max(0, c))) as [number, number, number]));
  const rgb = () => hsvToRgb(h, s, v);
  const css = (c: number[]) => `rgb(${c.map((x) => Math.round(x * 255)).join(',')})`;

  const draw = () => {
    patch.style.backgroundColor = css(rgb());
    cover.style.opacity = String(1 - v);
    barWhite.style.opacity = String(1 - s);
    barEl.style.backgroundColor = css(hsvToRgb(h, 1, 1));
    const radius = disc / 2;
    const angle = 2 * Math.PI * (1 - h);
    cursor.style.left = `${Math.cos(angle) * s * (radius - 5) + radius}px`;
    cursor.style.top = `${Math.sin(angle) * s * (radius - 5) + radius}px`;
    const [r, g, b] = rgb();
    const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.22;
    cursor.style.borderColor = dark ? '#333' : '#ddd';
    dom.classList.toggle('ss-color-dark', dark);
    for (const c of barCursors) c.style.top = `${(1 - v) * disc}px`;
  };

  onDrag(cover, {
    move: (x, y) => {
      const r = disc / 2;
      const dx = x - r;
      const dy = y - r;
      h = (1 - Math.atan2(dy, dx) / (2 * Math.PI)) % 1;
      s = Math.min(1, Math.hypot(dx, dy) / r);
      draw();
      onChange(rgb());
    },
    down(x, y, e) {
      this.move(x, y, e);
    },
  });
  onDrag(barEl, {
    move: (_x, y) => {
      v = Math.max(0, Math.min(1, 1 - y / disc));
      draw();
      onChange(rgb());
    },
    down(x, y, e) {
      this.move(x, y, e);
    },
  });
  const link = q('.ss-color-link');
  if (onLink) {
    link.addEventListener('pointerdown', (e) => e.preventDefault());
    link.addEventListener('click', () => onLink(rgb()));
  } else {
    link.remove();
  }
  barEl.style.width = `${bar}px`;
  draw();
  return { dom, width };
}
