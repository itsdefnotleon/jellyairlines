// Tiny hash router. Hash routes work on GitHub Pages without a 404 fallback.

export interface ViewResult {
  html: string;
  /** Called after the HTML is in the DOM; may return a cleanup function. */
  mount?: (root: HTMLElement) => void | (() => void);
  /** Full-screen views (the welcome screen) hide the seatback chrome. */
  bare?: boolean;
}

export type View = (params: Record<string, string>) => ViewResult;

interface Route { pattern: RegExp; keys: string[]; view: View }

const routes: Route[] = [];

export function route(path: string, view: View): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$',
  );
  routes.push({ pattern, keys, view });
}

export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/';
}

export function navigate(path: string): void {
  if (currentPath() === path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}

export function resolve(path: string): { view: View; params: Record<string, string> } | null {
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { view: r.view, params };
    }
  }
  return null;
}
