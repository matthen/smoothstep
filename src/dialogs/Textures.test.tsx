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

function renderTextures(textures: TextureSlot[] = emptyTextures()) {
  const props = {textures, onChange: vi.fn(), onMessage: vi.fn()};
  render(<Textures {...props} />);
  return props;
}

const picker = () => screen.getAllByRole("dialog")[0]!;

describe("Textures and TexturePicker", () => {
  it("shows a button per slot", () => {
    renderTextures();
    expect(screen.getAllByRole("img", {name: /iTexture\d preview/}).length).toBe(8);
  });

  it("picks a built-in texture", async () => {
    const props = renderTextures();
    await userEvent.click(screen.getByAltText("iTexture2 preview"));
    expect(within(picker()).getByText("iTexture2")).toBeTruthy();
    expect(within(picker()).getByRole("tab", {name: "special"}).getAttribute("aria-selected")).toBe("true");
    await userEvent.click(within(picker()).getByRole("tab", {name: "fonts"}));
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
    await userEvent.click(screen.getByAltText("iTexture0 preview"));
    await userEvent.click(within(picker()).getByRole("tab", {name: "fonts"}));
    await userEvent.click(within(picker()).getByAltText("fonts/1.png preview"));
    await userEvent.click(within(picker()).getByRole("button", {name: "Cancel"}));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("uploads an image and picks it", async () => {
    const props = renderTextures();
    await userEvent.click(screen.getByAltText("iTexture0 preview"));
    await userEvent.click(within(picker()).getByRole("tab", {name: "user uploads"}));
    await userEvent.click(within(picker()).getByText("upload new image"));
    expect(within(picker()).getByText("Images larger than 4096 px are scaled down.")).toBeTruthy();
    const input = picker().querySelector<HTMLInputElement>(".dropzone input")!;
    await userEvent.upload(input, new File(["x"], "photo.png", {type: "image/png"}));
    expect(await within(picker()).findByText("photo.png")).toBeTruthy();
    await userEvent.click(within(picker()).getByRole("button", {name: "Upload"}));
    await waitFor(() => expect(props.onMessage).toHaveBeenCalledWith("Image uploaded."));
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
    await userEvent.click(screen.getByAltText("iTexture0 preview"));
    expect(within(picker()).getByRole("tab", {name: "user uploads"}).getAttribute("aria-selected")).toBe("true");
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
    await userEvent.click(screen.getByAltText("iTexture3 preview"));
    const other = within(picker()).getByAltText("texture preview").closest(".picker")!;
    expect(other.className).toContain("selected");
  });
});
