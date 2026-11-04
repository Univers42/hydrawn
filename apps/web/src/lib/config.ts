import { hostTokens } from "./host/token.ts";
import { BROWSER_MODE, HOST_MODE } from "./mode.ts";

/**
 * Runtime config, in one place. The server build reads the DYNAMIC public env so one
 * image can point at different backends without a rebuild; the browser build has no
 * server to configure and takes build-time values instead.
 *
 * The env is handed in by the root layout (`usePublicEnv`) rather than imported from
 * `$env/dynamic/public`: this module is in the board's import graph, and the board is also
 * built as a library (`packages/board`) where no SvelteKit runtime exists. Unset, it is
 * empty, which is what a mounted board needs: it never reaches the API or the relay.
 */
export type PublicEnv = Readonly<Record<string, string | undefined>>;

let env: PublicEnv = {};

export function usePublicEnv(next: PublicEnv): void {
  env = next;
}

/** Prefix for `/v1/...` requests. Empty means same origin. */
export const apiBase = (): string => {
  if (HOST_MODE) return import.meta.env.VITE_HYDRAWN_API_URL ?? "";
  return BROWSER_MODE ? "" : (env.PUBLIC_API_URL ?? "").replace(/\/$/, "");
};

let tokens: ReturnType<typeof hostTokens> | null = null;

/**
 * Where the API client gets its bearer token: the framing osionos page, in the osionos build.
 * Null in the others, whose API takes no token.
 */
export const apiTokens = (): ReturnType<typeof hostTokens> | null => {
  if (!HOST_MODE || typeof window === "undefined") return null;
  tokens ??= hostTokens({
    parentOrigin: import.meta.env.VITE_HYDRAWN_PARENT_ORIGIN ?? "",
    frame: window,
  });
  return tokens;
};

/** The live-collaboration websocket. Empty means "derive it from the page's origin". */
export const relayWsUrl = (): string =>
  BROWSER_MODE
    ? (import.meta.env.VITE_HYDRAWN_RELAY_URL ?? "")
    : (env.PUBLIC_REALTIME_WS_URL ?? "");

/** The relay's auth token. Empty makes the caller fall back to its dev token. */
export const relayToken = (): string => (BROWSER_MODE ? "" : (env.PUBLIC_REALTIME_TOKEN ?? ""));
