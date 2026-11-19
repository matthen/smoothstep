"""End-to-end test of video export: each format downloads a file.

Build and serve first (--isolate adds COOP/COEP headers):
  npm run build && python3 tools/serve.py 8822 build [--isolate]
Run (env RES=export width, default 128):
  uv run --with playwright python tools/test_export.py OUTDIR [formats] [tag]
SITES='{"name": "url", ...}' tests other copies, e.g. '{"live": "https://smoothstep.io"}'.
"""
import sys, json, asyncio, os, time
from playwright.async_api import async_playwright

OUT = sys.argv[1]
FORMATS = (sys.argv[2] if len(sys.argv) > 2 else "webm,png,gif,mp4").split(",")
TAG = sys.argv[3] if len(sys.argv) > 3 else ""
SITES = json.loads(os.environ.get("SITES", '{"local": "http://localhost:8822"}'))
os.makedirs(OUT, exist_ok=True)


async def route(r):
    url = r.request.url
    if "/api/" in url:
        return await r.fulfill(status=200, content_type="application/json", body="{}")
    if "google.com" in url:
        return await r.abort()
    return await r.continue_()


async def run_one(browser, site, base, fmt):
    ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    await ctx.route("**/*", route)
    page = await ctx.new_page()
    logs = []
    page.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)))
    page.on("console", lambda m: logs.append(f"console.{m.type} {m.text}"[:300]))
    pre = f"{OUT}/{site}_{fmt}{TAG}"
    res = {"site": site, "fmt": fmt}
    try:
        await page.goto(base + "/", wait_until="networkidle")
        await page.wait_for_timeout(800)
        await page.get_by_role("button", name="Continue").click()
        await page.wait_for_timeout(500)
        res["crossOriginIsolated"] = await page.evaluate("window.crossOriginIsolated")
        res["SAB"] = await page.evaluate("typeof SharedArrayBuffer")
        # Drag the duration slider from 12 s to ~1 s (40 px per second).
        sl = page.locator(".durationSlider").first
        bb = await sl.bounding_box()
        x, y = bb["x"] + bb["width"] / 2, bb["y"] + min(10, bb["height"] / 2)
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x - 200, y, steps=5)
        await page.mouse.move(x - 440, y, steps=5)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        await page.get_by_text("Export video", exact=True).first.click()
        await page.wait_for_timeout(500)
        modal = page.locator(".modal.export .modal-content")
        inputs = modal.locator("input[type=number]")
        await inputs.nth(0).fill(os.environ.get("RES", "128"))
        res["fps"] = await inputs.nth(1).input_value()
        await modal.locator("select").select_option(fmt)
        await page.wait_for_timeout(300)
        if fmt == "mp4":
            await modal.locator(".toggleAdvanced").click()
            await page.wait_for_timeout(400)
            res["ffmpegArgs"] = await modal.locator(".advancedSettings input").input_value()
        await modal.screenshot(path=f"{pre}_1_settings.png")
        t0 = time.time()
        async with page.expect_download(timeout=240_000) as dl_info:
            await modal.get_by_role("button", name="Export").click()
            await page.wait_for_timeout(250)
            await modal.screenshot(path=f"{pre}_2_rendering.png")
            res["text_rendering"] = await modal.locator(".modal-body").inner_text()
            if fmt in ("gif", "mp4"):
                try:
                    await modal.get_by_text("Encoding.", exact=True).wait_for(timeout=60_000)
                    await page.wait_for_timeout(1500 if fmt == "mp4" else 200)
                    await modal.screenshot(path=f"{pre}_3_encoding.png")
                    res["text_encoding"] = await modal.locator(".modal-body").inner_text()
                except Exception as e:
                    res["encoding_shot_err"] = str(e).splitlines()[0]
        dl = await dl_info.value
        res["secs"] = round(time.time() - t0, 1)
        res["filename"] = dl.suggested_filename
        path = f"{pre}_download_{dl.suggested_filename}"
        await dl.save_as(path)
        res["path"] = path
        res["size"] = os.path.getsize(path)
        await page.wait_for_timeout(500)
        res["modal_open_after"] = await page.locator(".modal.export").count()
    except Exception as e:
        res["error"] = str(e).splitlines()[0]
        try:
            await page.screenshot(path=f"{pre}_error.png")
        except Exception:
            pass
    res["logs"] = [l for l in logs if "google" not in l.lower()][-15:]
    await ctx.close()
    return res


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        results = []
        for fmt in FORMATS:
            for site, base in SITES.items():
                r = await run_one(b, site, base, fmt)
                print(json.dumps(r), flush=True)
                results.append(r)
        await b.close()
    json.dump(results, open(f"{OUT}/results{TAG}.json", "w"), indent=1)

asyncio.run(main())
