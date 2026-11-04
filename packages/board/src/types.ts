import type { BoardStore } from "@drawnosaurus/contract";

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
