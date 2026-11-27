// Arrow-key navigation between on-screen controls, like a seatback remote.
// Tab/Shift+Tab and mouse/touch still work as normal.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [data-nav]';

type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function pick(from: HTMLElement, dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ca = center(a);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of document.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el === from || !visible(el) || el.closest('[inert]')) continue;
    const b = el.getBoundingClientRect();
    const cb = center(b);
    let primary: number, cross: number;
    switch (dir) {
      case 'ArrowRight': primary = b.left - a.right + 1; cross = cb.y - ca.y; break;
      case 'ArrowLeft': primary = a.left - b.right + 1; cross = cb.y - ca.y; break;
      case 'ArrowDown': primary = b.top - a.bottom + 1; cross = cb.x - ca.x; break;
      case 'ArrowUp': primary = a.top - b.bottom + 1; cross = cb.x - ca.x; break;
    }
    if (primary < -4) continue; // not in that direction
    const score = Math.max(primary, 0) + Math.abs(cross) * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function installSpatialNav(): void {
  document.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const active = document.activeElement as HTMLElement | null;
    // Let text fields keep left/right for the caret.
    if (active instanceof HTMLInputElement && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    // Selects and the map use arrows themselves.
    if (active instanceof HTMLSelectElement || active?.closest('.leaflet-container')) return;
    const from = active && active !== document.body ? active : null;
    const next = from ? pick(from, e.key as Dir) : document.querySelector<HTMLElement>(FOCUSABLE);
    if (next) {
      e.preventDefault();
      next.focus({ preventScroll: false });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  });
}
