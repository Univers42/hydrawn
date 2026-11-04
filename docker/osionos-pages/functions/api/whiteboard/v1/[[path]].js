// The osionos bridge, reached from hydrawn's own origin. A public page cannot fetch a host
// that resolves to a private address (Local Network Access): for tailnet users baas resolves
// to its 100.x address, so a direct call from this Cloudflare origin is blocked in the browser
// before it leaves. Here it goes out from Cloudflare to the bridge's public Funnel address.
//
// Origin is set on every request because a same-origin GET carries none, and the bridge
// answers whiteboard routes only for its configured whiteboard origin; it authorizes on the
// whiteboard token, not on Origin.
//
// Client-supplied forwarding headers are dropped: the bridge must not take a caller's word
// for its address. Set-Cookie is dropped on the way back, so nothing upstream can set a
// cookie on this origin.
//
// Caveat: one extra hop through Cloudflare per call, and the bridge sees Cloudflare egress
// addresses, so any per-IP limit in front of it counts all hydrawn users as a few clients.
const UPSTREAM = "https://baas.tail10f2ea.ts.net:10000";
const DROPPED_REQUEST_HEADERS = ["cookie", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip"];

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const forwarded = new Request(UPSTREAM + url.pathname + url.search, request);
  forwarded.headers.set("origin", url.origin);
  for (const name of DROPPED_REQUEST_HEADERS) forwarded.headers.delete(name);
  const upstream = await fetch(forwarded, { redirect: "manual" });
  const response = new Response(upstream.body, upstream);
  response.headers.delete("set-cookie");
  return response;
}
