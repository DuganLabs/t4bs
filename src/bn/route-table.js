/* Single source of truth for the routes the BaseNative SSR worker
   serves. Mirrors @basenative/router's path syntax so the client-side
   router uses the exact same table after hydration. */

/** @typedef {'lobby'|'play'|'submit'|'moderate'|'admin'|'not-found'} RouteName */

/** @type {ReadonlyArray<{ path: string; name: RouteName }>} */
export const routes = [
  { path: "/",         name: "lobby"    },
  { path: "/play",     name: "play"     },
  { path: "/submit",   name: "submit"   },
  { path: "/moderate", name: "moderate" },
  { path: "/admin",    name: "admin"    },
];

/** @param {string} pathname @returns {RouteName} */
export function matchRoute(pathname) {
  const norm = pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;
  for (const r of routes) if (r.path === norm) return r.name;
  return "not-found";
}

/* Asset / API / OG / share paths fall through to their own handlers
   so the SSR worker never intercepts them. `?legacy=1` is the escape
   hatch back to the static SPA shell at dist/index.html. */
/** @param {string} pathname @param {URLSearchParams} search */
export function shouldRenderSsr(pathname, search) {
  if (search.get("legacy") === "1") return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/og/"))  return false;
  if (pathname.startsWith("/s/"))   return false;
  if (pathname.startsWith("/assets/")) return false;
  if (pathname === "/asset-manifest.json") return false;
  if (pathname === "/favicon.svg" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return false;
  return true;
}
