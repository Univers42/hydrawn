import { mount, unmount } from "svelte";
import initEngine from "../../../engine/pkg/draw_engine.js";
import Board from "../../../apps/web/src/lib/board/Board.svelte";
import type { BoardHandle, BoardTheme, MountBoardOptions } from "./types.ts";

/** The class of the element the board is mounted in; it carries the tokens and `dark`. */
export const BOARD_ROOT_CLASS = "hydrawn-board" as const;

/**
 * The engine, from where the host serves it. Once, before anything asks for it: the
 * engine's own loader (`loadDrawEngine`) calls the same init with no address, which is a
 * no-op once one has resolved — but a second fetch if both start before either lands.
 */
let engineFrom: Promise<unknown> | null = null;

function loadEngineFrom(url: string | URL | undefined): Promise<unknown> {
  if (url === undefined) return Promise.resolve();
  engineFrom ??= initEngine({ module_or_path: url });
  return engineFrom;
}

/**
 * Renders the board for `options.slug` into `target`, inside a root element of its own.
 *
 * The board is `apps/web`'s `Board.svelte`, the one its `/boards/[slug]` route renders,
 * with what the route takes from SvelteKit handed in instead: the store, no live link and no
 * Share (the host has no relay), no gallery, and templates drawn into this board.
 */
export function mountBoard(
  target: HTMLElement | ShadowRoot,
  options: MountBoardOptions,
): BoardHandle {
  const root = document.createElement("div");
  root.className = BOARD_ROOT_CLASS;
  target.append(root);

  const props = $state({
    store: options.store,
    slug: options.slug,
    newTitle: options.title,
    title: options.title ?? "Board",
    theme: options.theme as BoardTheme | undefined,
    themeRoot: root,
    readOnly: options.readOnly ?? false,
    browser: false,
    collaboration: false,
  });

  let board: ReturnType<typeof Board> | null = null;
  let destroyed = false;
  const mounted = loadEngineFrom(options.engineUrl)
    // A failed fetch is the board's to report: it asks the engine again and shows the error.
    // Caveat: that second ask is the default address beside the module, so a host whose
    // `engineUrl` failed sees one more request, to a file it may not serve.
    .catch(() => undefined)
    .then(() => {
      if (!destroyed) board = mount(Board, { target: root, props });
    });

  return {
    setTheme(theme) {
      props.theme = theme;
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      await mounted;
      if (board !== null) {
        // What the route does on the way out (`beforeNavigate`): the pending save, the draft
        // and the picture are sent; the requests outlive the board.
        board.flushPending();
        await unmount(board, { outro: false });
        board = null;
      }
      root.remove();
    },
  };
}
