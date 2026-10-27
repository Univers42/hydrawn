/**
 * The osionos build's credential: a short whiteboard token the framing osionos page asks
 * its bridge for and posts down to this frame.
 *
 * Only the parent at the build's own `VITE_HYDRAWN_PARENT_ORIGIN` is believed, and only
 * when the message comes from `window.parent` itself: a sibling frame or a popup at the
 * same origin is not the page that framed this one. The token lives in this module's
 * memory and nowhere else (no storage, no address), and it only opens the bridge's
 * whiteboard routes — the osionos session never reaches this origin.
 */

export const TOKEN_REQUEST = "hydrawn:token-request";
export const TOKEN_REPLY = "hydrawn:token";

/** A token is a few hundred bytes; anything far larger is not one. */
const MAX_TOKEN_LENGTH = 2048;
/** Asked again this long before it expires, so a save in flight never carries a dead one. */
const RENEW_MARGIN_MS = 30_000;
const REPLY_TIMEOUT_MS = 10_000;

export interface HostToken {
  token: string;
  /** Expiry, in milliseconds since the epoch. */
  expiresAt: number;
}

interface Frame {
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface HostTokenOptions {
  parentOrigin: string;
  frame: Frame;
  now?: () => number;
  timeoutMs?: number;
}

/** The reply's token, or null when the message is not exactly a token reply. */
export function readReply(data: unknown, now: number): HostToken | null {
  if (typeof data !== "object" || data === null) return null;
  const keys = Object.keys(data).sort().join(",");
  if (keys !== "exp,token,type") return null;
  const { type, token, exp } = data as Record<string, unknown>;
  if (type !== TOKEN_REPLY || typeof token !== "string" || typeof exp !== "number") return null;
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const expiresAt = exp * 1000;
  return Number.isFinite(expiresAt) && expiresAt > now ? { token, expiresAt } : null;
}

export function hostTokens({
  parentOrigin,
  frame,
  now = Date.now,
  timeoutMs = REPLY_TIMEOUT_MS,
}: HostTokenOptions) {
  let held: HostToken | null = null;
  let asking: Promise<string> | null = null;

  function ask(): Promise<string> {
    const parent = frame.parent;
    if (!parent || parent === (frame as unknown)) {
      return Promise.reject(new Error("hydrawn: not framed by osionos, no token to ask for"));
    }
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        frame.removeEventListener("message", onMessage);
        reject(new Error("hydrawn: osionos did not answer the token request"));
      }, timeoutMs);
      function onMessage(event: MessageEvent): void {
        if (event.source !== parent || event.origin !== parentOrigin) return;
        const reply = readReply(event.data, now());
        if (!reply) return;
        clearTimeout(timer);
        frame.removeEventListener("message", onMessage);
        held = reply;
        resolve(reply.token);
      }
      frame.addEventListener("message", onMessage);
      parent.postMessage({ type: TOKEN_REQUEST }, parentOrigin);
    });
  }

  return {
    /** A token valid for at least the renew margin; one request in flight at a time. */
    current(): Promise<string> {
      if (held && held.expiresAt - RENEW_MARGIN_MS > now()) return Promise.resolve(held.token);
      asking ??= ask().finally(() => {
        asking = null;
      });
      return asking;
    },
    /** The bridge refused the token: the next call asks for a new one. */
    drop(): void {
      held = null;
    },
  };
}
