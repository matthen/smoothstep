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

// Progress saved before lessons had ids gave the lesson's index, mostly in the order from before
// the Canvas2D lesson was added. Someone who has done a step of that lesson saved in today's order.
const LESSONS_BEFORE_CANVAS2D = ["colour", "time", "shapes", "timeline", "patterns", "textures", "memory", "buffers", "share"];

function clampStep(lesson: number, step: number): number {
  return Math.max(0, Math.min(step, LESSONS[lesson]!.steps.length - 1));
}

// The saved lesson's index now, or -1 if it isn't one.
function savedLesson({lessonId, lesson}: Record<string, unknown>, completed: string[]): number {
  if (typeof lessonId === "string") {
    return LESSONS.findIndex(l => l.id === lessonId);
  }
  if (!Number.isInteger(lesson)) {
    return -1;
  }
  const canvas2dSteps = LESSONS.find(l => l.id === "canvas2d")!.steps;
  const oldId = canvas2dSteps.some(s => completed.includes(s.id)) ? undefined : LESSONS_BEFORE_CANVAS2D[lesson as number];
  return oldId ? LESSONS.findIndex(l => l.id === oldId) : (lesson as number) < LESSONS.length ? lesson as number : -1;
}

export function loadProgress(): TutorialProgress {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const saved = value as Record<string, unknown>;
      const completed = Array.isArray(saved.completed) ? saved.completed.filter(id => typeof id === "string") : [];
      const lesson = savedLesson(saved, completed);
      if (lesson >= 0 && Number.isInteger(saved.step)) {
        return {lesson, step: clampStep(lesson, saved.step as number), completed};
      }
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

// The progress to open with: the start of the saved lesson, or of `lesson` if the URL names one. The
// tutorial opens a new animation, so a later step could need code from the steps before it.
export function openingProgress(lesson: number | null): TutorialProgress {
  const saved = loadProgress();
  const opening = lesson === null ? saved.lesson : Math.max(0, Math.min(lesson, LESSONS.length - 1));
  return {...saved, lesson: opening, step: 0};
}
