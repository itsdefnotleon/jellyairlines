import type { View } from '../router';
import { airlineName } from '../brand';
import { countItems, getLatest } from '../api';
import { flightState } from '../flight';
import { getSession } from '../session';
import { errorPanel, esc, icon, posterCard, skeletonCards } from '../ui';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const homeView: View = () => {
  const s = getSession();
  const f = flightState();
  const tiles = [
    { href: '#/browse/movies', cls: 'tile-movies', icon: icon.film, title: 'Movies', count: 'Movie', one: 'film', many: 'films' },
    { href: '#/browse/tv', cls: 'tile-tv', icon: icon.tv, title: 'TV', count: 'Series', one: 'series', many: 'series' },
    { href: '#/browse/music', cls: 'tile-music', icon: icon.music, title: 'Music', count: 'MusicAlbum', one: 'album', many: 'albums' },
  ];

  return {
    html: `
    <section class="home">
      <div class="home-hello">
        <h1>${greeting()}${s?.userName ? `, ${esc(s.userName)}` : ''}</h1>
        <p class="muted">Sit back and relax. ${esc(airlineName(s?.serverName))} wishes you a pleasant flight.</p>
      </div>

      <div class="tiles">
        ${tiles.map((t, i) => `
          <a class="tile ${t.cls}" href="${t.href}" data-nav ${i === 0 ? 'data-autofocus' : ''}>
            <span class="tile-icon">${t.icon}</span>
            <span class="tile-text"><span class="tile-title">${t.title}</span><span class="tile-sub" data-count="${t.count}" data-one="${t.one}" data-many="${t.many}">&nbsp;</span></span>
          </a>`).join('')}
        <a class="tile tile-map" href="#/map" data-nav>
          <span class="tile-icon">${icon.map}</span>
          <span class="tile-text"><span class="tile-title">Flight Map</span><span class="tile-sub">${esc(f.from.city)} to ${esc(f.to.city)}</span></span>
          <svg class="tile-route" viewBox="0 0 200 80" aria-hidden="true">
            <path d="M10 66 Q100 -6 190 50" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 6"/>
            <circle cx="10" cy="66" r="4" fill="currentColor"/><circle cx="190" cy="50" r="4" fill="currentColor"/>
          </svg>
        </a>
      </div>

      <div class="rail">
        <div class="rail-head">
          <h2>Recently added</h2>
          <div class="rail-arrows">
            <button class="icon-btn" type="button" data-scroll="-1" aria-label="Scroll left">${icon.chevL}</button>
            <button class="icon-btn" type="button" data-scroll="1" aria-label="Scroll right">${icon.chevR}</button>
          </div>
        </div>
        <div class="rail-track" data-latest>${skeletonCards(8)}</div>
      </div>
    </section>`,
    mount(root) {
      let alive = true;
      const track = root.querySelector<HTMLElement>('[data-latest]')!;
      root.querySelectorAll<HTMLButtonElement>('[data-scroll]').forEach((b) =>
        b.addEventListener('click', () =>
          track.scrollBy({ left: Number(b.dataset.scroll) * track.clientWidth * 0.8, behavior: 'smooth' }),
        ),
      );

      root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        countItems(el.dataset.count!).then(
          (n) => { if (alive) el.textContent = plural(n, el.dataset.one!, el.dataset.many!); },
          () => { if (alive) el.textContent = ''; },
        );
      });

      const loadLatest = () => {
        track.classList.remove('rail-error');
        track.innerHTML = skeletonCards(8);
        getLatest(20).then(
          (items) => {
            if (!alive) return;
            track.innerHTML = items.length
              ? items.map((i) => posterCard(i, { latest: true })).join('')
              : '<p class="muted rail-empty">Nothing new yet. Add something to your Jellyfin libraries and it will appear here.</p>';
          },
          (e) => {
            if (!alive) return;
            track.classList.add('rail-error');
            track.innerHTML = errorPanel(e, { compact: true });
            track.querySelector('[data-retry]')!.addEventListener('click', loadLatest);
          },
        );
      };
      loadLatest();
      return () => { alive = false; };
    },
  };
};
