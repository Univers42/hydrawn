#!/usr/bin/env node
// Prints the Content-Security-Policy the osionos build is served with (docker/osionos.Dockerfile).
//
// Built from what the build actually contains, so it cannot drift from it:
//   script-src  - 'self', the WASM engine, and the sha256 of each inline <script> SvelteKit
//                 writes into the SPA fallback (index.html). A rebuild that changes that
//                 script changes its hash here in the same build.
//   frame-src   - the engine's ALLOWED_EMBED_HOSTS (engine/.../scene/embed.rs), each host and
//                 its subdomains: the embeds rewrite to player./embed./w. hosts of the same site.
//   connect-src - 'self' and the osionos bridge, the only server this build talks to.
//   frame-ancestors - the osionos page, and nothing else may frame this one.
//
// Caveat: both reads are regexes, not parsers. An inline <script> written with attributes
// (`<script type=...>`) or a host list no longer spelled `ALLOWED_EMBED_HOSTS: [&str; N] = [`
// is MISSED; the script then exits 1 rather than print a policy that would break the page.
// A host added to the engine's list is picked up; one the engine rewrites to an unrelated
// domain is not, and that embed renders blank (fails closed).
//
// Usage: node scripts/osionos-csp.mjs <build-dir> <embed.rs> <parent-origin> <api-url>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [buildDir, embedRs, parentOrigin, apiUrl] = process.argv.slice(2);
if (!buildDir || !embedRs || !parentOrigin || !apiUrl) {
  console.error("usage: osionos-csp.mjs <build-dir> <embed.rs> <parent-origin> <api-url>");
  process.exit(2);
}

const fail = (message) => {
  console.error(`osionos-csp: ${message}`);
  process.exit(1);
};

const html = readFileSync(join(buildDir, "index.html"), "utf8");
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const tagged = (html.match(/<script\b/g) ?? []).length;
if (inline.length === 0) fail("no inline <script> in index.html; SvelteKit's boot script moved");
if (tagged !== inline.length)
  fail(`index.html has ${tagged} <script> tags, ${inline.length} plain`);
const hashes = inline.map(
  (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`,
);

const list = readFileSync(embedRs, "utf8").match(
  /ALLOWED_EMBED_HOSTS: \[&str; \d+\] = \[([\s\S]*?)\];/,
);
if (!list) fail(`ALLOWED_EMBED_HOSTS not found in ${embedRs}`);
const hosts = [...list[1].matchAll(/"([a-z0-9.-]+)"/g)].map((match) => match[1]);
if (hosts.length === 0) fail("ALLOWED_EMBED_HOSTS is empty");
const frames = hosts.flatMap((host) => [`https://${host}`, `https://*.${host}`]);

const parent = new URL(parentOrigin).origin;
const bridge = new URL(apiUrl).origin;

const policy = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")}`,
  `connect-src 'self' ${bridge}`,
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `frame-src ${[...new Set(frames)].join(" ")}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  `frame-ancestors ${parent}`,
].join("; ");

process.stdout.write(policy);
