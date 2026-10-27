import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { engineSrc, label, sourcesIn, webSrc } from "../../../test/sources.ts";

/**
 * No HTML sinks, in the front or the engine's host.
 *
 * osionos frames this app and hands it a token for the bridge (`host/token.ts`). Markup
 * someone drew or pasted that reaches one of these sinks runs as this origin, with that
 * token in reach. There are none today; this keeps the count at zero, so adding one is a
 * decision made in review, here, rather than a line nobody noticed.
 *
 * `srcdoc` is the one HTML-carrying attribute in use: an embed document the engine builds,
 * framed with a sandbox that never grants `allow-same-origin` to it (`embed.ts`,
 * `sandboxFor`), so it runs at an opaque origin, not this one. It may appear only there.
 */
const SINKS =
  /\{@html\b|\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(/;
const SRCDOC_ALLOWED = ["src/lib/draw-chrome/embed.ts", "src/lib/draw-chrome/DrawSurface.svelte"];

const SOURCES = [...sourcesIn(webSrc("")), ...sourcesIn(engineSrc("src/"))];

describe("HTML sinks", () => {
  it("scans the whole front and the engine host", () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some((path) => label(path).endsWith("routes/boards/[slug]/+page.svelte"))).toBe(
      true,
    );
    expect(SOURCES.some((path) => label(path).endsWith("engine/src/vectorize.ts"))).toBe(true);
  });

  it("has none", () => {
    for (const path of SOURCES) {
      expect(readFileSync(path, "utf8"), label(path)).not.toMatch(SINKS);
    }
  });

  it("uses srcdoc only for the sandboxed embed frame", () => {
    for (const path of SOURCES) {
      if (!/\bsrcdoc\b/.test(readFileSync(path, "utf8"))) continue;
      expect(
        SRCDOC_ALLOWED.some((allowed) => label(path).endsWith(allowed)),
        label(path),
      ).toBe(true);
    }
  });
});
