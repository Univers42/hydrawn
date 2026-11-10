import type { Board, BoardList, BoardSummary, OsidrawFile } from "./board.ts";

/**
 * What a save stamps on each element. The client's diff (`apps/web/.../sceneDiff.ts`) and
 * every store compare elements by these fields only.
 */
export interface StampedElement {
  id: string;
  version: number;
  versionNonce: number;
  updated: number;
  isDeleted: boolean;
}

export interface ScenePatch<T extends StampedElement> {
  elements: T[];
  /** Only set when the predicted server order disagrees with the live one. */
  order?: string[];
}

export interface PatchAck extends BoardSummary {
  applied: number;
  rejected: number;
}

/**
 * The board operations the board needs, whatever holds the boards: the API (Docker build),
 * the browser's own storage (public build), or a host that mounts the board in-process
 * (`@hydrawn/board`). Signatures are `apps/web/src/lib/api/client.ts`'s.
 *
 * A failure that should be classified carries a numeric `status` (`ApiClientError` in the
 * web app): 413 is too large, 400/422 refused, 404 on `get` a board not created yet, 403
 * on `create` a viewer who may not, 409 on `replace` a lost race.
 */
export interface BoardStore {
  list(limit?: number, cursor?: string): Promise<BoardList>;
  create(title: string): Promise<BoardSummary>;
  /** `tombstones` includes deleted elements, for catching up after a lost connection. */
  get(slug: string, options?: { tombstones?: boolean }): Promise<Board>;
  patchElements<T extends StampedElement>(slug: string, patch: ScenePatch<T>): Promise<PatchAck>;
  /** Full replace. `rev` is the one the caller last saw; a mismatch is a 409. */
  replace(slug: string, scene: OsidrawFile, rev: number): Promise<Board>;
  remove(slug: string): Promise<void>;
  putThumbnail(slug: string, blob: Blob): Promise<void>;
  /**
   * Where the gallery loads a board's picture from, or null when there is none; `version`
   * (its `thumbnailAt`) busts the cache. Async because the browser's store reads the
   * picture from IndexedDB, and its address is an object URL the caller must revoke.
   */
  thumbnail(slug: string, version: string): Promise<string | null>;
}
