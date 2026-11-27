// Makes a Canvas2D layer's code run the same each time: Math.random repeats from one run to the next,
// and clocks give the animation's time. The worker gets makeDeterministic as source text, so it must
// not use anything from outside its own body.

export function makeDeterministic() {
  let seed = 0x2F6E2B1;
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let stepTime = 0;
  Date.now = () => Math.round(stepTime * 1000);
  performance.now = () => stepTime * 1000;
  return {
    // The time, in seconds, of the step being drawn.
    setTime(time: number) {
      stepTime = time;
    },
  };
}
