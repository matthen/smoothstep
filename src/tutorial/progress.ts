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

function clampStep(lesson: number, step: number): number {
  return Math.max(0, Math.min(step, LESSONS[lesson]!.steps.length - 1));
}

export function loadProgress(): TutorialProgress {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const {lesson, step, completed} = value as Record<string, unknown>;
      if (Number.isInteger(lesson) && (lesson as number) >= 0 && (lesson as number) < LESSONS.length &&
          Number.isInteger(step)) {
        return {
          lesson: lesson as number,
          step: clampStep(lesson as number, step as number),
          completed: Array.isArray(completed) ? completed.filter(id => typeof id === "string") : [],
        };
      }
    }
  } catch {
    // Unreadable or blocked; start again.
  }
  return {lesson: 0, step: 0, completed: []};
}

export function saveProgress(progress: TutorialProgress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Not stored; see above.
  }
}

// The progress to open with: the saved place, or the start of `lesson` if the URL names another one.
export function openingProgress(lesson: number | null): TutorialProgress {
  const saved = loadProgress();
  if (lesson === null || lesson === saved.lesson) {
    return saved;
  }
  return {...saved, lesson: Math.max(0, Math.min(lesson, LESSONS.length - 1)), step: 0};
}
