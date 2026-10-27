import { readdirSync, statSync } from "node:fs";

/**
 * Source scans' shared walk: the tests that judge the code by reading it (`paste.test.ts`,
 * `sinks.test.ts`) list files the same way, so a new file is covered without a list.
 */

/** Every `.ts`/`.svelte` under a root, tests excluded. */
export function sourcesIn(dir: URL): URL[] {
  // `new URL(".", …)` on a URL with no trailing slash resolves to its *parent*, so a
  // directory has to be spelled as one before the walk starts — otherwise the walk climbs
  // out of the tree and never comes back.
  const root = new URL(`${dir.pathname.replace(/\/?$/, "/")}`, dir);
  const out: URL[] = [];
  for (const entry of readdirSync(root)) {
    const path = new URL(entry, root);
    if (statSync(path).isDirectory()) {
      out.push(...sourcesIn(path));
    } else if (/\.(ts|svelte)$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/** A path under the engine checkout (`engine/`). */
export const engineSrc = (path: string) => new URL(`../../../engine/${path}`, import.meta.url);

/** A path under the front's `src/`. */
export const webSrc = (path: string) => new URL(`../src/${path}`, import.meta.url);

/** The path from `apps/web/` or `engine/`, whichever the file is under, for a failure. */
export const label = (path: URL) => {
  const pathname = decodeURIComponent(path.pathname);
  for (const root of ["/apps/web/", "/engine/"]) {
    const at = pathname.indexOf(root);
    if (at >= 0) return pathname.slice(at + 1);
  }
  return pathname;
};
