"""End-to-end test of the app: save, upload a texture, survive a browser restart, download
everything and per-animation, import into a fresh browser.

Build and serve it under a subpath, to check it works away from the site root:
  npm run build
  mkdir -p /tmp/static-root && ln -sfn $PWD/build /tmp/static-root/sub
  python3 tools/serve.py 8841 /tmp/static-root
Run: [OFFLINE=1] uv run --with playwright --with pillow python tools/test_static.py OUTDIR [base]
Writes screenshots and downloads to OUTDIR and prints a JSON summary; exits 1 on a failed check.
"""
import asyncio, io, json, os, re, shutil, sys, zipfile
from playwright.async_api import async_playwright
from PIL import Image

OUT = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8841/sub/"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
OFFLINE = os.environ.get("OFFLINE") == "1"  # Block every request not to localhost.
SHADER = """void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = texture(iTexture0, uv);
}
"""
MAGENTA = (220, 20, 200)
os.makedirs(OUT, exist_ok=True)
results = {}
failures = []


def check(name, ok, detail=None):
    results[name] = {"ok": bool(ok), "detail": detail}
    if not ok:
        failures.append(name)


def big_png():
    # Wider than 4096px, so the upload should be shrunk to 4096 x 3072.
    b = io.BytesIO(); Image.new("RGB", (5000, 3750), MAGENTA).save(b, "PNG"); return b.getvalue()


async def launch(p, name):
    ctx = await p.chromium.launch_persistent_context(
        f"{OUT}/profile_{name}", headless=True, args=ARGS,
        viewport={"width": 1440, "height": 900}, accept_downloads=True)
    if OFFLINE:
        await ctx.route(re.compile(r"^https?://(?!localhost)"), lambda r: r.abort())
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Offline, the Google Font request fails; that's expected.
    page.on("console", lambda m: m.type == "error" and not (OFFLINE and "Failed to load resource" in m.text)
            and errors.append("console: " + m.text))
    return ctx, page, errors


