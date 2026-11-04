/**
 * The public surface of `dist/index.js`. Hand-kept, and held to the implementation by
 * `src/index.ts`, which types each export against this file. Caveat: that is
 * assignability, not identity — an implementation that accepts more than is declared here
 * (a wider parameter, an extra option) still passes `tsc`; one that returns or accepts less
 * fails it.
 *
 * Its types, and the contract's they re-export, are TypeScript source with `.ts` import
 * specifiers, as everywhere in this workspace: a consumer's tsconfig needs
 * `allowImportingTsExtensions` (with `noEmit`, the usual Vite setup).
 */
import type { BoardHandle, BoardStore, HostedBoardApi, MountBoardOptions } from "./src/types.ts";

export type * from "./src/types.ts";

/** The class of the element the board is mounted in; it carries the tokens and `dark`. */
export declare const BOARD_ROOT_CLASS: "hydrawn-board";

/**
 * Renders the board for `options.slug` into `target` — an element, or an OPEN shadow root
 * (a closed one hides the board's own nodes from the events it reads).
 */
export declare function mountBoard(
  target: HTMLElement | ShadowRoot,
  options: MountBoardOptions,
): BoardHandle;

/**
 * A `BoardStore` over `client`, each save merged into the stored board by the contract's rule
 * (the merge the hydrawn osionos build runs). `newTitle` names a board the first save creates.
 * `list`, `remove` and `thumbnail` reject with status 501: a mounted board never calls them.
 */
export declare function createHostedStore(
  client: HostedBoardApi,
  newTitle: () => string,
): BoardStore;

/** The board's whole stylesheet, for `CSSStyleSheet.replaceSync` into a shadow root. */
export declare const boardCss: string;

/** Thrown by a store for a failure the board tells apart: 404 on `get` is a board not created yet. */
export declare class BoardStoreError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string);
}
