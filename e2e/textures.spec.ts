// The Textures tab shows three slots to start, or as many as the code uses, and ⊕ adds the next.
import { expect, test } from '@playwright/test';

import { offline, setCode } from './helpers';

test.beforeEach(async ({context}) => {
  await context.addInitScript(() => {
    if (window.location.protocol.startsWith("http")) {
      window.localStorage.setItem("smoothstep.tour", "taken");
    }
  });
});

test("the textures tab shows three slots, or as many as the code uses, and ⊕ adds the next", async ({page, context}) => {
  const errors = await offline(context);
  await page.goto("./");
  await page.getByRole("button", {name: "Continue"}).click();
  await page.getByRole("tab", {name: "Textures"}).click();
  const slots = page.locator("#textures .texture");
  await expect(slots).toHaveCount(3);
  await page.getByRole("button", {name: "Add a texture slot"}).click();
  await expect(slots).toHaveCount(4);

  await setCode(page, "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n" +
    "  fragColor = texture(iTexture5, fragCoord / iResolution.xy);\n}");
  await expect(slots).toHaveCount(6);
  await expect(slots.last()).toContainText("iTexture5");
  expect(errors).toEqual([]);
});
