/**
 * `boardCss`: the library's stylesheet as a string, for a host to adopt into a shadow root.
 *
 * Vite's library build extracts the Svelte components' CSS into one asset, after the
 * JavaScript is written, so the entry cannot import it. The entry exports this placeholder
 * instead, and the build swaps it for the asset's text once both exist (`vite.config.ts`).
 */
export const CSS_PLACEHOLDER = "__HYDRAWN_BOARD_CSS__";

/** `code` with the placeholder's string literal replaced by `css`'s. Exactly one, or it throws. */
export function inlineCss(code: string, css: string): string {
  const literal = JSON.stringify(CSS_PLACEHOLDER);
  const count = code.split(literal).length - 1;
  if (count !== 1) {
    throw new Error(`expected the CSS placeholder ${literal} once in the entry, found ${count}`);
  }
  // A function, so `$&` and friends in the stylesheet are not read as replacement patterns.
  return code.replace(literal, () => JSON.stringify(css));
}
