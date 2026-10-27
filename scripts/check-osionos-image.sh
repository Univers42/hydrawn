#!/bin/sh
# Checks the osionos image the way a browser meets it: starts it, asks for a route, a
# hashed asset and the WASM, and reads the headers that decide who may frame it and
# what it may load.
#
#   frame-ancestors - exactly the parent origin it was built for; no X-Frame-Options.
#   script-src      - 'self', 'wasm-unsafe-eval' and one sha256 per inline script, never
#                     'unsafe-inline' or 'unsafe-eval'.
#   connect-src     - 'self' and the bridge's origin only.
#   object-src/base-uri/form-action - 'none'.
#   every response  - the policy, so no file is served without it (nginx drops server
#                     headers in a location that sets its own).
#   a deep link     - /boards/<slug> answers 200 with the SPA, not a 404.
#   the inline boot script - its hash in the header matches the served index.html.
#
# Usage: scripts/check-osionos-image.sh <image> <parent-origin> <api-url>
set -eu

image="$1"
parent="$2"
api="$3"
bridge=$(printf '%s' "$api" | sed -E 's|^(https?://[^/]+).*|\1|')
name="hydrawn-osionos-check-$$"
failed=0
fail() {
	echo "check-osionos-image: FAIL $1"
	failed=1
}

docker run -d --rm --name "$name" -p 127.0.0.1::8080 "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
port=$(docker port "$name" 8080/tcp | head -n1 | sed 's/.*://')
base="http://127.0.0.1:$port"

tries=0
until curl -fsS -o /dev/null "$base/" 2>/dev/null; do
	tries=$((tries + 1))
	[ "$tries" -lt 30 ] || {
		echo "check-osionos-image: FAIL the image did not answer on :8080"
		exit 1
	}
	sleep 0.2
done

headers() { curl -fsS -D - -o /dev/null "$base$1" | tr -d '\r'; }
csp_of() { headers "$1" | sed -n 's/^[Cc]ontent-[Ss]ecurity-[Pp]olicy: //p'; }

csp=$(csp_of /)
[ -n "$csp" ] || fail "/ has no Content-Security-Policy"
directive() { printf '%s' "$csp" | tr ';' '\n' | sed 's/^ *//' | grep "^$1 " || true; }

[ "$(directive frame-ancestors)" = "frame-ancestors $parent" ] ||
	fail "frame-ancestors is '$(directive frame-ancestors)', want '$parent'"
[ "$(directive connect-src)" = "connect-src 'self' $bridge" ] ||
	fail "connect-src is '$(directive connect-src)', want 'self' and $bridge"
for locked in object-src base-uri form-action; do
	[ "$(directive "$locked")" = "$locked 'none'" ] || fail "$locked is not 'none'"
done
case "$(directive script-src)" in
*unsafe-inline* | *"'unsafe-eval'"*) fail "script-src allows inline or eval: $(directive script-src)" ;;
"script-src 'self' 'wasm-unsafe-eval' 'sha256-"*) ;;
*) fail "script-src is '$(directive script-src)'" ;;
esac
headers / | grep -qi '^x-frame-options:' && fail "X-Frame-Options is set; it would refuse the osionos frame"

# The header's hash is the served boot script's.
served=$(curl -fsS "$base/" | awk '/<script>/{on=1; sub(/.*<script>/, "")} on{buf = buf (n++ ? "\n" : "") $0} /<\/script>/{on=0}
	END{sub(/<\/script>.*/, "", buf); printf "%s", buf}')
want="'sha256-$(printf '%s' "$served" | openssl dgst -sha256 -binary | base64)'"
case "$(directive script-src)" in
*"$want"*) ;;
*) fail "script-src does not carry the served boot script's hash $want" ;;
esac

[ "$(curl -fsS -o /dev/null -w '%{http_code}' "$base/boards/abcdef123456")" = 200 ] ||
	fail "a deep link (/boards/<slug>) does not answer 200"

asset=$(curl -fsS "$base/" | grep -o '/_app/immutable/[^"]*\.js' | head -n1)
[ -n "$asset" ] || fail "index.html links no /_app/immutable/ script"
[ -z "$asset" ] || [ "$(csp_of "$asset")" = "$csp" ] || fail "$asset is served without the policy"
[ -z "$asset" ] || headers "$asset" | grep -qi '^cache-control: public, max-age=31536000, immutable' ||
	fail "$asset is not cached as immutable"

[ "$failed" -eq 0 ] || exit 1
echo "check-osionos-image: ok - $image framed by $parent, saving to $bridge"
