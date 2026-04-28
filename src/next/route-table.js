/* Shared route table for the SSR worker and the client hydrator.
   One source of truth — the worker matches paths to render the right view,
   and the client uses the same names to mount the right interactive shell. */

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

/** @param {string} pathname @param {URLSearchParams} search */
export function shouldRenderNext(pathname, search) {
  if (search.get("next") !== "1") return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/og/"))  return false;
  if (pathname.startsWith("/s/"))   return false;
  if (pathname.startsWith("/assets/")) return false;
  if (pathname === "/favicon.svg" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return false;
  return true;
}
