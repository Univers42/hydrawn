# @hydrawn/board

The board as a library: `mountBoard()` renders `apps/web/src/lib/board/Board.svelte` — the
component the app's `/boards/[slug]` route renders — into a host page's element or shadow
root. One board, two hosts; there is no second copy.

```ts
import { boardCss, BoardStoreError, mountBoard, type BoardStore } from "@hydrawn/board";

const shadow = host.attachShadow({ mode: "open" });
const sheet = new CSSStyleSheet();
sheet.replaceSync(boardCss);
shadow.adoptedStyleSheets = [sheet];

const board = mountBoard(shadow, { store, slug, title, theme: "dark", engineUrl });
board.setTheme("light");
await board.destroy();
```

That is `e2e/fixture/fixture.js`, which the browser test drives.

## What it does not do

- **No live collaboration, no Share, no gallery.** The host has no relay and no gallery: the
  board is mounted with `collaboration: false`, the main menu has no "My drawings", and a
  template is drawn into the open board instead of creating another.
- **`readOnly` is "never writes", not a view mode.** The store, the draft and the thumbnail
  are never written, and the hand tool is selected; the toolbar is still there and a local
  edit is still possible — it is simply never saved.
- **No fonts.** The app serves Inter from its own `/fonts`; the library ships no font files,
  so the chrome falls back to the system UI font.
- **`dist/index.js` is not minified** (Vite's library mode keeps ES output readable so a
  host's bundler can tree-shake it). The host's own build minifies it.

## What the host provides

**A `BoardStore`** (`packages/contract/src/boardStore.ts`). A host whose routes keep whole
scenes by `rev`, as the osionos bridge does, passes `createHostedStore(client, newTitle)`
instead of writing one: it implements `getBoard`, `replaceBoard`, `createBoard` and
`putThumbnail` (`HostedBoardApi`) and the library merges each save by the contract's rule.
Mounted, the board calls:

| Call                          | When                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `get(slug)`                   | once, on mount. Throw `new BoardStoreError(404, …)` for a new board. |
| `patchElements`               | every autosave (800 ms debounce), and on `destroy()`.                |
| `putThumbnail`                | after saves, with a PNG of the board.                                |
| `create`, `replace`           | never — `openBoard` is not given, so templates insert in place.      |
| `list`, `remove`, `thumbnail` | never — the gallery's.                                               |

A failure the board must tell apart is a `BoardStoreError(status, code, message)`: 413 is
too large, 400/422 refused (neither retried); anything else is retried.

**An open shadow root** (or an element). A closed one hides the board's nodes from the
events it reads, and menus close on every click inside them. Mounted in a plain element,
`boardCss`'s element rules (`button`, `input`, `*`) apply to the whole page.

**The `.wasm`.** `dist/draw_engine_bg.wasm` (and the tracer's, under `dist/assets/`) is
fetched beside `dist/index.js` by default; `engineUrl` points it elsewhere.

**A CSP** that allows what the browser test runs under (`e2e/serve.mjs`):

```
script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; style-src-attr 'unsafe-inline';
worker-src 'self'; img-src 'self' blob: data:; connect-src 'self'
```

`style-src-attr` because the chrome positions itself with style attributes. An embed the
user places needs `frame-src` for its host (`scripts/osionos-csp.mjs` lists them). The lazy
Mermaid chunks contain lodash's `Function("return this")`, only reached where `self` is not
an object — never in a page or a worker.

**Typescript:** the declarations re-export the contract's TypeScript source, so a consumer
needs `allowImportingTsExtensions` (with `noEmit`).

## Keys

Mounted, the board hears only the keys typed into it (`DrawSurface`'s `onAppShortcut`): the
window is the host's.

## Commands

```sh
pnpm --filter @hydrawn/board build          # dist/
pnpm --filter @hydrawn/board test           # vitest
pnpm --filter @hydrawn/board test:browser   # build, then Playwright against dist/
```

All three need `engine/pkg` (`make wasm`, or CI's `engine-pkg` artifact).
