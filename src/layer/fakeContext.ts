// A stand-in for a 2D canvas context in tests, since jsdom has none: it keeps the transform and
// styles, and records what's drawn in canvas pixels.

type Matrix = [number, number, number, number, number, number];  // a, b, c, d, e, f

export interface Drawn {
  op: string;
  // Path points, or where text was put, in canvas pixels.
  points: [number, number][];
  text?: string;
  fillStyle: string;
  strokeStyle: string;
  // The line width and font size as they come out on the canvas.
  lineWidth: number;
  fontPixels: number;
}

interface State {
  matrix: Matrix;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

export class FakeContext {
  canvas: {width: number; height: number};
  drawn: Drawn[] = [];
  fillStyle = "#000";
  strokeStyle = "#000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign = "start";
  textBaseline = "alphabetic";
  lineDash: number[] = [];
  private matrix: Matrix = [1, 0, 0, 1, 0, 0];
  private stack: State[] = [];
  private path: [number, number][] = [];

  constructor(width: number, height: number) {
    this.canvas = {width, height};
  }

  get depth() {
    return this.stack.length;
  }

  private multiply(m: Matrix) {
    const [a, b, c, d, e, f] = this.matrix;
    this.matrix = [
      a * m[0] + c * m[1], b * m[0] + d * m[1], a * m[2] + c * m[3], b * m[2] + d * m[3],
      a * m[4] + c * m[5] + e, b * m[4] + d * m[5] + f,
    ];
  }

  private point(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.matrix;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  private zoom(): number {
    const [a, b, c, d] = this.matrix;
    return Math.sqrt(Math.abs(a * d - b * c));
  }

  private record(op: string, points: [number, number][], text?: string) {
    this.drawn.push({
      op, points, text, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth * this.zoom(), fontPixels: parseFloat(/(\d+(\.\d+)?)px/.exec(this.font)?.[1] ?? "0") * this.zoom(),
    });
  }

  save() {
    this.stack.push({
      matrix: this.matrix, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth,
      font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline,
    });
  }

  restore() {
    const state = this.stack.pop();
    if (state) {
      Object.assign(this, state);
    }
  }

  getTransform() {
    const [a, b, c, d, e, f] = this.matrix;
    return {a, b, c, d, e, f};
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.matrix = [a, b, c, d, e, f];
  }

  translate(x: number, y: number) {
    this.multiply([1, 0, 0, 1, x, y]);
  }

  scale(x: number, y: number) {
    this.multiply([x, 0, 0, y, 0, 0]);
  }

  rotate(angle: number) {
    this.multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]);
  }

  setLineDash(dash: number[]) {
    this.lineDash = dash;
  }

  beginPath() {
    this.path = [];
  }

  moveTo(x: number, y: number) {
    this.path.push(this.point(x, y));
  }

  lineTo(x: number, y: number) {
    this.path.push(this.point(x, y));
  }

  closePath() {}

  // An arc is recorded by its start and end points.
  arc(x: number, y: number, radius: number, start: number, end: number) {
    this.path.push(this.point(x + radius * Math.cos(start), y + radius * Math.sin(start)));
    this.path.push(this.point(x + radius * Math.cos(end), y + radius * Math.sin(end)));
  }

  fill() {
    this.record("fill", [...this.path]);
  }

  stroke() {
    this.record("stroke", [...this.path]);
  }

  fillText(text: string, x: number, y: number) {
    this.record("fillText", [this.point(x, y)], text);
  }

  strokeText(text: string, x: number, y: number) {
    this.record("strokeText", [this.point(x, y)], text);
  }

  clearRect(x: number, y: number, w: number, h: number) {
    this.record("clearRect", [this.point(x, y), this.point(x + w, y + h)]);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.record("fillRect", [this.point(x, y), this.point(x + w, y + h)]);
  }

  // For passing to code that takes a real context.
  get asContext(): OffscreenCanvasRenderingContext2D {
    return this as unknown as OffscreenCanvasRenderingContext2D;
  }
}
