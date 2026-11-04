// `BoardStore` lives in the contract, so a host that mounts the board (`@hydrawn/board`)
// implements the same interface the web app's stores do.
export type { BoardStore } from "@drawnosaurus/contract";

/**
 * Where a shared drawing's secret is kept in this browser: on the drawing's own row, in the
 * public build's store (`browser.ts`). The Docker build has none — its live key is the
 * board's (`realtime/liveRoom.ts`).
 */
export interface SecretStore {
  /** The secret the drawing was shared with, or null when it never was. */
  secret(slug: string): Promise<Uint8Array | null>;
  /** Keeps the secret with the drawing, giving a drawing that has no row yet its row. */
  keepSecret(slug: string, secret: Uint8Array): Promise<void>;
}
