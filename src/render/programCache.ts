// Linked programs by their full fragment source, so a build compiles only the shaders whose source
// changed. Each slot (the image, a buffer, the probe) keeps its program and the one before; the rest are freed.
export class ProgramCache<P> {
  private bySource = new Map<string, P>();
  private slots = new Map<string, {current: P | null; previous: P | null}>();

  constructor(private readonly free: (program: P) => void) {}

  get(source: string): P | undefined {
    return this.bySource.get(source);
  }

  add(source: string, program: P) {
    this.bySource.set(source, program);
  }

  // Gives each slot its program, or null for none, then frees what no slot holds.
  use(programs: Iterable<[string, P | null]>) {
    for (const [slot, program] of programs) {
      const held = this.slots.get(slot);
      if (held?.current === program) {
        continue;
      }
      this.slots.set(slot, {current: program, previous: held?.current ?? held?.previous ?? null});
    }
    this.prune();
  }

  // Frees every program no slot holds now or held just before, such as those of a build that failed.
  prune() {
    const kept = new Set([...this.slots.values()].flatMap(s => [s.current, s.previous]));
    for (const [source, program] of this.bySource) {
      if (!kept.has(program)) {
        this.free(program);
        this.bySource.delete(source);
      }
    }
  }
}
