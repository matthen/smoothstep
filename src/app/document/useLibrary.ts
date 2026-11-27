import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react';

import * as archive from '../../lib/archive';
import { documentHref } from '../../lib/config';
import type { AnimationDocument } from '../../lib/document';
import * as localStore from '../../lib/localStore';
import type { Route } from '../../lib/routes';
import { loadRoute, ShareError } from '../../lib/share';
import { useLatest } from '../../lib/useLatest';
import { onLaunchFiles } from '../../pwa/install';
import type { CanvasHandle } from '../../render/Canvas';
import type { DocumentAction } from './documentState';
import { openHash } from '../routing';
import { showMessage } from '../../lib/statusMessage';
import type { TipEvent } from '../onboarding/tips';
import { windowTitle } from './useDocument';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof localStore.StorageFullError ? error.message + " Delete some animations or uploads, " +
    "or use Export all in the Open dialog and clear space." : fallback;
}

interface Options {
  doc: AnimationDocument;
  documentId: string | null;
  sharedFrom: Route | null;
  hasUnsavedChanges: boolean;
  dispatch: Dispatch<DocumentAction>;
  // Whether the animation is still loading, so there's nothing to save or download yet.
  loading: boolean;
  canvasRef: RefObject<CanvasHandle | null>;
  setAlert: (text: string) => void;
  // Shows the Open dialog, or closes the dialog showing.
  setOpenDialog: (open: boolean) => void;
  showTip: (event: TipEvent) => void;
}

// Saving to the browser's animations, and moving animations in and out of it as files and links.
export function useLibrary(
  {doc, documentId, sharedFrom, hasUnsavedChanges, dispatch, loading, canvasRef, setAlert, setOpenDialog, showTip}: Options,
) {
  // Bumped when files are added to the browser's animations, so the Open dialog lists them.
  const [libraryVersion, setLibraryVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);

  const save = async (asCopy: boolean, copyTitle?: string) => {
    // Saving before the animation has loaded would overwrite it with the default document, and
    // two overlapping first saves would make two copies.
    if (loading || saving.current) {
      return;
    }
    saving.current = true;
    showMessage("Saving animation...", true);
    let json = doc;
    if (copyTitle) {
      json = {...doc, title: copyTitle};
      dispatch({type: "replace", doc: json});
      windowTitle(copyTitle);
    }
    try {
      const id = await localStore.saveDocument(asCopy ? null : documentId, json, canvasRef.current?.captureFrame() ?? null);
      const message = asCopy || (documentId === null && sharedFrom) ? "Saved a copy to your animations." :
        documentId === null ? "Saved to your animations." : "Animation saved.";
      if (id !== documentId) {
        window.history.replaceState({}, "", documentHref(id));
      }
      dispatch({type: "saved", id, doc: json});
      showMessage(message);
      showTip({kind: "saved"});
    } catch (error) {
      console.error(error);
      notifications.hide("status");
      setAlert(errorMessage(error, "Error saving animation. The browser may be out of storage space."));
    } finally {
      saving.current = false;
    }
  };

  // Ctrl/Cmd-S outside the code editor (the editor handles its own).
  const saveRef = useLatest(save);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" &&
          !(event.target instanceof Element && event.target.closest(".cm-editor"))) {
        event.preventDefault();
        void saveRef.current(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saveRef]);

  const download = useCallback(async () => {
    // A download now would be the default document under the loading animation's id.
    if (loading) {
      return;
    }
    const now = Date.now();
    try {
      archive.download(await archive.animationFile({
        id: documentId ?? localStore.newId(), title: doc.title, created: now, modified: now, thumbnail: null, json: doc,
      }));
    } catch (error) {
      console.error(error);
      setAlert("Error downloading animation.");
    }
  }, [loading, doc, documentId, setAlert]);

  // Adds animation files from the computer to the browser's animations, and opens the one a single
  // file holds.
  const openFiles = async (files: FileList | File[] | null, launched = false) => {
    if (!files || files.length === 0) {
      return;
    }
    try {
      const summary = await archive.importFiles(Array.from(files));
      const ids = [...new Set(summary.ids)];
      const [only] = ids;
      const single = only !== undefined && ids.length === 1 && summary.failed === 0;
      // A launch opening the animation already open is this window's own, given again after it reloaded.
      if (single && launched && window.location.hash === documentHref(only)) {
        return;
      }
      if (single && openHash(documentHref(only), hasUnsavedChanges)) {
        return;
      }
      // Several animations, or one the user chose not to open over unsaved changes: list them.
      setLibraryVersion(v => v + 1);
      if (ids.length > 0) {
        setOpenDialog(true);
      }
      setAlert(archive.importMessage(summary));
    } catch (error) {
      console.error(error);
      setAlert("Error opening file.");
    } finally {
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  };

  // Files opened with the installed app, as File → Import opens them.
  const openFilesRef = useLatest(openFiles);
  useEffect(() => onLaunchFiles(files => void openFilesRef.current(files, true)), [openFilesRef]);

  // Adds the animation at a link to this browser's animations, and opens it.
  const importLink = async (route: Route) => {
    let id: string;
    try {
      const {doc: linked, images} = await loadRoute(route);
      id = await archive.importDocument(linked, images);
    } catch (error) {
      console.error(error);
      throw error instanceof ShareError ? error : new Error(errorMessage(error, "Couldn't import that animation."));
    }
    setLibraryVersion(v => v + 1);
    setOpenDialog(!openHash(documentHref(id), hasUnsavedChanges));
  };

  return {libraryVersion, fileInput, save, download, openFiles, importLink};
}
