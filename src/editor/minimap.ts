// A minimap down the editor's right edge: each line of code as small blocks in its syntax colours, with
// the part in view as a box. A click or drag on it scrolls the code. It shows once the code is longer
// than the editor, when the editor is wide enough to spare the room.
import { highlightingFor, language, syntaxTree } from '@codemirror/language';
import { type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { highlightTree } from '@lezer/highlight';

const WIDTH = 96;
const LINE_HEIGHT = 3;
const CHAR_WIDTH = 1.2;
const MAX_CHARS = Math.floor((WIDTH - 8) / CHAR_WIDTH);
// Narrower editors keep their width for the code.
const MIN_EDITOR_WIDTH = 560;

const isPhone = () => window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;

interface Layout {
  shown: boolean;
  top: number;
  height: number;
  scrollTop: number;
  maxScroll: number;
  // The first and last lines in view, from 1.
  first: number;
  last: number;
}

class Minimap {
  dom = document.createElement('div');
  canvas = document.createElement('canvas');
  probe = document.createElement('span');
  colours = new Map<string, string>();
  layout: Layout | null = null;
  frame = 0;
  // While dragging, where in the box the pointer holds it.
  grab: number | null = null;

  constructor(readonly view: EditorView) {
    this.dom.className = 'cm-minimap';
    this.dom.setAttribute('aria-hidden', 'true');
    this.probe.hidden = true;
    this.dom.append(this.canvas, this.probe);
    this.dom.addEventListener('pointerdown', this.onDown);
    this.dom.addEventListener('pointermove', this.onMove);
    this.dom.addEventListener('pointerup', this.onUp);
    this.dom.addEventListener('pointercancel', this.onUp);
    view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    this.measure();
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.geometryChanged || update.heightChanged || update.viewportChanged) this.measure();
    // The colours change as background parsing catches up, or when the language loads.
    else if (syntaxTree(update.state) !== syntaxTree(update.startState) ||
      update.state.facet(language) !== update.startState.facet(language)) this.scheduleDraw();
  }

  onScroll = () => this.measure();

  measure() {
    this.view.requestMeasure({
      key: this,
      read: (view): Layout => {
        const scroller = view.scrollDOM;
        const { clientHeight, scrollHeight, scrollTop } = scroller;
        const shown = clientHeight > 0 && view.contentHeight > clientHeight && view.dom.clientWidth >= MIN_EDITOR_WIDTH && !isPhone();
        const top = view.documentTop - scroller.getBoundingClientRect().top + scrollTop;
        const lineAt = (y: number) => view.state.doc.lineAt(view.lineBlockAtHeight(y - top).from).number;
        return {
          shown, top: scroller.offsetTop, height: clientHeight, scrollTop, maxScroll: Math.max(1, scrollHeight - clientHeight),
          first: lineAt(scrollTop), last: lineAt(scrollTop + clientHeight - 1),
        };
      },
      write: (layout) => {
        if (layout.shown !== this.layout?.shown) {
          // Only in the page while shown, so short code has no extra canvas.
          if (layout.shown) this.view.dom.appendChild(this.dom);
          else this.dom.remove();
          this.view.scrollDOM.style.marginRight = layout.shown ? `${WIDTH}px` : '';
        }
        this.layout = layout;
        if (layout.shown) this.scheduleDraw();
      },
    });
  }

  scheduleDraw() {
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  // The minimap's own scroll: it moves through long code in step with the editor.
  offset(layout: Layout) {
    const total = this.view.state.doc.lines * LINE_HEIGHT;
    return Math.max(0, total - layout.height) * Math.min(1, layout.scrollTop / layout.maxScroll);
  }

  colour(cls: string): string {
    let colour = this.colours.get(cls);
    if (!colour) {
      this.probe.className = cls;
      colour = getComputedStyle(this.probe).color;
      this.colours.set(cls, colour);
    }
    return colour;
  }

  draw() {
    const layout = this.layout;
    if (!layout?.shown) return;
    const { state } = this.view;
    const dpr = window.devicePixelRatio || 1;
    Object.assign(this.dom.style, { top: `${layout.top}px`, height: `${layout.height}px` });
    this.canvas.width = WIDTH * dpr;
    this.canvas.height = layout.height * dpr;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const offset = this.offset(layout);
    const first = Math.floor(offset / LINE_HEIGHT) + 1;
    const last = Math.min(state.doc.lines, first + Math.ceil(layout.height / LINE_HEIGHT));

    // The colours of the lines shown, where the code has been parsed that far.
    const from = state.doc.line(first).from;
    const to = state.doc.line(last).to;
    const spans: { from: number; to: number; cls: string }[] = [];
    highlightTree(syntaxTree(state), { style: (tags) => highlightingFor(state, tags) },
      (f, t, cls) => spans.push({ from: f, to: t, cls }), from, to);
    const plain = this.colour('');
    ctx.globalAlpha = 0.75;
    let s = 0;
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      const y = (n - 1) * LINE_HEIGHT - offset;
      const text = line.text.slice(0, MAX_CHARS);
      for (const run of text.matchAll(/\S+/g)) {
        let pos = line.from + run.index;
        const end = pos + run[0].length;
        while (pos < end) {
          while (s < spans.length && spans[s]!.to <= pos) s++;
          const span = spans[s];
          const inSpan = span !== undefined && span.from <= pos;
          const stop = inSpan ? Math.min(end, span.to) : Math.min(end, span?.from ?? end);
          ctx.fillStyle = inSpan ? this.colour(span.cls) : plain;
          ctx.fillRect(4 + (pos - line.from) * CHAR_WIDTH, y, (stop - pos) * CHAR_WIDTH, LINE_HEIGHT - 1);
          pos = stop;
        }
      }
    }

    // The part in view.
    const box = this.box(layout);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.colour(this.grab === null ? 'cm-minimap-box' : 'cm-minimap-box cm-minimap-box-dragged');
    ctx.fillRect(0, box.top, WIDTH, box.height);
  }

  box(layout: Layout) {
    const offset = this.offset(layout);
    return { top: (layout.first - 1) * LINE_HEIGHT - offset, height: Math.max(LINE_HEIGHT * 2, (layout.last - layout.first + 1) * LINE_HEIGHT) };
  }

  // Scrolls so the box's top is at `y` in the minimap.
  scrollTo(y: number) {
    const layout = this.layout;
    if (!layout) return;
    const box = this.box(layout);
    const track = Math.min(layout.height, this.view.state.doc.lines * LINE_HEIGHT) - box.height;
    this.view.scrollDOM.scrollTop = track > 0 ? Math.min(1, Math.max(0, y / track)) * layout.maxScroll : 0;
  }

  onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.layout) return;
    e.preventDefault();
    const y = e.clientY - this.dom.getBoundingClientRect().top;
    const box = this.box(this.layout);
    // A press outside the box centres it there.
    this.grab = y >= box.top && y < box.top + box.height ? y - box.top : box.height / 2;
    this.dom.setPointerCapture(e.pointerId);
    this.scrollTo(y - this.grab);
  };

  onMove = (e: PointerEvent) => {
    if (this.grab === null) return;
    this.scrollTo(e.clientY - this.dom.getBoundingClientRect().top - this.grab);
  };

  onUp = () => {
    this.grab = null;
    this.scheduleDraw();
  };

  destroy() {
    cancelAnimationFrame(this.frame);
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.view.scrollDOM.style.marginRight = '';
    this.dom.remove();
  }
}

export function minimap(): Extension {
  return ViewPlugin.fromClass(Minimap);
}
