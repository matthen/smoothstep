// The Sliders tab: a slider for each iFloat the code uses, which sets its value, or holds an
// animated one until the animation plays. And the timeline's rows, which grow as they're needed.
import { expect, test } from '@playwright/test';

import { canvasCenter, near, offline, setCode } from './helpers';

const GREY = "#define brightness iFloat0\n#define unused iFloat5\n" +
  "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(vec3(brightness), 1.);\n}";

test.beforeEach(async ({context}) => {
  await context.addInitScript(() => {
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("smoothstep.tour", "taken");
    }
  });
});

test("a slider sets an iFloat, with a range of its own, and both are saved", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await setCode(page, GREY.replace("#define unused iFloat5\n", ""));
  await page.keyboard.press("Shift+Enter");
  await page.getByRole("tab", {name: "Sliders"}).click();
  await expect(page.locator(".sliderRow")).toHaveCount(1);
  expect(near(await canvasCenter(page), [0, 0, 0])).toBe(true);

  await page.getByLabel("brightness maximum").fill("2");
  await page.getByLabel("brightness maximum").press("Enter");
  await page.getByLabel("brightness value").fill("1");
  await page.getByLabel("brightness value").press("Enter");
  expect(near(await canvasCenter(page), [255, 255, 255])).toBe(true);
  const thumb = page.locator(".sliderRow .mantine-Slider-thumb");
  await expect(thumb).toHaveAttribute("aria-valuemax", "2");
  await expect(thumb).toHaveAttribute("aria-valuenow", "1");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveURL(/#anim\/[a-f0-9]+$/);
  const saved = page.url();
  await page.goto("about:blank");
  await page.goto(saved);
  await page.getByRole("tab", {name: "Sliders"}).click();
  await expect(page.getByLabel("brightness value")).toHaveValue("1.000");
  await expect(page.getByLabel("brightness maximum")).toHaveValue("2");
  expect(near(await canvasCenter(page), [255, 255, 255])).toBe(true);
  expect(errors).toEqual([]);
});

test("an animated slider holds its value until the animation plays", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./#example/f9ad362373e4");
  await expect(page.locator("#titleInput")).toHaveValue("3D ray marching");
  await page.getByRole("tab", {name: "Sliders"}).click();
  const value = page.getByLabel("sphereY value");
  await expect(value).toHaveValue("0.450");
  await value.fill("5");
  await value.press("Enter");
  await expect(page.locator(".sliderRow[data-held]")).toHaveCount(1);
  await expect(value).toHaveValue("5.000");

  await page.locator(".playerButtons button").nth(1).click();
  await expect(page.locator(".sliderRow[data-held]")).toHaveCount(0);
  await expect(value).not.toHaveValue("5.000");
  expect(errors).toEqual([]);
});

test("the timeline shows three rows, or as many as the code uses, and ⊕ adds the next", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  const rows = page.locator(".timeArea .variableRow");
  await expect(rows).toHaveCount(3);
  await page.getByRole("button", {name: "Add a row"}).click();
  await expect(rows).toHaveCount(4);

  await setCode(page, GREY);
  await expect(rows).toHaveCount(6);
  await expect(page.locator(".rowLabel").nth(5)).toHaveText("unused");
  expect(errors).toEqual([]);
});
