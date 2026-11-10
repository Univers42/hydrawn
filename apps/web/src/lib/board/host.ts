import { createContext } from "svelte";
import type { BoardStore } from "../store/types.ts";

/**
 * What the board's chrome reaches without a prop chain through `DrawSurface`: the store the
 * board was opened from, how the host opens another board, and where its gallery is. Set once by `Board.svelte`.
 */
export interface BoardHost {
  store: BoardStore;
  /** Unset when the host cannot navigate (`mountBoard`): a template is drawn in place. */
  openBoard: ((slug: string) => Promise<void>) | undefined;
  /** Where "My drawings" goes; unset when the host has no gallery, and the item is not shown. */
  galleryHref: string | undefined;
}

export const [getBoardHost, setBoardHost] = createContext<BoardHost>();
