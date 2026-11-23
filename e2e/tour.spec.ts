// The guided tour: offered on a first visit, steps through the screen, and remembered afterwards.
import { expect, test, type Page } from '@playwright/test';

import { offline } from './helpers';

async function stepThrough(page: Page): Promise<string[]> {
  const titles: string[] = [];
  const popover = page.locator(".driver-popover");
  // The tour's code loads on first use, so wait for its first step.
  await expect(popover).toBeVisible();
  while (await popover.isVisible()) {
    titles.push(await popover.locator(".driver-popover-title").innerText());
    await popover.locator(".driver-popover-next-btn").click();
    await page.waitForTimeout(400);
  }
  return titles;
}

test("the welcome dialog offers the tour, which steps through the screen", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Take the tour"}).click();
  const titles = await stepThrough(page);
  expect(titles).toEqual([
    "Welcome to smoothstep.io", "Your shader", "The canvas", "Play and scrub", "The timeline", "Sliders", "Textures",
    "Save, share, render and help", "Over to you",
  ]);
  await expect(page.getByRole("tab", {name: "Timeline"})).toHaveAttribute("aria-selected", "true");

  // Next time, Continue is the main button and the tour is still in the Help menu.
  await page.goto("about:blank");
  await page.goto("./");
  await expect(page.getByRole("button", {name: "Continue"})).toHaveAttribute("data-variant", "filled");
  await page.getByRole("button", {name: "Continue"}).click();
  await page.getByRole("button", {name: "Help"}).click();
  await page.getByRole("menuitem", {name: "Take the tour"}).click();
  await expect(page.locator(".driver-popover-title")).toHaveText("Welcome to smoothstep.io");
  expect(errors).toEqual([]);
});

test("a first visit by a link offers the tour once", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/534226b1d5ed");
  const offer = page.getByText("New to smoothstep.io?");
  await expect(offer).toBeVisible();
  await page.getByRole("button", {name: "Take the tour"}).click();
  await expect(page.locator(".driver-popover-title")).toHaveText("Welcome to smoothstep.io");
  await page.keyboard.press("Escape");

  await page.goto("about:blank");
  await page.goto("./#example/534226b1d5ed");
  await expect(page.locator("#titleInput")).toHaveValue("Minimal Animation");
  await page.waitForTimeout(500);
  await expect(offer).toHaveCount(0);
  expect(errors).toEqual([]);
});
