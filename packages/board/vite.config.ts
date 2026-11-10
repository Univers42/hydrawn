import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { inlineCss } from "./src/inlineCss.ts";

const engineSrc = fileURLToPath(new URL("../../engine/src", import.meta.url));

/** Swaps `boardCss`'s placeholder for the extracted stylesheet (`src/inlineCss.ts`). */
function boardCss(): Plugin {
  return {
    name: "hydrawn-board-css",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const sheets = Object.values(bundle).filter(
        (file) => file.type === "asset" && file.fileName.endsWith(".css"),
      );
      if (sheets.length !== 1 || sheets[0]?.type !== "asset") {
        throw new Error(`expected one stylesheet in the library build, found ${sheets.length}`);
      }
      const css = String(sheets[0].source);
      const entry = Object.values(bundle).find((file) => file.type === "chunk" && file.isEntry);
      if (entry?.type !== "chunk") throw new Error("the library build has no entry chunk");
      entry.code = inlineCss(entry.code, css);
    },
  };
}

/**
 * The engine's two `.wasm` files as files, not base64 in the JavaScript. Vite's library mode
 * inlines every asset (`shouldInline`, vite 7.3.6 `config.js:8819`) unless its id carries
 * `?no-inline`, and the wasm-bindgen glue names them in code this repo does not own
 * (`engine/pkg`, generated), so the query is added on the way in.
 */
function wasmAsFiles(): Plugin {
  const glue = /[\\/]engine[\\/]pkg[\\/]draw_(?:engine|trace)\.js$/;
  const reference = /new URL\('(draw_(?:engine|trace)_bg\.wasm)', import\.meta\.url\)/g;
  return {
    name: "hydrawn-wasm-as-files",
    enforce: "pre",
    transform(code, id) {
      if (!glue.test(id)) return null;
      const out = code.replace(reference, "new URL('$1?no-inline', import.meta.url)");
      if (out === code) throw new Error(`${id}: the wasm-bindgen glue no longer names its .wasm`);
      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [
    svelte({
      configFile: false,
      preprocess: vitePreprocess(),
      // The engine's Svelte adapter is runes-only, as in apps/web/svelte.config.js.
      compilerOptions: { runes: true },
    }),
    boardCss(),
    wasmAsFiles(),
  ],
  // Relative, so the .wasm and the chunks are found beside the module wherever it is served.
  base: "./",
  resolve: { alias: { "@osionos/draw-engine": engineSrc } },
  // Neither the public build nor the osionos one: `lib/mode.ts` reads both flags false,
  // and the host is told everything else through `mountBoard`'s options.
  define: {
    "import.meta.env.VITE_HYDRAWN_MODE": JSON.stringify("library"),
    // Library mode leaves `process.env.NODE_ENV` as written; there is no `process` in a page.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // Every asset a file of its own: the host serves the .wasm, and a CSP with no `data:`
    // in it refuses an inlined one.
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index", cssFileName: "index" },
  },
  // The image tracer's worker is a file of its own too, and its own .wasm with it.
  worker: { format: "es", plugins: () => [wasmAsFiles()] },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
