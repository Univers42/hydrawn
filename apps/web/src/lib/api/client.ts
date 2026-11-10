import type {
  Board,
  BoardList,
  BoardSummary,
  OsidrawFile,
  PatchAck,
  ShareInfo,
} from "@drawnosaurus/contract";
import { apiBase, apiTokens } from "../config.ts";
import type { ScenePatch, StampedElement } from "@drawnosaurus/contract";

export type { PatchAck };

/**
 * Typed client for the v1 API.
 *
 * Paths are relative by default so dev goes through the Vite proxy and prod
 * through the same origin — no CORS in the common case. PUBLIC_API_URL overrides
 * it, read from the DYNAMIC env (see config.ts) so one image can point at different
 * backends without a rebuild.
 */
const baseUrl = apiBase;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

/** A 409 is expected traffic (someone else wrote first), so callers can branch on it. */
export const isConflict = (error: unknown): boolean =>
  error instanceof ApiClientError && error.status === 409;

/**
 * The fetch every call makes. In the osionos build it carries the whiteboard token, and a
 * 401 — the token expired or the bridge restarted — is retried once with a fresh one; a
 * second 401 is the caller's to report.
 */
async function send(path: string, init: RequestInit): Promise<Response> {
  const tokens = apiTokens();
  const attempt = async (): Promise<Response> => {
    let authorization: Record<string, string> = {};
    if (tokens) {
      try {
        authorization = { authorization: `Bearer ${await tokens.current()}` };
      } catch (error) {
        throw new ApiClientError(401, "unauthorized", (error as Error).message);
      }
    }
    return fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...authorization },
    });
  };
  const response = await attempt();
  if (response.status !== 401 || !tokens) return response;
  tokens.drop();
  return attempt();
}

/**
 * The API's { error: { code, message } }, or null when something in front of it answered:
 * the root stack's TLS edge refuses with an HTML page, and that must never reach a parser.
 *
 * Caveat: trusts the content-type. An envelope sent under another type loses its code and
 * message to the caller's fallback; the API and the osionos bridge both label theirs.
 */
async function errorEnvelope(response: Response): Promise<ErrorEnvelope | null> {
  if (!response.headers.get("content-type")?.includes("json")) return null;
  return (await response.json().catch(() => null)) as ErrorEnvelope | null;
}

/** `refusedMessage` is what a person reads when a 403 comes with no word from the API. */
async function request<T>(
  path: string,
  init: RequestInit = {},
  refusedMessage = "This action is turned off here",
): Promise<T> {
  const response = await send(path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const envelope = await errorEnvelope(response);
    const fallback =
      response.status === 403 ? refusedMessage : `request failed with ${response.status}`;
    throw new ApiClientError(
      response.status,
      envelope?.error?.code ?? "http_error",
      envelope?.error?.message ?? fallback,
    );
  }

  const text = await response.text();
  return (text === "" ? null : JSON.parse(text)) as T;
}

export const listBoards = (limit?: number, cursor?: string): Promise<BoardList> => {
  const query = new URLSearchParams();
  if (limit !== undefined) query.set("limit", String(limit));
  if (cursor !== undefined) query.set("cursor", cursor);
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  return request<BoardList>(`/v1/boards${suffix}`);
};

/**
 * Stores the board's gallery picture. Not through `request()`: the body is raw PNG bytes,
 * and that helper sends JSON and parses a JSON reply.
 */
export async function putThumbnail(slug: string, blob: Blob): Promise<void> {
  const response = await send(`/v1/boards/${slug}/thumbnail`, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: blob,
  });
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      "thumbnail_failed",
      `thumbnail upload failed with ${response.status}`,
    );
  }
}

/** Where the gallery loads a board's picture; `version` (its `thumbnailAt`) busts the cache. */
export const thumbnailUrl = (slug: string, version: string): string =>
  `${baseUrl()}/v1/boards/${slug}/thumbnail?v=${encodeURIComponent(version)}`;

/**
 * The board's picture as bytes, for the osionos build: an `<img>` cannot send its token, so
 * the picture is fetched here and shown from an object URL. Null when there is none.
 */
export async function thumbnailBlob(slug: string, version: string): Promise<Blob | null> {
  const response = await send(`/v1/boards/${slug}/thumbnail?v=${encodeURIComponent(version)}`, {});
  return response.ok ? response.blob() : null;
}

/** Where other people can reach this Hydrawn, for the Share dialog. */
export const getShareInfo = (): Promise<ShareInfo> => request<ShareInfo>("/v1/share");

/** Opens the internet link. Only the computer running Hydrawn may. */
export const startTunnel = (): Promise<ShareInfo> =>
  request<ShareInfo>("/v1/share/tunnel", { method: "POST" });

/** Closes the internet link. */
export const stopTunnel = (): Promise<ShareInfo> =>
  request<ShareInfo>("/v1/share/tunnel", { method: "DELETE" });

/** `slug`: the osionos build's, for a board osionos named before it existed (the bridge
 *  creates it once, then answers with it). The API mints its own and takes none. */
export const createBoard = (title: string, slug?: string): Promise<BoardSummary> =>
  request<BoardSummary>("/v1/boards", { method: "POST", body: JSON.stringify({ title, slug }) });

/** `tombstones` includes deleted elements, for catching up after a lost connection. */
export const getBoard = (slug: string, options: { tombstones?: boolean } = {}): Promise<Board> =>
  request<Board>(`/v1/boards/${slug}${options.tombstones ? "?include=tombstones" : ""}`);

export const deleteBoard = (slug: string): Promise<void> =>
  request<void>(`/v1/boards/${slug}`, { method: "DELETE" }, "Deleting boards is turned off here");

export const patchElements = <T extends StampedElement>(
  slug: string,
  patch: ScenePatch<T>,
): Promise<PatchAck> =>
  request<PatchAck>(`/v1/boards/${slug}/elements`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

/** Full replace. `rev` is the one the client last saw; a mismatch is a 409. */
export const replaceBoard = (slug: string, scene: OsidrawFile, rev: number): Promise<Board> =>
  request<Board>(`/v1/boards/${slug}`, {
    method: "PUT",
    headers: { "if-match": `"${rev}"` },
    body: JSON.stringify(scene),
  });
