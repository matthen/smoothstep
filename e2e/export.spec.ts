// Each export format downloads a valid file, with no network access.
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';

import { offline } from './helpers';

const MAGIC: Record<string, (bytes: Buffer) => boolean> = {
  webm: b => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  mp4: b => b.subarray(4, 8).toString("latin1") === "ftyp",
  gif: b => b.subarray(0, 6).toString("latin1") === "GIF89a",
  png: b => b.subarray(0, 2).toString("latin1") === "PK",
};

for (const type of ["webm", "mp4", "gif", "png"]) {
  test(`exports ${type}`, async ({page, context}) => {
    const errors = await offline(context);
    await page.goto("./#example/534226b1d5ed");
    await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
    await page.locator(".durationInput").fill("1");
    await page.getByText("Export video", {exact: true}).click();
    const modal = page.locator(".modal.show .modal-content");
    await modal.locator("input[type=number]").first().fill("128");
    await expect(modal.locator("input[type=number]").nth(1)).toHaveValue("30");
    await modal.locator("select").selectOption(type);
    const download = page.waitForEvent("download", {timeout: 90_000});
    await modal.getByRole("button", {name: "Export"}).click();
    const file = await download;
    const path = test.info().outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const bytes = readFileSync(path);
    expect(file.suggestedFilename()).toBe("Minimal Animation." + (type === "png" ? "zip" : type));
    expect(MAGIC[type]!(bytes)).toBe(true);
    if (type === "png") {
      expect(Object.keys(unzipSync(bytes))).toHaveLength(30);
    }
    await expect(page.locator(".modal.show")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
