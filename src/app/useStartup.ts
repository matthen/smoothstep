import { useEffect } from 'react';

import { parseDocument, tutorialDocument, type AnimationDocument } from '../lib/document';
import * as localStore from '../lib/localStore';
import { isBrokenShareLink, type Route } from '../lib/routes';
import { loadRoute, ShareError } from '../lib/share';
import { lessonTitle } from '../tutorial/lessons';
import type { TutorialProgress } from '../tutorial/progress';

const STORAGE_BLOCKED = "This browser isn't letting smoothstep.io store data, so animations can't be saved here. " +
  "Private browsing can cause this.";

interface Options {
  initialRoute: Route | null;
  // Where the tutorial opens, when the URL asks for it.
  tutorialStart: TutorialProgress | null;
  loadDocument: (json: AnimationDocument, sharedFrom?: Route) => void;
  openFailed: (text: string) => void;
  setAlert: (text: string) => void;
  // Called once the animation the URL names has opened or failed to.
  onFinished: () => void;
}

// Opens the browser's storage, then the animation the URL names.
export function useStartup({initialRoute, tutorialStart, loadDocument, openFailed, setAlert, onFinished}: Options) {
  useEffect(() => {
    const route = initialRoute;
    void localStore.init().catch((error: unknown) => {
      console.error(error);
      setAlert(STORAGE_BLOCKED);
    }).then(async () => {
      if (!route) {
        if (isBrokenShareLink(window.location.hash)) {
          setAlert("That link is incomplete, so there's no animation to open. Check you copied all of it.");
        }
        return;
      }
      try {
        if (route.kind === "tutorial") {
          // A new animation, so the tutorial never changes a saved one.
          loadDocument({...tutorialDocument(), title: lessonTitle(tutorialStart?.lesson ?? 0)});
        } else if (route.kind === "anim") {
          const record = await localStore.getDocument(route.id);
          if (!record) {
            throw new Error("Not found");
          }
          loadDocument(parseDocument(record.json));
        } else {
          // An example, or an animation shared by link.
          const {doc, images} = await loadRoute(route);
          images.forEach((blob, id) => localStore.addTemporaryImage(id, blob));
          loadDocument(doc, route);
        }
      } catch (error) {
        console.error(error);
        const text = error instanceof ShareError ? error.message : "Could not find that animation in this browser.";
        setAlert(text);
        // Saving now creates a new animation rather than reusing the missing id.
        window.history.replaceState({}, "", "#new");
        openFailed(text);
      } finally {
        onFinished();
      }
    });
    // Runs once: every dependency is stable, and a change would reopen the animation over the user's edits.
  }, [initialRoute, loadDocument, onFinished, tutorialStart, openFailed, setAlert]);
}
