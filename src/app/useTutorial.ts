import { useState } from 'react';

import { TUTORIAL_HREF } from '../lib/config';
import { canvasLayer, newBufferCode, type AnimationDocument } from '../lib/document';
import type { ShaderId } from '../render/Renderer';
import { lessonTitle, type TabCode } from '../tutorial/lessons';
import type { TutorialProgress } from '../tutorial/progress';
import type { MobileTab } from './useLayout';

interface Options {
  // Where the tutorial opens, or null if the app opened without it.
  start: TutorialProgress | null;
  doc: AnimationDocument;
  documentId: string | null;
  edit: (change: Partial<AnimationDocument>) => void;
  rename: (title: string) => void;
  showCodeTab: (tab: ShaderId) => void;
  phone: boolean;
  mobileTab: MobileTab;
  chooseMobileTab: (tab: MobileTab) => void;
}

// The tutorial's Learn panel, and what its steps do to the animation.
export function useTutorial(
  {start, doc, documentId, edit, rename, showCodeTab, phone, mobileTab, chooseMobileTab}: Options,
) {
  const [tutorialOpen, setTutorialOpen] = useState(start !== null);
  const [tutorialStepDone, setTutorialStepDone] = useState(false);

  // Puts a step's code in each of its tabs, adding buffers up to the highest it fills and the Canvas2D layer
  // if it fills that, and opens the last.
  const putTutorialCode = (code: TabCode[]) => {
    const change: Partial<AnimationDocument> = {};
    const buffers = [...doc.buffers ?? []];
    const layer = canvasLayer(doc);
    for (const {tab, code: text} of code) {
      if (tab === "image") {
        change.code = text;
      } else if (tab === "shared") {
        change.shared = text;
      } else if (tab === "canvas") {
        change.layers = [{...layer ?? {kind: "canvas2d", overlay: true}, code: text}];
      } else {
        while (buffers.length <= tab) {
          buffers.push({code: newBufferCode(buffers.length)});
        }
        buffers[tab] = {code: text};
        change.buffers = buffers;
      }
    }
    edit(change);
    showCodeTab(code[code.length - 1]!.tab);
    if (phone) {
      chooseMobileTab("code");
    }
  };

  const changeTutorialLesson = (lesson: number) => {
    // Only the tutorial's own unsaved animation follows the lesson.
    if (documentId !== null) {
      return;
    }
    window.history.replaceState({}, "", TUTORIAL_HREF + "/" + (lesson + 1));
    if (doc.title.startsWith("Tutorial: ")) {
      rename(lessonTitle(lesson));
    }
  };

  const closeTutorial = () => {
    setTutorialOpen(false);
    if (mobileTab === "learn") {
      chooseMobileTab("code");
    }
    if (window.location.hash.startsWith(TUTORIAL_HREF)) {
      window.history.replaceState({}, "", "#new");
    }
  };

  return {tutorialOpen, tutorialStepDone, setTutorialStepDone, putTutorialCode, changeTutorialLesson, closeTutorial};
}
