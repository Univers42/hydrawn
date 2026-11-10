import type { Board, BoardStore, BoardSummary, OsidrawFile } from "@drawnosaurus/contract";

export type {
  Board,
  BoardList,
  BoardStore,
  BoardSummary,
  OsidrawFile,
  PatchAck,
  ScenePatch,
  StampedElement,
} from "@drawnosaurus/contract";

export type BoardTheme = "light" | "dark";

export interface MountBoardOptions {
  /** Where the board is read from and saved to. */
  store: BoardStore;
  /** The board's id in `store`. */
  slug: string;
  /** Shown, and given to the board, while `store.get` answers 404 for it. */
  title?: string;
  theme?: BoardTheme;
  /** Nothing is written to `store`: no save, no draft, no thumbnail. */
  readOnly?: boolean;
  /**
   * Where the host serves `draw_engine_bg.wasm` (the file emitted beside `dist/index.js`).
   * Unset, it is fetched from beside the module, at the address the build wrote in.
   */
  engineUrl?: string | URL;
}

export interface BoardHandle {
  setTheme(theme: BoardTheme): void;
  /** Sends what is pending, then unmounts the board and removes its root. */
  destroy(): Promise<void>;
}

/**
 * The board routes a host reaches with its own credentials, for `createHostedStore`: a store
 * that keeps whole scenes by `rev` (the osionos bridge's `/api/whiteboard/v1`). Each throws a
 * `BoardStoreError` carrying the route's status — 404 from `getBoard` and 409 from
 * `replaceBoard` are how a new board and a lost race are told apart.
 */
export interface HostedBoardApi {
  getBoard(slug: string, options?: { tombstones?: boolean }): Promise<Board>;
  replaceBoard(slug: string, scene: OsidrawFile, rev: number): Promise<Board>;
  createBoard(title: string, slug?: string): Promise<BoardSummary>;
  putThumbnail(slug: string, blob: Blob): Promise<void>;
}
