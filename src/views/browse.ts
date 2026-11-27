import type { View } from '../router';
import { getItems, type ItemQuery } from '../api';
import { errorPanel, esc, icon, posterCard, skeletonCards } from '../ui';

const SECTIONS: Record<string, { type: string; title: string; icon: string; square?: boolean }> = {
  movies: { type: 'Movie', title: 'Movies', icon: icon.film },
  tv: { type: 'Series', title: 'TV', icon: icon.tv },
  music: { type: 'MusicAlbum', title: 'Music', icon: icon.music, square: true },
};

const SORTS: { id: string; label: string; sortBy: string; sortOrder: 'Ascending' | 'Descending' }[] = [
  { id: 'az', label: 'A–Z', sortBy: 'SortName', sortOrder: 'Ascending' },
  { id: 'new', label: 'Recently added', sortBy: 'DateCreated,SortName', sortOrder: 'Descending' },
  { id: 'year', label: 'Release year', sortBy: 'ProductionYear,PremiereDate,SortName', sortOrder: 'Descending' },
];

const PAGE = 60;

export const browseView: View = ({ kind }) => {
  const sec = SECTIONS[kind] ?? SECTIONS.movies;

  return {
    html: `
    <section class="browse">
      <div class="browse-head">
        <h1><span class="h-icon">${sec.icon}</span>${sec.title}<span class="count muted" data-total></span></h1>
        <label class="search">
          ${icon.search}
          <input type="search" placeholder="Search ${esc(sec.title.toLowerCase())}" aria-label="Search ${esc(sec.title)}" enterkeyhint="search" />
        </label>
      </div>
      <div class="chips" role="group" aria-label="Sort">
        ${SORTS.map((s, i) => `<button class="chip ${i === 0 ? 'active' : ''}" type="button" data-sort="${s.id}" aria-pressed="${i === 0}">${s.label}</button>`).join('')}
      </div>
      <div class="grid ${sec.square ? 'grid-square' : ''}" data-grid></div>
      <div class="grid-sentinel" aria-hidden="true"></div>
      <div data-status></div>
    </section>`,
    mount(root) {
      const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
      const grid = root.querySelector<HTMLElement>('[data-grid]')!;
      const status = root.querySelector<HTMLElement>('[data-status]')!;
      const total = root.querySelector<HTMLElement>('[data-total]')!;
      const sentinel = root.querySelector<HTMLElement>('.grid-sentinel')!;
      let sort = SORTS[0];
      let loaded = 0;
      let totalCount = Infinity;
      let loading = false;
      let generation = 0; // ignores answers to outdated searches
      let alive = true;

      const query = (): ItemQuery => ({
        includeItemTypes: sec.type,
        searchTerm: input.value.trim() || undefined,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
        startIndex: loaded,
        limit: PAGE,
      });

      const loadMore = async () => {
        if (loading || loaded >= totalCount || !alive) return;
        loading = true;
        const gen = generation;
        if (loaded === 0) grid.innerHTML = skeletonCards(12, sec.square);
        status.innerHTML = '';
        try {
          const res = await getItems(query());
          if (gen !== generation || !alive) return;
          if (loaded === 0) grid.innerHTML = '';
          grid.insertAdjacentHTML('beforeend', res.Items.map((i) => posterCard(i)).join(''));
          loaded += res.Items.length;
          totalCount = res.Items.length < PAGE ? loaded : res.TotalRecordCount;
          total.textContent = totalCount ? totalCount.toLocaleString() : '';
          if (!loaded) {
            status.innerHTML = `<p class="empty">${input.value.trim()
              ? `Nothing matches “${esc(input.value.trim())}”.`
              : `No ${esc(sec.title.toLowerCase())} in your libraries yet.`}</p>`;
          }
        } catch (e) {
          if (gen !== generation || !alive) return;
          if (loaded === 0) grid.innerHTML = '';
          status.innerHTML = errorPanel(e);
          status.querySelector('[data-retry]')!.addEventListener('click', () => loadMore());
        } finally {
          if (gen === generation) loading = false;
        }
        // Keep filling if the screen isn't full yet.
        if (gen === generation && alive && loaded < totalCount && sentinel.getBoundingClientRect().top < innerHeight + 400) loadMore();
      };

      const reset = () => {
        generation++;
        loading = false;
        loaded = 0;
        totalCount = Infinity;
        loadMore();
      };

      let debounce = 0;
      input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = window.setTimeout(reset, 300);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(debounce); reset(); } });

      root.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((chip) =>
        chip.addEventListener('click', () => {
          root.querySelectorAll<HTMLElement>('[data-sort]').forEach((c) => {
            c.classList.toggle('active', c === chip);
            c.setAttribute('aria-pressed', String(c === chip));
          });
          sort = SORTS.find((s) => s.id === chip.dataset.sort) ?? SORTS[0];
          reset();
        }),
      );

      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      }, { root: document.getElementById('view'), rootMargin: '400px' });
      io.observe(sentinel);

      reset();
      return () => { alive = false; io.disconnect(); clearTimeout(debounce); };
    },
  };
};
