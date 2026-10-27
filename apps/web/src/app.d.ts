declare global {
  namespace App {
    // No custom Locals/PageData/Error shapes yet — the board routes are CSR-only
    // and talk to the API from the browser.
  }

  interface ImportMetaEnv {
    /** "server" (default, Docker), "browser" (public build) or "osionos" (framed by osionos).
     *  Folded in by vite.config.ts. */
    readonly VITE_HYDRAWN_MODE: "server" | "browser" | "osionos";
    /** Browser build only: the hosted relay's websocket URL. */
    readonly VITE_HYDRAWN_RELAY_URL?: string;
    /** osionos build only: the one origin allowed to frame it and hand it a token. */
    readonly VITE_HYDRAWN_PARENT_ORIGIN?: string;
    /** osionos build only: the bridge's whiteboard API, the `/v1/...` paths' prefix. */
    readonly VITE_HYDRAWN_API_URL?: string;
  }
}

export {};
