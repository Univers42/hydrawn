#!/usr/bin/env bash
# Assembles the Cloudflare Pages upload for the osionos board: the static build, its
# _headers (the CSP osionos-csp.mjs computed, plus the cache rules) and the bridge proxy
# function. The same headers as osionos.Dockerfile serves behind nginx.
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
cat > "$out/public/_headers" <<HEADERS
/*
  Content-Security-Policy: $csp
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cache-Control: no-cache
/_app/immutable/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
HEADERS
