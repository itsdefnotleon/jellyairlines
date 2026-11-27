import { hash } from './brand';
import { ApiError, posterUrl, ticksToMinutes, type BaseItem } from './api';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icon = {
  film: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
  tv: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 2l3 4 3-4"/>'),
  music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  map: svg('<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>'),
  plane: svg('<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>'),
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  exit: svg('<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  play: svg('<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>'),
  chevL: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevR: svg('<path d="M9 5l7 7-7 7"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>'),
  rew: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  fwd: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>'),
  prev: svg('<path d="M6 5v14"/><path d="M19 5L9 12l10 7z" fill="currentColor"/>'),
  next: svg('<path d="M18 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/>'),
  audio: svg('<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>'),
  cc: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 10.2a2.5 2.5 0 1 0 0 3.6M17 10.2a2.5 2.5 0 1 0 0 3.6"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>'),
  swap: svg('<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>'),
  seat: svg('<path d="M7 3v10a2 2 0 0 0 2 2h7l2 6M7 13l-2 8M9 15h8"/>'),
};

/** The airline mark: a generic tail fin. The name is set as text beside it. */
export function logoMark(): string {
  return `<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
    <defs><linearGradient id="fin" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/>
    </linearGradient></defs>
    <path d="M6 34 L20 4 Q24 2 26 5 L22 22 L36 30 Q37 34 33 34 Z" fill="url(#fin)"/>
    <circle cx="21" cy="17" r="3.2" fill="var(--bg)"/>
  </svg>`;
}

/** Generated fallback art, shown behind posters and when an item has no image. */
export function posterArt(item: { title: string }): string {
  const h = hash(item.title) % 360;
  const h2 = (h + 50) % 360;
  return `background:
    radial-gradient(120% 80% at 80% 10%, hsl(${h2} 80% 60% / .55), transparent 60%),
    linear-gradient(165deg, hsl(${h} 55% 38%), hsl(${h2} 65% 10%));`;
}

const KIND_LABEL: Record<string, string> = { Movie: 'Film', Series: 'TV', Episode: 'TV', Season: 'TV', MusicAlbum: 'Album', Audio: 'Song' };

export function isSquare(item: BaseItem): boolean {
  return item.Type === 'MusicAlbum' || item.Type === 'Audio';
}

function cardText(item: BaseItem, latest = false): { title: string; sub: string; href: string } {
  // In "Recently added", Jellyfin groups new episodes under their show and ChildCount
  // becomes the number of new episodes, not seasons.
  if (latest && item.Type === 'Series') {
    const n = item.ChildCount ?? 0;
    return { title: item.Name, sub: n ? `${n} new episode${n === 1 ? '' : 's'}` : String(item.ProductionYear ?? ''), href: `#/item/${item.Id}` };
  }
  switch (item.Type) {
    case 'Episode':
      return {
        title: item.SeriesName ?? item.Name,
        sub: `${item.ParentIndexNumber != null ? `S${item.ParentIndexNumber} · ` : ''}${item.IndexNumber != null ? `E${item.IndexNumber} ` : ''}${item.Name}`,
        href: `#/item/${item.SeriesId ?? item.Id}`,
      };
    case 'Series':
      return { title: item.Name, sub: [item.ProductionYear, item.ChildCount ? `${item.ChildCount} season${item.ChildCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '), href: `#/item/${item.Id}` };
    case 'MusicAlbum':
      return { title: item.Name, sub: item.AlbumArtist ?? item.Artists?.[0] ?? String(item.ProductionYear ?? ''), href: `#/item/${item.Id}` };
    default: {
      const min = ticksToMinutes(item.RunTimeTicks);
      return { title: item.Name, sub: [item.ProductionYear, min && `${min} min`].filter(Boolean).join(' · '), href: `#/item/${item.Id}` };
    }
  }
}

export function posterCard(item: BaseItem, opts: { size?: 'md' | 'lg'; link?: boolean; latest?: boolean } = {}): string {
  const { title, sub, href } = cardText(item, opts.latest);
  const img = posterUrl(item, opts.size === 'lg' ? 600 : 360);
  const pct = item.UserData?.PlayedPercentage;
  const tag = opts.link === false ? 'div' : 'a';
  return `<${tag} class="poster ${isSquare(item) ? 'square' : ''} ${opts.size ?? 'md'}" ${opts.link === false ? '' : `href="${esc(href)}" data-nav`}>
    <div class="poster-art" style="${posterArt({ title })}">
      <span class="poster-title-art">${esc(title)}</span>
      ${img ? `<img class="poster-img" src="${esc(img)}" alt="" loading="lazy" decoding="async" />` : ''}
      <span class="poster-kind">${KIND_LABEL[item.Type] ?? item.Type}</span>
      ${item.UserData?.Played ? '<span class="poster-check" title="Watched">✓</span>' : ''}
      ${pct && pct > 0 && pct < 100 ? `<span class="poster-progress"><span style="width:${pct.toFixed(1)}%"></span></span>` : ''}
    </div>
    <div class="poster-meta">
      <div class="poster-title">${esc(title)}</div>
      <div class="poster-sub">${esc(sub)}</div>
    </div>
  </${tag}>`;
}

/** Placeholder cards while a list loads. */
export function skeletonCards(n: number, square = false): string {
  return Array.from({ length: n }, () => `<div class="poster skeleton ${square ? 'square' : ''}"><div class="poster-art"></div><div class="poster-meta"><div class="sk-line"></div><div class="sk-line short"></div></div></div>`).join('');
}

/** A clear, friendly error panel with a retry button. */
export function errorPanel(err: unknown, opts: { compact?: boolean } = {}): string {
  const msg = err instanceof ApiError ? err.message : 'Something went wrong while talking to the server.';
  const title = err instanceof ApiError && err.kind === 'not-found' ? "We couldn't find that" : 'Cabin systems are having trouble';
  return `<div class="error-panel ${opts.compact ? 'compact' : ''}" role="alert">
    <div class="error-icon">!</div>
    <div class="error-body">
      <h2>${esc(title)}</h2>
      <p>${esc(msg)}</p>
    </div>
    <button class="btn" type="button" data-retry>Try again</button>
  </div>`;
}

let toastTimer = 0;
export function toast(msg: string): void {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2600);
}
