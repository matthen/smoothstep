// The playhead's time and the simulation's step clock. They live outside React, so playing doesn't
// re-render the app every frame: the canvas reads them as it draws, and only what shows the time subscribes.
import { useSyncExternalStore } from 'react';

export class Playhead {
  #time = 0;
  #stepClock = 0;
  private listeners = new Set<() => void>();

  // Seconds into the animation.
  get time(): number {
    return this.#time;
  }

  // Seconds played since the simulation last restarted, which set how many steps it has taken.
  get stepClock(): number {
    return this.#stepClock;
  }

  set(time: number, stepClock = this.#stepClock) {
    if (time === this.#time && stepClock === this.#stepClock) {
      return;
    }
    this.#time = time;
    this.#stepClock = stepClock;
    this.listeners.forEach(listener => listener());
  }

  // Plays on by `elapsed` seconds.
  advance(elapsed: number) {
    this.set(this.#time + elapsed, this.#stepClock + elapsed);
  }

  restartSteps() {
    this.set(this.#time, 0);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

// Something worked out from the playhead's time, re-rendering only when it changes; `select` should
// return a number, string or boolean, so equal results compare equal.
export function usePlayheadSelect<T>(playhead: Playhead, select: (time: number) => T): T {
  return useSyncExternalStore(playhead.subscribe, () => select(playhead.time));
}
