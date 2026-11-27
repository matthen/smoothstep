// Where you are in the tutorial, remembered in this browser. Storage can be blocked (private
// browsing), in which case the tutorial starts from the beginning each time.
import { LESSONS } from './lessons';

const KEY = "smoothstep.tutorial";

export interface TutorialProgress {
  lesson: number;
  step: number;
  // Ids of the steps whose checks have passed.
  completed: string[];
}

// Progress saved before lessons had ids gave the lesson's index, in one of these orders: before or after
// the Canvas2D lesson was added on 23 Nov 2026. Only lesson 8 differs between them.
const ORDER_BEFORE_CANVAS2D = ["colour", "time", "shapes", "timeline", "patterns", "textures", "memory", "buffers", "share"];
const ORDER_WITH_CANVAS2D = [
  "colour", "time", "shapes", "timeline", "patterns", "textures", "memory", "buffers", "canvas2d", "share",
];

function clampStep(lesson: number, step: number): number {
  return Math.max(0, Math.min(step, LESSONS[lesson]!.steps.length - 1));
}

// The saved lesson's id. A save by index is read in the older order, unless it's past that order's end or a
// step of the Canvas2D lesson is done: no other step tells the orders apart.
function savedLessonId({lessonId, lesson}: Record<string, unknown>, completed: string[]): string | undefined {
  if (typeof lessonId === "string") {
    return lessonId;
  }
  if (typeof lesson !== "number" || !Number.isInteger(lesson)) {
    return undefined;
  }
  const canvas2dSteps = LESSONS.find(l => l.id === "canvas2d")!.steps;
  const withCanvas2D = lesson >= ORDER_BEFORE_CANVAS2D.length || canvas2dSteps.some(s => completed.includes(s.id));
  return (withCanvas2D ? ORDER_WITH_CANVAS2D : ORDER_BEFORE_CANVAS2D)[lesson];
}

export function loadProgress(): TutorialProgress {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const saved = value as Record<string, unknown>;
      const completed = Array.isArray(saved.completed) ? saved.completed.filter(id => typeof id === "string") : [];
      const lesson = LESSONS.findIndex(l => l.id === savedLessonId(saved, completed));
      // A lesson that's gone loses only the place, not the steps done.
      return lesson >= 0 && Number.isInteger(saved.step) ?
        {lesson, step: clampStep(lesson, saved.step as number), completed} : {lesson: 0, step: 0, completed};
    }
  } catch {
    // Unreadable or blocked; start again.
  }
  return {lesson: 0, step: 0, completed: []};
}

export function saveProgress({lesson, step, completed}: TutorialProgress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({lessonId: LESSONS[lesson]!.id, step, completed}));
  } catch {
    // Not stored; see above.
  }
}

// The progress to open with: the start of the saved lesson, or of `lesson` if the URL names one by index
// or id. The tutorial opens a new animation, so a later step could need code from the steps before it.
export function openingProgress(lesson: number | string | null): TutorialProgress {
  const saved = loadProgress();
  const named = typeof lesson === "string" ? LESSONS.findIndex(l => l.id === lesson) : lesson;
  const opening = named === null || named < 0 ? saved.lesson : Math.min(named, LESSONS.length - 1);
  return {...saved, lesson: opening, step: 0};
}
