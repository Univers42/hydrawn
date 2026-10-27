/**
 * Which build this is: the Docker one (API + Mongo behind the gateway), the public one
 * (browser only, boards in IndexedDB), or the osionos one (framed by osionos, boards kept
 * by the osionos bridge).
 *
 * A build-time constant on purpose: vite.config.ts folds `VITE_HYDRAWN_MODE` into the
 * bundle, so this comparison is a literal and the minifier drops the other build's code
 * (the public bundle carries no API client paths, the Docker one no IndexedDB store). A
 * runtime flag would ship both and could disagree with the adapter svelte.config.js chose.
 *
 * Only a few places may read it: `lib/store/index.ts`, `lib/config.ts`, the routes, and
 * the dialog picker a later change adds. Everything else asks the store.
 */
export const BROWSER_MODE: boolean = import.meta.env.VITE_HYDRAWN_MODE === "browser";

/**
 * The build osionos frames: the Docker build's pages and API client, pointed at the osionos
 * bridge with a token the framing page hands over (`host/token.ts`). No live link and no
 * Share: the bridge keeps the boards and nothing else.
 */
export const HOST_MODE: boolean = import.meta.env.VITE_HYDRAWN_MODE === "osionos";
