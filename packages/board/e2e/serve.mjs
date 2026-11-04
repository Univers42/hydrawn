// The fixture host: the fixture page and the built library, under the CSP a host is told
// the board needs (README). Static files only; no build, no Vite.
import { createServer } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixture = join(here, "fixture");
const dist = join(here, "..", "dist");
const port = Number(process.env.BOARD_FIXTURE_PORT ?? 5476);

export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  // The chrome positions itself with style attributes (`style:left={…}`); no <style> element.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "worker-src 'self'",
  "connect-src 'self'",
].join("; ");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
};

/** `dist/draw_engine_bg.wasm`, served at `/engine.wasm` to prove `engineUrl` is followed. */
function engineFile() {
  const name = readdirSync(dist).find((file) => /^draw_engine_bg.*\.wasm$/.test(file));
  return name ? join(dist, name) : null;
}

function resolvePath(pathname) {
  if (pathname === "/") return join(fixture, "index.html");
  if (pathname === "/engine.wasm") return engineFile();
  const root = pathname.startsWith("/dist/") ? dist : fixture;
  const relative = pathname.startsWith("/dist/") ? pathname.slice("/dist/".length) : pathname;
  const file = normalize(join(root, relative));
  return file.startsWith(root) ? file : null;
}

createServer((request, response) => {
  const file = resolvePath(new URL(request.url ?? "/", "http://fixture").pathname);
  if (file === null || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "content-security-policy": CSP,
    "cache-control": "no-store",
  });
  response.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`board fixture on http://127.0.0.1:${port}`));
