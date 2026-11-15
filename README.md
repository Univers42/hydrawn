# Hydrawn

Hydrawn is a collaborative whiteboard built on [draw-engine](https://github.com/Univers42/draw-engine), a Rust engine compiled to WebAssembly. It adds the web editor, persistent boards, an HTTP API, and live sharing.

## What it does

- Draw and edit scenes in the browser with the Rust/WASM engine.
- Save server-mode boards in MongoDB. Full-scene writes use revision checks; autosave merges changed elements so concurrent edits can converge.
- Share live rooms through a relay. The room key stays in the URL fragment and live frames are encrypted before they reach the relay.
- Export scenes as PNG, SVG, or `.osidraw` JSON. PNG and SVG support exporting the whole scene or the current selection.

## Build modes

| Mode | Storage and use |
| --- | --- |
| `server` (default) | Docker stack with the API and MongoDB. Use it for self-hosted boards and LAN collaboration. |
| `browser` | Static public build. Boards live in this browser's IndexedDB; sharing uses encrypted links and the hosted relay. |
| `osionos` | Static build embedded in Osionos and connected through its host bridge. |

The builds have separate storage. The server mode's API is not used by the public browser build.

## Server board API and save semantics

| Route | Purpose |
| --- | --- |
| `GET /v1/boards?limit&cursor` | Paginated board metadata. |
| `POST /v1/boards` | Create a board and return its slug. |
| `GET /v1/boards/:slug` | Read the `.osidraw` scene and its revision ETag. |
| `PUT /v1/boards/:slug` | Replace the full scene; requires `If-Match` so a stale tab cannot overwrite newer work. |
| `PATCH /v1/boards/:slug/elements` | Autosave changed elements and deletions; the server reconciles each element. |
| `GET` `/v1/boards/:slug/thumbnail` | Read the board's PNG thumbnail. |
| `PUT` `/v1/boards/:slug/thumbnail` | Save the board's PNG thumbnail. |
| `DELETE /v1/boards/:slug` | Soft-delete a board. |
| `GET /v1/share` | Discover the share links available from this server. |

`PATCH` uses element versions to reconcile concurrent edits; it is idempotent for retries. The full-scene `PUT` uses a revision precondition instead of silently accepting stale content. Shared validation and reconciliation live in `packages/contract`.

In server mode, board routes and `/v1/share` live in `apps/api`; live room frames travel through the realtime relay. The public browser build stores boards in IndexedDB and connects directly to its hosted relay.

## Architecture

```text
Server mode:  SvelteKit + draw-engine (Rust/WASM)
                ├─ HTTP /v1 ── gateway ── Fastify API ── MongoDB
                └─ WebSocket ─ gateway ── realtime relay

Browser mode: static SvelteKit + draw-engine ── IndexedDB
                                          └── WebSocket ── hosted relay

Osionos mode: static SvelteKit + draw-engine ── Osionos host bridge
```

The Rust/WASM engine owns scene geometry, editing, and painting. The app services handle storage and network traffic; the API does not run WASM. The shared boundary is the `.osidraw` scene and the schemas in `packages/contract`.

## Run the Docker build

Requires Git, Make, Bash, and Docker Compose v2. Node.js runs in the tooling image; no host Node installation is needed.

```sh
git clone https://github.com/Univers42/hydrawn.git
cd hydrawn
make all
```

`make all` initializes the engine submodule, builds the WASM bundle, installs workspace dependencies, runs the local quality gate, and starts the stack. Open **http://localhost:5273**.

| Command | Purpose |
| --- | --- |
| `make up` | Start the already-built server stack. |
| `make down` | Stop this checkout's stack. |
| `make verify` | Run typecheck, lint, format, unit tests, and API integration tests against real MongoDB. |
| `make help` | List the available Make targets. |

Default ports: web `5273`, API `4300`, LAN sharing `5274`, MongoDB `27019`, and realtime `4402`. See [all commands and overrides](docs/reference/commands.md).

GitHub Actions also [checks WASM freshness, builds service images, and runs browser tests](.github/workflows/ci.yml); `make verify` is the local quality and integration gate, not the full CI workflow.

## Security

**Server-mode authentication is not implemented.** `AUTH_MODE=dev` assigns a development owner and accepts `X-Owner-Id`; it is not access control. `AUTH_MODE=bearer` fails at startup because no token verifier exists. Do not expose server mode as a trusted multi-user service until authentication is implemented.

Public-build live sharing encrypts room frames in the browser. Anyone with a share link can join that room; the link key is carried in the URL fragment and is not sent in the HTTP request.

## Project structure

- `apps/web` — SvelteKit editor and browser storage.
- `apps/api` — Fastify routes, ownership boundary, and MongoDB persistence.
- `packages/contract` — shared validation, scene bounds, and merge rules.
- `packages/store` — browser/server board storage.
- `packages/relay` — realtime relay service.
- `engine` — the draw-engine Git submodule; `engine/realtime` is its relay dependency.
- `docker` — images and gateway configuration.

## Documentation

- [Architecture and module ownership](docs/reference/architecture.md)
- [Collaboration and sharing](docs/collaboration.md)
- [Commands and tests](docs/reference/commands.md)
- [Engine integration](docs/reference/engine.md)
- [Import and export](docs/reference/export.md)
- [Browser tests](docs/reference/browser-tests.md)
- [Developer instructions and documentation index](CLAUDE.md)
