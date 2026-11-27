import type { View } from '../router';
import {
  ApiError, backdropUrl, fmtTicks, getAlbumTracks, getEpisodes, getItem, getNextUp, getSeasons, imageUrl, ticksToMinutes, type BaseItem,
} from '../api';
import { audioPlayer } from '../audio';
import { navigate } from '../router';
import { errorPanel, esc, icon, posterArt, posterCard, toast } from '../ui';

function metaChips(item: BaseItem): string[] {
  const min = ticksToMinutes(item.RunTimeTicks);
  return [
    item.ProductionYear ? String(item.ProductionYear) : '',
    item.Type === 'Series' && item.ChildCount ? `${item.ChildCount} season${item.ChildCount === 1 ? '' : 's'}` : '',
    min && item.Type !== 'Series' && item.Type !== 'MusicAlbum' ? (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`) : '',
    // Some servers combine ratings, e.g. "SE:7 / SE:7+ / SE:Från 7 år"; the first is enough.
    item.OfficialRating?.split(' / ')[0] ?? '',
    item.CommunityRating ? `★ ${item.CommunityRating.toFixed(1)}` : '',
    (item.Genres ?? []).slice(0, 3).join(', '),
  ].filter(Boolean);
}

function playButtons(item: BaseItem): string {
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  const label = item.Type === 'MusicAlbum' ? 'Play album' : item.Type === 'Series' ? 'Play' : 'Play';
  if (pos > 0 && item.Type !== 'Series' && item.Type !== 'MusicAlbum') {
    return `<button class="btn btn-primary btn-xl" type="button" data-play="resume" data-autofocus>${icon.play}<span>Resume from ${esc(fmtTicks(pos))}</span></button>
      <button class="btn btn-xl" type="button" data-play="0">Start over</button>`;
  }
  return `<button class="btn btn-primary btn-xl" type="button" data-play="${item.Type === 'Series' ? 'nextup' : item.Type === 'MusicAlbum' ? 'album' : 'resume'}" data-autofocus>${icon.play}<span>${label}</span></button>`;
}

function episodeRow(ep: BaseItem): string {
  const thumb = ep.ImageTags?.Primary ? imageUrl(ep.Id, 'Primary', { tag: ep.ImageTags.Primary, fillWidth: 320 }) : '';
  const pct = ep.UserData?.PlayedPercentage;
  const min = ticksToMinutes(ep.RunTimeTicks);
  return `
    <button class="ep" type="button" data-play="resume" data-id="${esc(ep.Id)}">
      <span class="ep-thumb" style="${posterArt({ title: ep.Name })}">
        ${thumb ? `<img class="poster-img" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" />` : ''}
        <span class="ep-play">${icon.play}</span>
        ${pct && pct > 0 && pct < 100 ? `<span class="poster-progress"><span style="width:${pct.toFixed(1)}%"></span></span>` : ''}
        ${ep.UserData?.Played ? '<span class="poster-check" title="Watched">✓</span>' : ''}
      </span>
      <span class="ep-body">
        <span class="ep-title">${ep.IndexNumber != null ? `${ep.IndexNumber}. ` : ''}${esc(ep.Name)}</span>
        <span class="ep-sub">${[ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber} · E${ep.IndexNumber}` : '', min ? `${min} min` : ''].filter(Boolean).join(' · ')}</span>
        ${ep.Overview ? `<span class="ep-overview">${esc(ep.Overview)}</span>` : ''}
      </span>
    </button>`;
}

function trackList(tracks: BaseItem[]): string {
  const multiDisc = new Set(tracks.map((t) => t.ParentIndexNumber ?? 1)).size > 1;
  return `<ol class="tracks">${tracks.map((t, i) => `
    <li><button class="track" type="button" data-play="track" data-id="${esc(t.Id)}">
      <span class="track-no">${multiDisc && t.ParentIndexNumber ? `${t.ParentIndexNumber}.` : ''}${t.IndexNumber ?? i + 1}</span>
      <span class="track-title">${esc(t.Name)}${t.Artists?.length && t.Artists.join() !== t.AlbumArtist ? `<small>${esc(t.Artists.join(', '))}</small>` : ''}</span>
      <span class="track-len">${esc(fmtTicks(t.RunTimeTicks))}</span>
    </button></li>`).join('')}</ol>`;
}

function detailHtml(item: BaseItem): string {
  const backdrop = backdropUrl(item);
  const eyebrow =
    item.Type === 'Episode' ? `<a class="eyebrow link" href="#/item/${esc(item.SeriesId ?? '')}" data-nav>${esc(item.SeriesName ?? '')}${item.ParentIndexNumber != null ? ` · Season ${item.ParentIndexNumber}` : ''}</a>` :
    item.Type === 'MusicAlbum' ? `<p class="eyebrow">${esc(item.AlbumArtist ?? item.Artists?.join(', ') ?? '')}</p>` : '';
  return `
    <div class="detail-backdrop" style="${posterArt({ title: item.Name })}" aria-hidden="true">
      ${backdrop ? `<img src="${esc(backdrop)}" alt="" decoding="async" />` : ''}
    </div>
    <div class="detail-main">
      <div class="detail-poster">${posterCard(item, { size: 'lg', link: false })}</div>
      <div class="detail-info">
        ${eyebrow}
        <h1>${item.Type === 'Episode' && item.IndexNumber != null ? `${item.IndexNumber}. ` : ''}${esc(item.Name)}</h1>
        <p class="meta">${metaChips(item).map((m) => `<span>${esc(m)}</span>`).join('')}</p>
        ${item.Taglines?.[0] ? `<p class="tagline">${esc(item.Taglines[0])}</p>` : ''}
        ${item.Overview ? `<p class="overview">${esc(item.Overview)}</p>` : ''}
        <div class="actions">${playButtons(item)}</div>
      </div>
    </div>
    <div data-children></div>`;
}

export const itemView: View = ({ id }) => ({
  html: `<section class="detail" data-detail><div class="detail-loading"><div class="spinner" aria-label="Loading"></div></div></section>`,
  mount(root) {
    const host = root.querySelector<HTMLElement>('[data-detail]')!;
    let alive = true;

    const loadSeason = async (seriesId: string, seasonId: string, box: HTMLElement) => {
      box.innerHTML = '<div class="detail-loading small"><div class="spinner"></div></div>';
      try {
        const eps = await getEpisodes(seriesId, seasonId);
        if (!alive) return;
        box.innerHTML = eps.Items.length ? eps.Items.map(episodeRow).join('') : '<p class="muted">No episodes in this season yet.</p>';
      } catch (e) {
        if (!alive) return;
        box.innerHTML = errorPanel(e, { compact: true });
        box.querySelector('[data-retry]')!.addEventListener('click', () => loadSeason(seriesId, seasonId, box));
      }
    };

    const loadChildren = async (item: BaseItem, box: HTMLElement) => {
      try {
        if (item.Type === 'Series') {
          const seasons = (await getSeasons(item.Id)).Items;
          if (!alive) return;
          if (!seasons.length) { box.innerHTML = '<p class="muted">No episodes yet.</p>'; return; }
          // Start on the first season that still has something unwatched.
          const start = seasons.find((s) => (s.UserData?.UnplayedItemCount ?? 1) > 0 && (s.IndexNumber ?? 1) > 0) ?? seasons[0];
          box.innerHTML = `
            <div class="seasons">
              <div class="chips" role="tablist" aria-label="Seasons">
                ${seasons.map((s) => `<button class="chip ${s.Id === start.Id ? 'active' : ''}" type="button" role="tab" aria-selected="${s.Id === start.Id}" data-season="${esc(s.Id)}">${esc(s.Name)}</button>`).join('')}
              </div>
              <div class="episodes"></div>
            </div>`;
          const eps = box.querySelector<HTMLElement>('.episodes')!;
          box.querySelectorAll<HTMLElement>('[data-season]').forEach((chip) =>
            chip.addEventListener('click', () => {
              box.querySelectorAll('[data-season]').forEach((c) => {
                c.classList.toggle('active', c === chip);
                c.setAttribute('aria-selected', String(c === chip));
              });
              loadSeason(item.Id, chip.dataset.season!, eps);
            }),
          );
          loadSeason(item.Id, start.Id, eps);
        } else if (item.Type === 'MusicAlbum') {
          tracks = (await getAlbumTracks(item.Id)).Items;
          if (!alive) return;
          box.innerHTML = tracks.length ? trackList(tracks) : '<p class="muted">This album has no tracks.</p>';
        }
      } catch (e) {
        if (!alive) return;
        box.innerHTML = errorPanel(e, { compact: true });
        box.querySelector('[data-retry]')!.addEventListener('click', () => loadChildren(item, box));
      }
    };

    const load = async () => {
      host.innerHTML = '<div class="detail-loading"><div class="spinner" aria-label="Loading"></div></div>';
      try {
        const item = await getItem(id);
        if (!alive) return;
        current = item;
        host.innerHTML = detailHtml(item);
        host.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
        loadChildren(item, host.querySelector<HTMLElement>('[data-children]')!);
      } catch (e) {
        if (!alive) return;
        host.innerHTML = errorPanel(e);
        host.querySelector('[data-retry]')!.addEventListener('click', load);
      }
    };

    let current: BaseItem | null = null;
    let tracks: BaseItem[] = [];

    host.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-play]');
      if (!b || !current) return;
      const mode = b.dataset.play!;
      try {
        if (mode === 'album' || mode === 'track') {
          if (!tracks.length) tracks = (await getAlbumTracks(current.Id)).Items;
          if (!tracks.length) return toast('This album has no tracks.');
          const at = mode === 'track' ? Math.max(0, tracks.findIndex((t) => t.Id === b.dataset.id)) : 0;
          audioPlayer.playQueue(tracks, at);
          toast(`Now playing: ${tracks[at].Name}`);
        } else if (mode === 'nextup') {
          // Continue the show where you left off, or start from the first episode.
          const next = await getNextUp(current.Id).catch(() => undefined);
          const id = next?.Id ?? host.querySelector<HTMLElement>('.ep[data-id]')?.dataset.id;
          if (id) navigate(`/play/${id}/resume`); else toast('No episodes to play yet.');
        } else {
          navigate(`/play/${b.dataset.id ?? current.Id}/${mode}`);
        }
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Could not start playback.');
      }
    });

    load();
    return () => { alive = false; };
  },
});
