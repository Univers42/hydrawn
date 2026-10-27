import { BROWSER_MODE, HOST_MODE } from "../mode.ts";
import { browserStore } from "./browser.ts";
import { hostStore } from "./host.ts";
import { serverStore } from "./server.ts";
import type { BoardStore, SecretStore } from "./types.ts";

/**
 * The store every board caller goes through: the API in the Docker build, this browser's
 * IndexedDB in the public one, the osionos bridge in the osionos one. The modes are
 * constants by build time, so the minifier keeps one branch and drops the others' code.
 */
export const boards: BoardStore = BROWSER_MODE
  ? browserStore({ idb: globalThis.indexedDB })
  : HOST_MODE
    ? hostStore
    : serverStore;

/**
 * Where a shared drawing's secret is kept in this browser: on the drawing's own row, in
 * the public build's store. The Docker build has none — its live key is the board's
 * (`realtime/liveRoom.ts`), and its Share dialog is the server's.
 *
 * The same store, not another: the public build's holds the drawings and their secrets
 * together, and two connections to the same database would be two of everything.
 */
export const secrets: SecretStore | null = BROWSER_MODE
  ? (boards as BoardStore & SecretStore)
  : null;
