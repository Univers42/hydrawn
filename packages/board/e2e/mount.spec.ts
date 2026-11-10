import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * The library as a host uses it: mounted into an open shadow root, saving to an in-memory
 * BoardStore, under `script-src 'self' 'wasm-unsafe-eval'` (`serve.mjs`). Holds that a drawn
 * shape reaches the store, and that destroy() gives back what the board took from the page.
 */

interface Live {
  mediaListeners: number;
  resizeObservers: number;
  workers: number;
  intervals: number;
  frames: number;
}

type Calls = [string, ...unknown[]][];

/** The listeners the page's own `window` and `document` hold, by type, read through CDP. */
async function globalListeners(cdp: CDPSession): Promise<string[]> {
  const types: string[] = [];
  for (const expression of ["window", "document"]) {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    if (!result.objectId) throw new Error(`no object for ${expression}`);
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
      objectId: result.objectId,
    });
    types.push(...listeners.map((listener) => `${expression}:${listener.type}`));
    await cdp.send("Runtime.releaseObject", { objectId: result.objectId });
  }
  return types.sort();
}

const live = (page: Page): Promise<Live> =>
  page.evaluate(() => (window as never as { __live: Live }).__live);
const calls = (page: Page): Promise<Calls> =>
  page.evaluate(() => (window as never as { __store: { calls: Calls } }).__store.calls);

/** Draws a rectangle in the open middle of the board, away from the chrome over it. */
async function drawRectangle(page: Page): Promise<void> {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("the canvas has no box");
  // `e2e/board.ts`'s OPEN_CANVAS: the chrome floats over the canvas outside it.
  await page.mouse.click(box.x + 1100, box.y + 600);
  await page.keyboard.press("r");
  await page.mouse.move(box.x + 500, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 650, box.y + 350, { steps: 6 });
  await page.mouse.up();
}

const writes = async (page: Page): Promise<string[]> =>
  (await calls(page)).map(([name]) => name).filter((name) => name !== "getBoard");

test("mounted in a shadow root, a drawn shape is saved, and destroy gives everything back", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto("/");
  await page.waitForFunction(() => "__fixtureReady" in window);
  const cdp = await page.context().newCDPSession(page);
  const before = { listeners: await globalListeners(cdp), live: await live(page) };

  await page.evaluate(() => (window as never as { __mount: () => void }).__mount());

  // Playwright's locators pierce open shadow roots, so these find the board inside one.
  const board = page.getByRole("application");
  await expect(board).toBeVisible();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  // Opened from the store: a 404, so the board is the new one the title names.
  await expect.poll(() => calls(page)).toContainEqual(["getBoard", "fixture"]);
  await expect(page.locator(".hydrawn-board")).toHaveCount(1);

  await drawRectangle(page);

  await expect
    .poll(async () => (await calls(page)).filter(([name]) => name === "replaceBoard").length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  const saved = await page.evaluate(() => {
    const boards = (
      window as never as {
        __store: {
          boards: Map<string, { scene: { elements: { type: string; isDeleted: boolean }[] } }>;
        };
      }
    ).__store.boards;
    return boards
      .get("fixture")
      ?.scene.elements.filter((element) => !element.isDeleted)
      .map((element) => element.type);
  });
  expect(saved).toEqual(["rectangle"]);

  const mounted = await globalListeners(cdp);
  expect(mounted.length, "the board listens on the page while it is up").toBeGreaterThan(
    before.listeners.length,
  );

  await page.evaluate(() =>
    (window as never as { __board: { destroy(): Promise<void> } }).__board.destroy(),
  );
  await expect(page.locator(".hydrawn-board")).toHaveCount(0);
  // Two frames: anything a loop re-requests after destroy is still pending after them.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

  expect(await globalListeners(cdp)).toEqual(before.listeners);
  expect(await live(page)).toEqual(before.live);
  expect(problems, "the console stays clean under the host's CSP").toEqual([]);
  // Zod's JIT probe among them: `new Function` under no 'unsafe-eval' (`src/jitless.ts`).
  expect(
    await page.evaluate(() => (window as never as { __violations: string[] }).__violations),
  ).toEqual([]);
});

test("setTheme repaints the mounted board without touching the host's document", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => "__fixtureReady" in window);
  await page.evaluate(() => (window as never as { __mount: () => void }).__mount());
  const root = page.locator(".hydrawn-board");
  await expect(page.getByRole("application")).toBeVisible();
  await expect(root).not.toHaveClass(/\bdark\b/);

  await page.evaluate(() =>
    (window as never as { __board: { setTheme(theme: string): void } }).__board.setTheme("dark"),
  );
  await expect(root).toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
    false,
  );
  await page.evaluate(() =>
    (window as never as { __board: { destroy(): Promise<void> } }).__board.destroy(),
  );
});

test("read-only, a drawn shape is never written to the store", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => "__fixtureReady" in window);
  await page.evaluate(() =>
    (window as never as { __mount: (options: object) => void }).__mount({ readOnly: true }),
  );
  await expect(page.getByRole("application")).toBeVisible();
  await expect.poll(() => calls(page)).toContainEqual(["getBoard", "fixture"]);

  await drawRectangle(page);
  // Past the autosaver's debounce (`DEFAULT_DEBOUNCE_MS`, 800 in `autosaver.ts`) and then
  // some: a save would have gone by now. Caveat: a fixed wait proves "not within 2.5 s".
  await page.waitForTimeout(2_500);
  expect(await writes(page)).toEqual([]);

  await page.evaluate(() =>
    (window as never as { __board: { destroy(): Promise<void> } }).__board.destroy(),
  );
  // destroy() sends what is pending; read-only, nothing is.
  expect(await writes(page)).toEqual([]);
});

test("in a shadow root, a press inside an open menu leaves it open, and one outside closes it", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => "__fixtureReady" in window);
  await page.evaluate(() => (window as never as { __mount: () => void }).__mount());
  await expect(page.getByRole("application")).toBeVisible();

  await page.getByRole("button", { name: "Open main menu" }).click();
  const menu = page.getByRole("menu", { name: "Main menu" });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  if (!box) throw new Error("the menu has no box");
  // Its own padding: inside the menu, on no item. Heard on `window`, this press's target is
  // the shadow host, which the menu does not contain (`shadowRoot.ts`).
  await page.mouse.click(box.x + 2, box.y + 2);
  await expect(menu).toBeVisible();

  await page.mouse.click(box.x + box.width + 400, box.y + 400);
  await expect(menu).toBeHidden();
  await page.evaluate(() =>
    (window as never as { __board: { destroy(): Promise<void> } }).__board.destroy(),
  );
});
