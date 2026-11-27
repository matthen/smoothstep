import { describe, expect, it } from 'vitest';

import { newDocument } from '../../lib/document';
import { documentReducer, initialDocumentState, type DocumentAction, type DocumentState } from './documentState';

const run = (...actions: DocumentAction[]) =>
  actions.reduce<DocumentState>(documentReducer, initialDocumentState(null));

describe("documentReducer", () => {
  it("opening an animation drops everything left from the one before", () => {
    const edited = run(
      {type: "addShared"}, {type: "addCanvas"}, {type: "editCode", tab: "image", code: "edited"},
      {type: "layerErrors", errors: [{line: 1, message: "oops"}]},
    );
    const opened = newDocument();
    const after = documentReducer(edited, {type: "open", doc: opened});
    expect(after.doc).toBe(opened);
    expect(after.hasUnsavedChanges).toBe(false);
    expect(after.layerErrors).toEqual([]);
    expect(after.justAdded).toBeNull();
    expect(after.sharedUntouched).toBe(false);
    expect(after.builtCode).toBe(opened.code);
    expect(after.buildId).toBeGreaterThan(edited.buildId);
  });

  it("builds edits only on Build, or a live build, which keeps the build id", () => {
    const typed = run({type: "editCode", tab: "image", code: "typed"});
    expect(typed.builtCode).not.toBe("typed");
    expect(documentReducer(typed, {type: "build"}).builtCode).toBe("typed");
    const live = documentReducer(typed, {type: "buildLive"});
    expect(live.builtCode).toBe("typed");
    expect(live.buildId).toBe(typed.buildId);
  });

  it("leaves code that's already built alone on a live build, so it doesn't build again", () => {
    const built = run({type: "editCode", tab: "image", code: "dragged"}, {type: "buildLive"});
    expect(documentReducer(built, {type: "buildLive"})).toBe(built);
  });

  it("keeps edits made while saving as unsaved", () => {
    const saving = run({type: "editCode", tab: "image", code: "saved"});
    const savedDoc = saving.doc;
    expect(documentReducer(saving, {type: "saved", id: "a", doc: savedDoc}).hasUnsavedChanges).toBe(false);
    const editedMeanwhile = documentReducer(saving, {type: "editCode", tab: "image", code: "later"});
    expect(documentReducer(editedMeanwhile, {type: "saved", id: "a", doc: savedDoc}).hasUnsavedChanges).toBe(true);
  });

  it("treats a new shared tab as untouched until its code is set", () => {
    const added = run({type: "addShared"});
    expect(added.sharedUntouched).toBe(true);
    expect(added.hasUnsavedChanges).toBe(false);
    expect(documentReducer(added, {type: "editCode", tab: "image", code: "x"}).sharedUntouched).toBe(true);
    expect(documentReducer(added, {type: "editCode", tab: "shared", code: "x"}).sharedUntouched).toBe(false);
    expect(documentReducer(added, {type: "edit", change: {shared: ""}}).sharedUntouched).toBe(false);
  });
});
