import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../test/render';
import { emptyTextures, type TextureSlot } from '../lib/document';
import * as localStore from '../lib/localStore';
import { addImage, clearStore } from './testUtils';
import Textures from './Textures';

// jsdom can't decode images, so uploads are stored directly.
vi.mock('../lib/localStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/localStore')>();
  return {...actual, addUploadedImage: vi.fn((file: File) => addImage("bbbb00000001", file.name))};
});

afterEach(cleanup);
beforeEach(clearStore);

function renderTextures(textures: TextureSlot[] = emptyTextures(), count = 8) {
  const props = {textures, count, onChange: vi.fn(), onAdd: vi.fn(), onMessage: vi.fn()};
  render(<Textures {...props} />);
  return props;
}

const picker = () => screen.getAllByRole("dialog")[0]!;

// The picker is loaded on first open, so wait for it.
async function openSlot(id: string) {
  await userEvent.click(screen.queryByAltText(id + " preview") ?? screen.getByRole("button", {name: new RegExp(`^${id} is empty`)}));
  await screen.findByRole("dialog");
}

describe("Textures and TexturePicker", () => {
  it("shows a button per slot, which says when the slot is empty", () => {
    const textures = emptyTextures();
    textures[1] = {id: "iTexture1", url: "fonts/1.png", isUserUploaded: false};
    renderTextures(textures);
    expect(screen.getAllByRole("button", {name: /^iTexture\d is empty: choose an image$/}).length).toBe(7);
    expect(screen.getByAltText("iTexture1 preview")).toBeTruthy();
  });

  it("shows only the first slots it's given, and a button to add the next", async () => {
    const props = renderTextures(emptyTextures(), 3);
    expect(screen.getAllByRole("button", {name: /is empty/}).map(b => b.getAttribute("aria-label"))).toEqual(
      [0, 1, 2].map(i => `iTexture${i} is empty: choose an image`));
    await userEvent.click(screen.getByRole("button", {name: "Add a texture slot"}));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("has no add button when every slot shows", () => {
    renderTextures();
    expect(screen.queryByRole("button", {name: "Add a texture slot"})).toBeNull();
  });

  it("picks a built-in texture", async () => {
    const props = renderTextures();
    await openSlot("iTexture2");
    expect(within(picker()).getByText("iTexture2")).toBeTruthy();
    // Every group is on the one page, each with a caption, and so are the textures.
    const fonts = within(picker()).getByRole("region", {name: "Font sheets"});
    expect(within(fonts).getByText("Text characters in a grid, for drawing text.")).toBeTruthy();
    expect(within(fonts).getByText("Courier Prime")).toBeTruthy();
    expect(within(picker()).getByRole("region", {name: "Photos"})).toBeTruthy();
    expect(within(picker()).queryByAltText("special/black.png preview")).toBeNull();
    await userEvent.click(within(picker()).getByAltText("fonts/1.png preview"));
    expect(within(picker()).getByAltText("fonts/1.png preview").closest(".picker")!.className).toContain("selected");
    expect(within(picker()).getAllByText("512 × 192").length).toBeGreaterThan(0);
    await userEvent.click(within(picker()).getByRole("button", {name: "Apply changes"}));
    const textures = props.onChange.mock.calls[0]![0] as TextureSlot[];
    expect(textures[2]).toEqual({id: "iTexture2", url: "fonts/1.png", isUserUploaded: false});
    expect(textures[1]).toEqual(emptyTextures()[1]);
  });

  it("cancel leaves the textures alone", async () => {
    const props = renderTextures();
    await openSlot("iTexture0");
    await userEvent.click(within(picker()).getByAltText("fonts/1.png preview"));
    await userEvent.click(within(picker()).getByRole("button", {name: "Cancel"}));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("adds an image and picks it", async () => {
    const props = renderTextures();
    await openSlot("iTexture0");
    await userEvent.click(within(picker()).getByRole("button", {name: "Add image"}));
    expect(within(picker()).getByText("Images larger than 4096 px are scaled down.")).toBeTruthy();
    const input = picker().querySelector<HTMLInputElement>(".dropzone input")!;
    await userEvent.upload(input, new File(["x"], "photo.png", {type: "image/png"}));
    expect(await within(picker()).findByText("photo.png")).toBeTruthy();
    await userEvent.click(within(picker()).getByRole("button", {name: "Add"}));
    await waitFor(() => expect(props.onMessage).toHaveBeenCalledWith("Image added."));
    await userEvent.click(await within(picker()).findByAltText("photo.png preview"));
    expect(within(picker()).getByText("64 × 32")).toBeTruthy();
    await userEvent.click(within(picker()).getByRole("button", {name: "Apply changes"}));
    const textures = props.onChange.mock.calls[0]![0] as TextureSlot[];
    expect(textures[0]).toEqual({id: "iTexture0", url: "bbbb00000001", isUserUploaded: true});
  });

  it("deletes an upload after confirming, but not the one in use", async () => {
    await addImage("cccc00000001", "keep.png", 2);
    await addImage("cccc00000002", "remove.png", 1);
    const textures = emptyTextures();
    textures[0] = {id: "iTexture0", url: "cccc00000001", isUserUploaded: true};
    const props = renderTextures(textures);
    await openSlot("iTexture0");
    const keep = (await within(picker()).findByAltText("keep.png preview")).closest(".picker") as HTMLElement;
    expect(within(keep).queryByTitle("Delete")).toBeNull();
    const remove = within(picker()).getByAltText("remove.png preview").closest(".picker") as HTMLElement;
    await userEvent.click(within(remove).getByTitle("Delete"));
    const confirm = screen.getAllByRole("dialog").at(-1)!;
    expect(within(confirm).getByText("remove.png")).toBeTruthy();
    await userEvent.click(within(confirm).getByRole("button", {name: "Delete"}));
    await waitFor(() => expect(props.onMessage).toHaveBeenCalledWith("Image deleted."));
    await waitFor(() => expect(within(picker()).queryByAltText("remove.png preview")).toBeNull());
    expect((await localStore.listImages()).map(i => i.id)).toEqual(["cccc00000001"]);
  });

  it("lists uploads the animation uses that this browser doesn't have", async () => {
    const textures = emptyTextures();
    textures[3] = {id: "iTexture3", url: "dddd00000001", isUserUploaded: true};
    renderTextures(textures);
    await openSlot("iTexture3");
    const other = within(picker()).getByAltText("texture preview").closest(".picker")!;
    expect(other.className).toContain("selected");
  });

  it("empties a slot", async () => {
    const textures = emptyTextures();
    textures[2] = {id: "iTexture2", url: "fonts/1.png", isUserUploaded: false};
    const props = renderTextures(textures);
    await openSlot("iTexture2");
    await userEvent.click(within(picker()).getByRole("button", {name: "Empty the slot"}));
    await userEvent.click(within(picker()).getByRole("button", {name: "Apply changes"}));
    const picked = props.onChange.mock.calls[0]![0] as TextureSlot[];
    expect(picked[2]).toEqual(emptyTextures()[2]);
  });
});
