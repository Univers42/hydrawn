# syntax=docker/dockerfile:1.7
# The osionos build: the static app osionos frames, on an origin of its own, behind nginx.
# No API, no database, no relay — boards are the osionos bridge's (src/lib/store/host.ts).
#
# Like web.Dockerfile, this image carries no Rust toolchain: engine/pkg must already exist
# in the build context (`make wasm`, or the CI wasm job's artifact).
#
#   docker build -f docker/osionos.Dockerfile \
#     --build-arg HYDRAWN_PARENT_ORIGIN=https://osionos.example \
#     --build-arg HYDRAWN_API_URL=https://bridge.example/api/whiteboard .

FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/contract/package.json ./packages/contract/
COPY packages/store/package.json ./packages/store/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter "@drawnosaurus/web..."

COPY packages/contract ./packages/contract
COPY packages/store ./packages/store
COPY apps/web ./apps/web
COPY engine/src ./engine/src
COPY engine/pkg ./engine/pkg
COPY engine/crates/draw-engine/src/scene/embed.rs ./engine/embed.rs
COPY scripts/osionos-csp.mjs ./scripts/

RUN test -f engine/pkg/draw_engine.js && test -f engine/pkg/draw_trace.js \
	|| (echo "engine/pkg is missing or stale: run 'make wasm' before building this image" >&2 && exit 1)

# The page that frames this one and the bridge it saves to. Baked in: the token handshake
# trusts exactly this parent (src/lib/host/token.ts), and vite.config.ts refuses a build
# without both.
ARG HYDRAWN_PARENT_ORIGIN
ARG HYDRAWN_API_URL
ARG BUILD_APP_SHA=unknown
ARG BUILD_ENGINE_SHA=unknown
ENV VITE_HYDRAWN_MODE=osionos \
	VITE_HYDRAWN_PARENT_ORIGIN=$HYDRAWN_PARENT_ORIGIN \
	VITE_HYDRAWN_API_URL=$HYDRAWN_API_URL \
	VITE_BUILD_APP_SHA=$BUILD_APP_SHA \
	VITE_BUILD_ENGINE_SHA=$BUILD_ENGINE_SHA

RUN pnpm --filter @drawnosaurus/web build \
	&& find apps/web/build -name '*.map' -delete \
	&& find apps/web/build -type f \( -name '*.js' -o -name '*.css' -o -name '*.wasm' -o -name '*.svg' \) \
		-size +1k -exec gzip -9k {} + \
	&& node scripts/osionos-csp.mjs apps/web/build engine/embed.rs "$HYDRAWN_PARENT_ORIGIN" "$HYDRAWN_API_URL" > csp.txt

FROM public.ecr.aws/docker/library/nginx:1.27-alpine AS runtime

ARG BUILD_APP_SHA=unknown
LABEL org.opencontainers.image.title="hydrawn-osionos" \
      org.opencontainers.image.source="https://github.com/Univers42/hydrawn" \
      org.opencontainers.image.revision=$BUILD_APP_SHA

COPY docker/osionos.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/build /usr/share/nginx/html
COPY --from=build /app/csp.txt /tmp/csp.txt

# The headers, one file, included by every location (see osionos.nginx.conf). No
# X-Frame-Options: it cannot name a framing origin, and frame-ancestors does.
RUN { \
		printf 'add_header Content-Security-Policy "%s" always;\n' "$(cat /tmp/csp.txt)"; \
		echo 'add_header X-Content-Type-Options "nosniff" always;'; \
		echo 'add_header Referrer-Policy "no-referrer" always;'; \
		echo 'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;'; \
	} > /etc/nginx/hydrawn-headers.conf \
	&& rm /tmp/csp.txt \
	&& nginx -t

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
