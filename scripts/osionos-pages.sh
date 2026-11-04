#!/usr/bin/env bash
# Assembles the Cloudflare Pages upload for the osionos board: the static build, its
# _headers (the cache rules and the fixed headers), the bridge proxy function, and a
# middleware that sends the CSP osionos-csp.mjs computed. The same headers as
# osionos.Dockerfile serves behind nginx.
#
# The CSP cannot go in _headers: Pages drops any _headers line over 2,000 characters
# without a word, and the frame-src embed list alone is 1,980 (the whole CSP was 2,342 on
# 2026-11-04). That deploy served no CSP at all, so no frame-ancestors either.
# Caveat: the middleware sets the CSP on text/html responses only. Static assets under
# /_app/immutable/ skip functions and carry none, as a JS worker script would need for
# its own policy; behind nginx every response has it.
# usage: osionos-pages.sh <build-dir> <csp.txt> <out-dir>
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: osionos-pages.sh <build-dir> <csp.txt> <out-dir>" >&2; exit 2; }
build=$1 csp_file=$2 out=$3
here=$(cd "$(dirname "$0")/.." && pwd)
[ -f "$build/index.html" ] || { echo "osionos-pages: $build/index.html is missing" >&2; exit 1; }
csp=$(tr -d "\n" < "$csp_file")
case $csp in *frame-ancestors*) ;; *) echo "osionos-pages: the CSP names no frame-ancestors" >&2; exit 1 ;; esac
rm -rf "$out"
mkdir -p "$out"
cp -R "$build"/. "$out/public"
cp -R "$here/docker/osionos-pages/functions" "$out/functions"
csp_js=$(printf "%s" "$csp" | sed -e "s/\\\\/\\\\\\\\/g" -e "s/\"/\\\\\"/g")
cat > "$out/functions/_middleware.js" <<MIDDLEWARE
const CSP = "$csp_js";

export async function onRequest({ next }) {
  const response = await next();
  if (!(response.headers.get("content-type") ?? "").startsWith("text/html")) return response;
  const headed = new Response(response.body, response);
  headed.headers.set("Content-Security-Policy", CSP);
  return headed;
}
MIDDLEWARE
printf "%s\n" "{\"version\":1,\"include\":[\"/*\"],\"exclude\":[\"/_app/immutable/*\"]}" > "$out/public/_routes.json"
cat > "$out/public/_headers" <<HEADERS
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cache-Control: no-cache
/_app/immutable/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
HEADERS

too_long=$(awk "length > 2000 { print NR }" "$out/public/_headers")
[ -z "$too_long" ] || { echo "osionos-pages: _headers line $too_long is over 2,000 characters; Pages would drop it" >&2; exit 1; }
