// The pointers pressed on a picker, so it's let go once, when the last of them lifts.
export function pickerPresses(onRelease: () => void) {
  const down = new Set<number>();
  return {
    press(id: number) {
      down.add(id);
    },
    lift(id: number) {
      if (down.delete(id) && down.size === 0) onRelease();
    },
    // Every pointer at once, as when the window loses focus.
    liftAll() {
      if (down.size === 0) return;
      down.clear();
      onRelease();
    },
  };
}
