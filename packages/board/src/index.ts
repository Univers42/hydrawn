/**
 * @hydrawn/board — the board, mounted in-process by a host page (`../index.d.ts`).
 *
 * Each export is typed against the declaration file, so the two cannot drift apart.
 */
// First, before anything that holds a schema (`jitless.ts`).
import "./jitless.ts";
import "../../../apps/web/src/lib/board/board.css";
import { ApiClientError } from "../../../apps/web/src/lib/api/client.ts";
import type * as Public from "../index.js";
import { CSS_PLACEHOLDER } from "./inlineCss.ts";
import { BOARD_ROOT_CLASS as rootClass, mountBoard as mount } from "./mountBoard.svelte.ts";

export type * from "./types.ts";

export const BOARD_ROOT_CLASS: typeof Public.BOARD_ROOT_CLASS = rootClass;
export const mountBoard: typeof Public.mountBoard = mount;
export const BoardStoreError: typeof Public.BoardStoreError = ApiClientError;

/** Replaced by the stylesheet's text at build time (`inlineCss.ts`). */
export const boardCss: typeof Public.boardCss = CSS_PLACEHOLDER;