async def canvas_center(page, shot):
    await page.wait_for_timeout(1200)
    path = f"{OUT}/{shot}.png"
    await page.locator("#canvasContainer canvas").first.screenshot(path=path)
    im = Image.open(path).convert("RGB")
    return im.getpixel((im.width // 2, im.height // 2))


def near(c, target, tol=40):
    return all(abs(a - b) <= tol for a, b in zip(c, target))


async def dismiss_alert(page):
    alert = page.locator(".modal.show").last
    text = await alert.inner_text()
    await alert.get_by_role("button", name="Ok").click()
    await page.wait_for_timeout(400)
    return text


async def file_menu(page, item):
    await page.get_by_text("File", exact=True).click()
    await page.locator(".dropdown-menu.show").get_by_text(item, exact=True).click()
    await page.wait_for_timeout(600)


async def main():
    for d in os.listdir(OUT):
        if d.startswith("profile_"):
            shutil.rmtree(f"{OUT}/{d}")
    async with async_playwright() as p:
        # 1. First visit: splash, then make and save an animation with an uploaded texture.
        ctx, page, errors = await launch(p, "a")
        await page.goto(BASE, wait_until="networkidle"); await page.wait_for_timeout(800)
        splash = await page.locator(".modal.show").inner_text()
        await page.screenshot(path=f"{OUT}/01_splash.png")
        check("splash mentions browser storage", "saved in this browser" in splash)
        check("no sign-in button", await page.get_by_text("Sign in").count() == 0
              and await page.get_by_text("Log in").count() == 0)
        await page.get_by_role("button", name="Continue").click(); await page.wait_for_timeout(400)
        check("no Terms button", await page.locator("#footerLinks").get_by_text("Terms").count() == 0)
        await page.evaluate("(c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c)", SHADER)
        await page.locator(".CodeMirror").click(); await page.keyboard.press("Shift+Enter")
        await page.get_by_text("Textures", exact=True).click(); await page.wait_for_timeout(300)
        await page.locator("div#textures .texture button").nth(0).click(); await page.wait_for_timeout(800)
        picker = page.locator(".modal.show .texturePickerModal")
        await picker.get_by_text("user uploads", exact=True).click()
        await picker.locator(".picker", has_text="upload new image").locator("button.select").click()
        await picker.locator(".dropzone input[type=file]").set_input_files(
            files=[{"name": "magenta.png", "mimeType": "image/png", "buffer": big_png()}])
        await picker.get_by_role("button", name="Upload", exact=True).click()
        await page.get_by_text("Image uploaded.").wait_for()
        check("upload alert", "Image uploaded." in await dismiss_alert(page))
        await page.screenshot(path=f"{OUT}/02_uploads.png")
        res_text = await picker.locator("img[alt='magenta.png preview'] + .resolution").inner_text()
        check("upload shrunk to 4096", "4096" in res_text and "3072" in res_text, res_text)
        await picker.locator("img[alt='magenta.png preview']").click()
        await page.get_by_role("button", name="Apply changes").click(); await page.wait_for_timeout(800)
        await page.locator("#titleInput").fill("Static test")
        await page.locator("#titleInput").press("Tab")
        await file_menu(page, "Save"); await page.wait_for_timeout(1200)
        url = page.url
        m = re.search(r"#anim/([a-f0-9]{12})$", url)
        check("saved: hash has id", m, url)
        doc_id = m and m.group(1)
        check("canvas shows uploaded texture", near(await canvas_center(page, "03_canvas"), MAGENTA))
        check("no page errors (first visit)", not errors, errors)
        await ctx.close()

        # 2. Browser restart: the animation and texture are still there.
        ctx, page, errors = await launch(p, "a")
        await page.goto(f"{BASE}#anim/{doc_id}", wait_until="networkidle"); await page.wait_for_timeout(1000)
        check("splash not shown for a hash link", await page.locator(".modal.show").count() == 0)
        check("title after restart", await page.locator("#titleInput").input_value() == "Static test")
        src = await page.locator("div#textures .texture img").first.get_attribute("src")
        check("slot 0 uses stored image", src.startswith("blob:"), src)
        check("canvas after restart", near(await canvas_center(page, "04_canvas_restart"), MAGENTA))
        await file_menu(page, "Open")
        browser_modal = page.locator(".modal.show .documentBrowser")
        rows = await browser_modal.locator("tbody tr").count()
        check("document list has 1 row", rows == 1, rows)
        await page.screenshot(path=f"{OUT}/05_open_dialog.png")
        async with page.expect_download() as dl:
            await browser_modal.get_by_role("button", name="Download all").click()
        zip_path = f"{OUT}/export.zip"
        await (await dl.value).save_as(zip_path)
        async with page.expect_download() as dl:
            await browser_modal.locator("button[title=Download]").first.click()
        one_path = f"{OUT}/one.smoothstep.json"
        await (await dl.value).save_as(one_path)
        # Opening an animation from the list navigates via the hash.
        await browser_modal.get_by_text("Static test").click(); await page.wait_for_timeout(1500)
        check("open from list", page.url.endswith(f"#anim/{doc_id}") and
              await page.locator("#titleInput").input_value() == "Static test")
        # A bundled example.
        await page.goto(f"{BASE}#example/534226b1d5ed"); await page.wait_for_timeout(1500)
        check("example loads", await page.locator("#titleInput").input_value() == "Minimal Animation",
              await page.locator("#titleInput").input_value())
        await page.goto(BASE, wait_until="networkidle"); await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{OUT}/06_splash_with_recent.png")
        check("splash lists recent animation", "Static test" in await page.locator(".modal.show").inner_text())
        check("no page errors (restart)", not errors, errors)
        await ctx.close()

        z = zipfile.ZipFile(zip_path)
        names = sorted(z.namelist())
        manifest = json.loads(z.read("manifest.json"))
        image_entry = manifest["images"][0]
        im = Image.open(io.BytesIO(z.read(image_entry["file"])))
        check("zip contents", names == sorted([
            "manifest.json", f"animations/{doc_id}.json", f"thumbnails/{doc_id}.png", image_entry["file"]]), names)
        check("zip image is 4096x3072 PNG", im.size == (4096, 3072) and im.format == "PNG"
              and image_entry["file"].endswith(".png"), [im.size, im.format, image_entry["file"]])
        one = json.load(open(one_path))
        check("single file embeds image", one["format"] == "smoothstep-animation"
              and list(one["images"]) == [image_entry["id"]])

        # 3. A fresh browser imports the zip, then the single file (already there).
        ctx, page, errors = await launch(p, "b")
        await page.goto(f"{BASE}#new", wait_until="networkidle"); await page.wait_for_timeout(800)
        await file_menu(page, "Open")
        browser_modal = page.locator(".modal.show .documentBrowser")
        await browser_modal.locator("input[type=file]").set_input_files(zip_path)
        await page.wait_for_timeout(1000)
        msg = await dismiss_alert(page)
        check("zip import message", "1 animation and 1 image added." in msg, msg)
        check("imported list has 1 row", await browser_modal.locator("tbody tr").count() == 1)
        await browser_modal.locator("input[type=file]").set_input_files(one_path)
        await page.wait_for_timeout(1000)
        msg = await dismiss_alert(page)
        check("re-import is a no-op", "1 animation already here." in msg, msg)
        await page.screenshot(path=f"{OUT}/07_imported.png")
        await browser_modal.get_by_text("Static test").click(); await page.wait_for_timeout(1500)
        check("imported canvas", near(await canvas_center(page, "08_canvas_imported"), MAGENTA))
        check("no page errors (import)", not errors, errors)
        await ctx.close()

        # 4. Another fresh browser imports just the single-animation file.
        ctx, page, errors = await launch(p, "c")
        await page.goto(f"{BASE}#new", wait_until="networkidle"); await page.wait_for_timeout(800)
        await file_menu(page, "Open")
        browser_modal = page.locator(".modal.show .documentBrowser")
        await browser_modal.locator("input[type=file]").set_input_files(one_path)
        await page.wait_for_timeout(1000)
        msg = await dismiss_alert(page)
        check("single import message", "1 animation and 1 image added." in msg, msg)
        await browser_modal.get_by_text("Static test").click(); await page.wait_for_timeout(1500)
        check("single-file canvas", near(await canvas_center(page, "09_canvas_single"), MAGENTA))

        async def import_file(path):
            await file_menu(page, "Open")
            modal = page.locator(".modal.show .documentBrowser")
            await modal.locator("input[type=file]").set_input_files(path)
            await page.get_by_text(re.compile("added|already here|couldn't be read")).wait_for()
            msg = await dismiss_alert(page)
            rows = await modal.locator("tbody tr").count()
            await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
            return msg, rows

        # 5. The same document as bare JSON, keys in another order, is recognised.
        bare_path = f"{OUT}/bare.json"
        json.dump(dict(reversed(list(one["document"].items()))), open(bare_path, "w"))
        msg, rows = await import_file(bare_path)
        check("bare JSON with other key order is a no-op", "1 animation already here." in msg and rows == 1, msg)
        # Edit and save the local copy, then import the older file twice: one extra copy, not two.
        await page.evaluate("document.querySelector('.CodeMirror').CodeMirror.setValue('// edited')")
        await page.keyboard.press("Control+s"); await page.wait_for_timeout(1500)
        msg1, _ = await import_file(one_path)
        msg2, rows = await import_file(one_path)
        check("older import kept alongside, once", "1 animation and 0 images added." in msg1
              and "1 animation already here." in msg2 and rows == 2, [msg1, msg2, rows])

        # 6. File -> New with unsaved changes: cancel keeps URL and code; accept (even from #new) resets.
        url_before = page.url
        await page.evaluate("document.querySelector('.CodeMirror').CodeMirror.setValue('// unsaved')")
        page.once("dialog", lambda d: asyncio.ensure_future(d.dismiss()))
        await file_menu(page, "New"); await page.wait_for_timeout(800)
        code = await page.evaluate("document.querySelector('.CodeMirror').CodeMirror.getValue()")
        check("cancel New keeps URL and code", page.url == url_before and code == "// unsaved", [page.url, code])
        page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await file_menu(page, "New"); await page.wait_for_timeout(1500)
        check("New goes to #new", page.url.endswith("#new"), page.url)
        await page.evaluate("document.querySelector('.CodeMirror').CodeMirror.setValue('// unsaved again')")
        page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await file_menu(page, "New"); await page.wait_for_timeout(1500)
        code = await page.evaluate("document.querySelector('.CodeMirror').CodeMirror.getValue()")
        check("New from #new resets the editor", "Getting started" in code, code[:60])
        check("no page errors (round trip)", not errors, errors)
        await ctx.close()



def report():
    print(json.dumps(results, indent=1))
    print("FAILED: " + ", ".join(failures) if failures else "ALL OK")


try:
    asyncio.run(main())
except Exception:
    report()
    raise
report()
sys.exit(1 if failures else 0)
