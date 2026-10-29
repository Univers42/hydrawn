import {
  applyOrder,
  reconcileElements,
  type Board,
  type DrawElementDto,
} from "@drawnosaurus/contract";
import * as api from "../api/client.ts";
import { ApiClientError, type PatchAck } from "../api/client.ts";
import { fillPictures } from "../autosave/pictures.ts";
import { newBoardTitle } from "../host/created.ts";
import type { ScenePatch, StampedElement } from "../autosave/sceneDiff.ts";
import type { BoardStore } from "./types.ts";

/**
 * Times a save is merged again after the board moved on between its read and its write.
 * Each retry re-reads, so a fourth loss in a row means a writer that never stops (another
 * tab saving continuously); the 409 then reaches the autosaver, which reloads the board.
 */
const MERGE_ATTEMPTS = 3;

export interface HostApi {
  getBoard: typeof api.getBoard;
  replaceBoard: typeof api.replaceBoard;
  createBoard: typeof api.createBoard;
}

/**
 * The stored board, with its tombstones. osionos frames a new inline board by a slug it
 * minted, before the board exists; the first save creates it here, titled `newTitle()`.
 */
async function readOrCreate(client: HostApi, slug: string, newTitle: () => string): Promise<Board> {
  try {
    return await client.getBoard(slug, { tombstones: true });
  } catch (error) {
    if (!(error instanceof ApiClientError && error.status === 404)) throw error;
  }
  const created = await client.createBoard(newTitle(), slug);
  // A bridge older than client slugs mints its own and leaves this one missing.
  if (created.slug !== slug) {
    throw new ApiClientError(
      502,
      "slug_ignored",
      "The whiteboard service could not create this board.",
    );
  }
  return client.getBoard(slug, { tombstones: true });
}

/**
 * One autosave, done as the API does it but on this side: the osionos bridge stores whole
 * scenes by `rev` and knows nothing of stamps.
 *
 * The stored board is read with its tombstones (a delete must keep winning), the patch is
 * merged into it by the contract's one merge rule, images edited after their picture was
 * saved keep the stored picture, and the result is written back against the `rev` read.
 * Losing that race re-reads and merges again — the merge is per element, so nothing either
 * writer sent is dropped.
 */
export async function mergeAndReplace<T extends StampedElement>(
  client: HostApi,
  slug: string,
  patch: ScenePatch<T>,
  newTitle: () => string,
): Promise<PatchAck> {
  // Typed as the contract's: the bridge stores what the engine produced.
  const incoming = patch.elements as unknown as DrawElementDto[];
  for (let attempt = 1; ; attempt += 1) {
    const stored = await readOrCreate(client, slug, newTitle);
    const before = new Map(stored.scene.elements.map((element) => [element.id, element]));
    const merged = reconcileElements(stored.scene.elements, incoming);
    const kept = fillPictures(merged.elements, (id) => before.get(id));
    const elements = patch.order === undefined ? kept : applyOrder(kept, patch.order);
    try {
      const saved = await client.replaceBoard(slug, { ...stored.scene, elements }, stored.rev);
      // The ack is a summary: the scene just written is not kept a second time.
      const { scene, ...summary } = saved;
      void scene;
      return { ...summary, applied: merged.applied, rejected: merged.rejected };
    } catch (error) {
      const raced = error instanceof ApiClientError && error.status === 409;
      if (!raced || attempt >= MERGE_ATTEMPTS) throw error;
    }
  }
}

/** The picture as an object URL the gallery revokes (`gallery/cardPicture.ts`). */
async function thumbnail(slug: string, version: string): Promise<string | null> {
  const blob = await api.thumbnailBlob(slug, version);
  return blob ? URL.createObjectURL(blob) : null;
}

/** The osionos build's store: the API client, aimed at the bridge, merging on this side. */
export const hostStore: BoardStore = {
  list: api.listBoards,
  create: api.createBoard,
  get: api.getBoard,
  patchElements: (slug, patch) =>
    mergeAndReplace(api, slug, patch, () => newBoardTitle(new URLSearchParams(location.search))),
  replace: api.replaceBoard,
  remove: api.deleteBoard,
  putThumbnail: api.putThumbnail,
  thumbnail,
};
