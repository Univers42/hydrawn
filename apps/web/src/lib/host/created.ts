import { MAX_TITLE_LENGTH } from "@drawnosaurus/contract";

/**
 * The osionos build's `/new`: osionos builds older than client-minted slugs frame it for an
 * inline `/whiteboard [title]` block; this frame creates the board (the bridge answers this
 * origin only, never osionos') and tells the framing page which board the block now holds.
 * Newer builds frame `/boards/<slug>?title=` and the first save creates the board.
 */

export const BOARD_CREATED = "hydrawn:board-created";
export const UNTITLED = "Untitled";

interface Parent {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** The `title` query parameter as a board title: spaces collapsed, capped, "Untitled" when empty. */
export function newBoardTitle(params: URLSearchParams): string {
  const title = (params.get("title") ?? "").replaceAll(/\s+/g, " ").trim();
  return title.slice(0, MAX_TITLE_LENGTH).trim() || UNTITLED;
}

/** Posts the new board's slug to the framing page, at its origin only, never `"*"`. */
export function announceBoard(parent: Parent | null, parentOrigin: string, slug: string): void {
  if (parent === null || parentOrigin === "") return;
  parent.postMessage({ type: BOARD_CREATED, slug }, parentOrigin);
}
