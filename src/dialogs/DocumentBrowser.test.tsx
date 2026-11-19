import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { newDocument } from '../lib/document';
import * as localStore from '../lib/localStore';
import DocumentBrowser from './DocumentBrowser';
import { addDocument, clearStore } from './testUtils';

afterEach(cleanup);

beforeEach(async () => {
  await clearStore();
  await addDocument("aaaa00000001", "Older", Date.now() - 3 * 3600 * 1000);
  await addDocument("aaaa00000002", "Newer", Date.now() - 60 * 1000);
});

function renderBrowser(currentId: string | null = null) {
  const props = {show: true, onHide: vi.fn(), currentId, onDeleted: vi.fn(), onMessage: vi.fn()};
  render(<DocumentBrowser {...props} />);
  return props;
}

describe("DocumentBrowser", () => {
  it("lists stored animations, newest first, with links and the open one highlighted", async () => {
    const props = renderBrowser("aaaa00000001");
    const newer = await screen.findByRole("link", {name: "Newer"});
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map(r => within(r).getByRole("link").textContent)).toEqual(["Newer", "Older"]);
    expect(rows[1]!.className).toBe("opened");
    expect(within(rows[0]!).getAllByText("1 minute ago").length).toBe(2);
    expect(within(rows[1]!).getAllByText("3 hours ago").length).toBe(2);
    expect(newer.getAttribute("href")).toBe("#anim/aaaa00000002");
    await userEvent.click(newer);
    expect(props.onHide).toHaveBeenCalled();
  });

  it("links to the bundled examples", async () => {
    const props = renderBrowser();
    await screen.findByText("Older");
    const example = screen.getByRole("link", {name: "3D ray tracing"});
    expect(example.getAttribute("href")).toBe("#example/f9ad362373e4");
    await userEvent.click(example);
    expect(props.onHide).toHaveBeenCalled();
  });

  it("deletes an animation after confirming", async () => {
    const props = renderBrowser("aaaa00000001");
    await screen.findByText("Older");
    const row = screen.getByText("Older").closest("tr")!;
    await userEvent.click(within(row).getByTitle("Delete"));
    expect(screen.getByText("That is the currently open animation.")).toBeTruthy();
    await userEvent.click(within(screen.getAllByRole("dialog").at(-1)!).getByRole("button", {name: "Delete"}));
    await waitFor(() => expect(screen.queryByText("Older")).toBeNull());
    expect(props.onMessage).toHaveBeenCalledWith("Animation deleted.");
    expect(props.onDeleted).toHaveBeenCalledWith("aaaa00000001");
    expect((await localStore.listDocuments()).map(d => d.id)).toEqual(["aaaa00000002"]);
  });

  it("keeps an animation when deletion is cancelled", async () => {
    const props = renderBrowser();
    await screen.findByText("Older");
    await userEvent.click(within(screen.getByText("Older").closest("tr")!).getByTitle("Delete"));
    await userEvent.click(screen.getAllByRole("button", {name: "Cancel"}).at(-1)!);
    expect((await localStore.listDocuments()).length).toBe(2);
    expect(props.onDeleted).not.toHaveBeenCalled();
  });

  it("shows a note when there are no animations", async () => {
    await clearStore();
    renderBrowser();
    expect(await screen.findByText("You have no saved animations yet.")).toBeTruthy();
    expect(screen.getByRole("button", {name: /Download all/}).hasAttribute("disabled")).toBe(true);
  });

  it("imports files and reports the result", async () => {
    const props = renderBrowser();
    await screen.findByText("Older");
    const doc = {...newDocument(), title: "Imported"};
    const file = new File([JSON.stringify(doc)], "imported.json", {type: "application/json"});
    await userEvent.upload(screen.getByTestId("importInput"), file);
    expect(await screen.findByText("Imported")).toBeTruthy();
    expect(props.onMessage).toHaveBeenCalledWith("1 animation and 0 images added.");
  });
});
