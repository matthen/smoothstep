// Says when a Canvas2D layer's code has been busy for a while, so slow code plays slowly rather than
// looking stuck: the step it's drawing, or "starting" while its first run goes on.

// How long the code runs before it counts as busy.
export const BUSY_MS = 1_000;

export type Busy = number | "starting" | null;

export class BusyWatch {
  private timer: number | undefined;
  private shown = false;

  // `doing` says what the code is busy with now, or null if it has finished.
  constructor(private onBusy: (busy: Busy) => void, private doing: () => Busy) {}

  // Starts the wait before saying it's busy, unless it already says so.
  arm() {
    if (this.shown) {
      return;
    }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const busy = this.doing();
      if (busy !== null) {
        this.shown = true;
        this.onBusy(busy);
      }
    }, BUSY_MS);
  }

  // The code moved on to drawing `frame`.
  update(frame: number) {
    if (this.shown) {
      this.onBusy(frame);
    }
  }

  clear() {
    window.clearTimeout(this.timer);
    if (this.shown) {
      this.shown = false;
      this.onBusy(null);
    }
  }
}
