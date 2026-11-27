import type { View } from '../router';
import { navigate } from '../router';
import {
  ApiError, TICKS_PER_SECOND, directStreamUrl, getEpisodes, getItem, getNextUp, getPlaybackInfo, reportProgress,
  reportStart, reportStopped, stopEncoding, subtitleUrl, withApiKey,
  type BaseItem, type MediaSource, type MediaStream, type PlayMethod, type ReportBody,
} from '../api';
import { audioPlayer } from '../audio';
import { canPlayHlsNatively, videoProfile } from '../profile';
import { esc, icon } from '../ui';
import { fmtDuration, liveFlight } from '../flight';
import { createFlightMap, type FlightMap } from '../flightmap';
import { getMapMode, setMapMode, setWatch } from '../watch';
import type HlsType from 'hls.js';

const PROGRESS_EVERY_MS = 10_000;
const IDLE_MS = 3_000;

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60), m = Math.floor((sec / 60) % 60), h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function titleOf(item: BaseItem): { title: string; sub: string } {
  if (item.Type === 'Episode') {
    const se = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber} · E${item.IndexNumber} · ` : '';
    return { title: item.SeriesName ?? item.Name, sub: `${se}${item.Name}` };
  }
  return { title: item.Name, sub: item.ProductionYear ? String(item.ProductionYear) : '' };
}

function streamLabel(s: MediaStream): string {
  return s.DisplayTitle || [s.Language?.toUpperCase(), s.Codec?.toUpperCase()].filter(Boolean).join(' · ') || `Track ${s.Index}`;
}

/** Resume point in seconds, or 0 when starting over or nearly finished. */
function resumeSeconds(item: BaseItem, start: string): number {
  if (start !== 'resume') return Math.max(0, Number(start) || 0);
  const pos = (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND;
  const total = (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
  // A saved position wins even if the item is marked watched (e.g. a rewatch in progress).
  if (total && pos > total * 0.95) return 0;
  return pos;
}

async function findNextEpisode(item: BaseItem): Promise<BaseItem | undefined> {
  if (item.Type !== 'Episode' || !item.SeriesId) return undefined;
  if (item.SeasonId) {
    const eps = (await getEpisodes(item.SeriesId, item.SeasonId)).Items;
    const i = eps.findIndex((e) => e.Id === item.Id);
    if (i >= 0 && eps[i + 1]) return eps[i + 1];
  }
  const next = await getNextUp(item.SeriesId);
  return next && next.Id !== item.Id ? next : undefined;
}

export const playerView: View = ({ id, start }) => ({
  bare: true,
  html: `
  <section class="player" data-player>
    <video playsinline crossorigin="anonymous" preload="auto"></video>
    <div class="player-busy"><div class="spinner" aria-label="Loading"></div></div>
    <div class="player-ui">
      <div class="player-top">
        <button class="icon-btn player-back" type="button" data-p="back" aria-label="Back">${icon.back}</button>
        <div class="player-titles"><h1 data-title></h1><p data-sub></p></div>
        <span class="player-method" data-method></span>
      </div>
      <button class="player-bigplay" type="button" data-p="toggle" aria-label="Play">${icon.play}</button>
      <div class="player-bottom">
        <div class="seek">
          <span class="seek-time" data-cur>0:00</span>
          <input class="seek-bar" type="range" min="0" max="0" step="1" value="0" aria-label="Seek" data-seek />
          <span class="seek-time" data-dur>0:00</span>
        </div>
        <div class="player-controls">
          <button class="pc-btn" type="button" data-p="rew" aria-label="Back 10 seconds">${icon.rew}<span>10</span></button>
          <button class="pc-btn pc-main" type="button" data-p="toggle" aria-label="Play or pause" data-autofocus><span data-pp>${icon.play}</span></button>
          <button class="pc-btn" type="button" data-p="fwd" aria-label="Forward 30 seconds">${icon.fwd}<span>30</span></button>
          <span class="pc-spacer"></span>
          <button class="pc-btn pc-text" type="button" data-p="map" aria-pressed="false">${icon.map}<span>Map</span></button>
          <button class="pc-btn pc-text" type="button" data-p="audio" aria-haspopup="menu">${icon.audio}<span>Audio</span></button>
          <button class="pc-btn pc-text" type="button" data-p="subs" aria-haspopup="menu">${icon.cc}<span>Subtitles</span></button>
          <button class="pc-btn" type="button" data-p="fs" aria-label="Full screen">${icon.fullscreen}</button>
        </div>
      </div>
      <div class="player-menu" role="menu" hidden></div>
    </div>
    <aside class="player-map" hidden aria-label="Flight map">
      <div class="pm-canvas"></div>
      <div class="pm-hud">
        <div class="pm-remain" data-pm-remain></div>
        <div class="pm-label" data-pm-label></div>
      </div>
      <button class="pm-mode" type="button" data-p="mapmode"></button>
    </aside>
    <div class="player-error" hidden></div>
    <div class="upnext" hidden></div>
  </section>`,
  mount(root) {
    const section = root.querySelector<HTMLElement>('[data-player]')!;
    const video = section.querySelector('video')!;
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => section.querySelector<T>(sel)!;
    const seek = $<HTMLInputElement>('[data-seek]');
    const menu = $('.player-menu');
    const errBox = $('.player-error');

    let item: BaseItem | null = null;
    let source: MediaSource | null = null;
    let playSessionId: string | undefined;
    let method: PlayMethod = 'DirectPlay';
    let audioIndex: number | undefined;
    let subIndex = -1;
    let burnedIn = false;
    let subsChosen = false;
    let hls: HlsType | null = null;
    let started = false;
    let seeking = false;
    let alive = true;
    let progressTimer = 0;
    let idleTimer = 0;
    let upNextTimer = 0;
    let miniMap: FlightMap | null = null;
    const pmBox = $('.player-map');

    audioPlayer.pause(); // the film takes over the speakers

    const body = (): ReportBody => ({
      ItemId: item!.Id,
      MediaSourceId: source?.Id,
      PlaySessionId: playSessionId,
      PositionTicks: Math.round((video.currentTime || 0) * TICKS_PER_SECOND),
      IsPaused: video.paused,
      IsMuted: video.muted,
      CanSeek: true,
      PlayMethod: method,
      AudioStreamIndex: audioIndex,
      SubtitleStreamIndex: subIndex,
    });

    const endSession = () => {
      if (item && started) reportStopped(body());
      if (method === 'Transcode') stopEncoding(playSessionId);
      started = false;
      clearInterval(progressTimer);
      hls?.destroy();
      hls = null;
    };

    /** Shares the film's position with the flight map (and the top-bar clock). */
    let closed = false;
    const publish = () => {
      // Tearing down the video fires late events at position 0; never let those overwrite the last spot.
      if (!item || closed) return;
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
      setWatch({ itemId: item.Id, title: titleOf(item).title, positionSec: video.currentTime || 0, durationSec: dur, paused: video.paused, active: alive });
      updateMiniMap();
    };

    const updateMiniMap = () => {
      if (pmBox.hidden) return;
      const f = liveFlight();
      $('[data-pm-remain]').textContent = f.arrived ? 'Arrived' : fmtDuration(f.remainingMs, true);
      $('[data-pm-label]').textContent = f.mode === 'playback'
        ? (video.paused ? 'Holding while paused' : `to ${f.to.city} · follows this film`)
        : `to ${f.to.city} · real time`;
      $('[data-p=mapmode]').textContent = f.mode === 'playback' ? 'Switch to real time' : 'Follow this film';
      miniMap?.update(f);
    };

    const toggleMap = (btn: HTMLElement) => {
      pmBox.hidden = !pmBox.hidden;
      btn.setAttribute('aria-pressed', String(!pmBox.hidden));
      if (!pmBox.hidden && !miniMap) miniMap = createFlightMap(pmBox.querySelector('.pm-canvas')!, { padding: 24, labels: false });
      updateMiniMap();
    };

    const showError = (e: unknown) => {
      section.classList.remove('busy');
      const msg = e instanceof ApiError ? e.message
        : typeof e === 'string' ? e
        : 'This title could not be played. The file may be in a format the server cannot convert.';
      errBox.innerHTML = `<div class="error-panel" role="alert">
        <div class="error-icon">!</div>
        <div class="error-body"><h2>Playback problem</h2><p>${esc(msg)}</p></div>
        <button class="btn" type="button" data-p="retry">Try again</button>
        <button class="btn" type="button" data-p="back">Back</button>
      </div>`;
      errBox.hidden = false;
      errBox.querySelector<HTMLElement>('[data-p=retry]')?.focus();
    };

    /** (Re)loads the stream at a position, e.g. after changing audio or burned-in subtitles. */
    const load = async (startSec: number, opts: { forceTranscode?: boolean } = {}) => {
      section.classList.add('busy');
      errBox.hidden = true;
      endSession();
      try {
        const info = await getPlaybackInfo(id, {
          DeviceProfile: videoProfile(),
          MaxStreamingBitrate: 120_000_000,
          AudioStreamIndex: audioIndex,
          SubtitleStreamIndex: subIndex >= 0 ? subIndex : undefined,
          EnableDirectPlay: !opts.forceTranscode,
          EnableDirectStream: !opts.forceTranscode,
          EnableTranscoding: true,
        });
        if (!alive) return;
        if (info.ErrorCode) {
          throw info.ErrorCode === 'NotAllowed' ? 'Your account is not allowed to play this.'
            : info.ErrorCode === 'RateLimitExceeded' ? 'The server is busy. Try again in a moment.'
            : 'The server has no version of this that the browser can play.';
        }
        source = info.MediaSources[0];
        playSessionId = info.PlaySessionId;
        if (!source) throw 'The server returned no playable file.';
        audioIndex ??= source.DefaultAudioStreamIndex;
        if (!subsChosen) {
          // Honour the server's default (e.g. forced or preferred-language subtitles) when it is text.
          subsChosen = true;
          const d = source.DefaultSubtitleStreamIndex;
          if (d != null && d >= 0 && isText(d)) subIndex = d;
        }

        let url: string;
        let isHls = false;
        if (!opts.forceTranscode && (source.SupportsDirectPlay || source.SupportsDirectStream)) {
          method = source.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream';
          url = directStreamUrl(id, source.Id, playSessionId);
        } else if (source.TranscodingUrl) {
          method = 'Transcode';
          url = withApiKey(source.TranscodingUrl);
          isHls = source.TranscodingSubProtocol === 'hls' || /\.m3u8/i.test(url);
        } else {
          throw 'The server has no version of this that the browser can play.';
        }
        burnedIn = method === 'Transcode' && subIndex >= 0 && !isText(subIndex);
        $('[data-method]').textContent = method === 'Transcode' ? 'Converting on server' : '';

        if (isHls && !canPlayHlsNatively()) {
          const { default: Hls } = await import('hls.js');
          if (!alive) return;
          if (!Hls.isSupported()) throw 'This browser cannot play streamed video.';
          hls = new Hls({ startPosition: startSec, maxBufferLength: 30, backBufferLength: 60 });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
            else showError('The stream stopped. Check your connection to the server.');
          });
          hls.loadSource(url);
          hls.attachMedia(video);
        } else {
          video.src = url;
          video.addEventListener('loadedmetadata', () => { if (startSec > 0) video.currentTime = startSec; }, { once: true });
        }
        applyTextSubtitle();
        await video.play().catch(() => { /* autoplay blocked: the big play button stays visible */ });
      } catch (e) {
        if (alive) showError(e);
      }
    };

    const isText = (index: number) => {
      const s = source?.MediaStreams.find((m) => m.Index === index);
      return !!s && (s.IsTextSubtitleStream ?? s.DeliveryMethod === 'External');
    };

    /** Text subtitles are a <track> on the video, so switching them needs no reload. */
    const applyTextSubtitle = () => {
      video.querySelectorAll('track').forEach((t) => t.remove());
      if (subIndex < 0 || !source || !isText(subIndex)) return;
      const s = source.MediaStreams.find((m) => m.Index === subIndex)!;
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = streamLabel(s);
      if (s.Language) track.srclang = s.Language.slice(0, 2);
      track.src = s.DeliveryUrl && /vtt/i.test(s.DeliveryUrl) ? withApiKey(s.DeliveryUrl) : subtitleUrl(id, source.Id, s.Index);
      track.default = true;
      video.append(track);
      track.addEventListener('load', () => { track.track.mode = 'showing'; });
      track.track.mode = 'showing';
    };

    const chooseAudio = (index: number) => {
      if (index === audioIndex) return;
      audioIndex = index;
      // Browsers can't switch tracks inside one file, so the server remixes from here.
      const mustTranscode = method === 'Transcode' || index !== source?.DefaultAudioStreamIndex;
      load(video.currentTime, { forceTranscode: mustTranscode });
    };

    const chooseSubtitle = (index: number) => {
      if (index === subIndex) return;
      const wasBurned = burnedIn;
      subIndex = index;
      if (index >= 0 && !isText(index)) {
        load(video.currentTime, { forceTranscode: true }); // image subtitles get burned in
      } else if (wasBurned) {
        load(video.currentTime, { forceTranscode: audioIndex !== source?.DefaultAudioStreamIndex });
      } else {
        applyTextSubtitle();
        if (started) reportProgress(body()).catch(() => {});
      }
    };

    // ---------- Menus ----------

    const openMenu = (kind: 'audio' | 'subs', anchor: HTMLElement) => {
      if (!source) return;
      const streams = source.MediaStreams.filter((m) => m.Type === (kind === 'audio' ? 'Audio' : 'Subtitle'));
      const current = kind === 'audio' ? audioIndex : subIndex;
      const items = kind === 'subs' ? [{ Index: -1, label: 'Off' }, ...streams.map((s) => ({ Index: s.Index, label: streamLabel(s) }))]
        : streams.map((s) => ({ Index: s.Index, label: streamLabel(s) }));
      menu.innerHTML = `<p class="menu-title">${kind === 'audio' ? 'Audio' : 'Subtitles'}</p>` + (items.length
        ? items.map((o) => `<button type="button" role="menuitemradio" aria-checked="${o.Index === current}" data-choose="${kind}:${o.Index}">${esc(o.label)}</button>`).join('')
        : '<p class="muted">Only one track available.</p>');
      const r = anchor.getBoundingClientRect();
      menu.style.right = `${Math.max(16, innerWidth - r.right)}px`;
      menu.hidden = false;
      (menu.querySelector<HTMLElement>('[aria-checked=true]') ?? menu.querySelector<HTMLElement>('button'))?.focus();
    };
    const closeMenu = () => { menu.hidden = true; };

    // ---------- Controls ----------

    const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
    const skip = (d: number) => { video.currentTime = Math.max(0, Math.min((video.duration || Infinity) - 1, video.currentTime + d)); poke(); };
    const leave = () => { if (history.length > 1) history.back(); else navigate(item ? `/item/${item.Type === 'Episode' && item.SeriesId ? item.SeriesId : item.Id}` : '/home'); };
    const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : section.requestFullscreen()).catch(() => {});

    const poke = () => {
      section.classList.remove('idle');
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { if (!video.paused && menu.hidden) section.classList.add('idle'); }, IDLE_MS);
    };

    section.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const choose = t.closest<HTMLElement>('[data-choose]');
      if (choose) {
        const [kind, idx] = choose.dataset.choose!.split(':');
        closeMenu();
        (kind === 'audio' ? chooseAudio : chooseSubtitle)(Number(idx));
        return;
      }
      const btn = t.closest<HTMLElement>('[data-p]');
      if (!btn) {
        if (!menu.hidden && !t.closest('.player-menu')) closeMenu();
        else if (t === video || t.classList.contains('player-ui')) { if (section.classList.contains('idle')) poke(); else toggle(); }
        return;
      }
      switch (btn.dataset.p) {
        case 'toggle': toggle(); break;
        case 'rew': skip(-10); break;
        case 'fwd': skip(30); break;
        case 'back': leave(); break;
        case 'fs': fullscreen(); break;
        case 'map': toggleMap(btn); break;
        case 'mapmode': setMapMode(getMapMode() === 'playback' ? 'realtime' : 'playback'); updateMiniMap(); break;
        case 'retry': load(video.currentTime || resumeAt); break;
        case 'audio': case 'subs':
          if (!menu.hidden) closeMenu(); else openMenu(btn.dataset.p as 'audio' | 'subs', btn);
          break;
      }
      poke();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target !== seek) return;
      const k = e.key;
      let handled = true;
      if (k === ' ' || k === 'k' || k === 'MediaPlayPause') { if (!(document.activeElement instanceof HTMLButtonElement) || k !== ' ') toggle(); else handled = false; }
      else if (k === 'ArrowLeft' && menu.hidden) skip(-10);
      else if (k === 'ArrowRight' && menu.hidden) skip(10);
      else if (k === 'f') fullscreen();
      else if (k === 'Escape' || k === 'Backspace') { if (!menu.hidden) closeMenu(); else if (!document.fullscreenElement) leave(); }
      else handled = false;
      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
      poke();
    };
    window.addEventListener('keydown', onKey, true);
    section.addEventListener('pointermove', poke);

    seek.addEventListener('input', () => { seeking = true; $('[data-cur]').textContent = fmt(Number(seek.value)); poke(); });
    seek.addEventListener('change', () => { video.currentTime = Number(seek.value); seeking = false; });

    // ---------- Media events and progress reporting ----------

    const sync = () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : (item?.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
      seek.max = String(Math.floor(dur));
      $('[data-dur]').textContent = fmt(dur);
      if (!seeking) {
        seek.value = String(Math.floor(video.currentTime));
        $('[data-cur]').textContent = fmt(video.currentTime);
      }
      seek.style.setProperty('--pct', dur ? `${(video.currentTime / dur) * 100}%` : '0%');
    };
    video.addEventListener('timeupdate', sync);
    let lastPublish = 0;
    video.addEventListener('timeupdate', () => {
      const now = performance.now();
      if (now - lastPublish > 900) { lastPublish = now; publish(); }
    });
    for (const ev of ['playing', 'pause', 'seeked', 'seeking'] as const) video.addEventListener(ev, publish);
    video.addEventListener('durationchange', sync);
    video.addEventListener('waiting', () => section.classList.add('busy'));
    video.addEventListener('playing', () => {
      section.classList.remove('busy', 'paused');
      $('[data-pp]').innerHTML = icon.pause;
      poke();
      if (!started && item) {
        started = true;
        reportStart(body()).catch(() => {});
        clearInterval(progressTimer);
        progressTimer = window.setInterval(() => { if (!video.paused) reportProgress(body()).catch(() => {}); }, PROGRESS_EVERY_MS);
      }
    });
    video.addEventListener('pause', () => {
      section.classList.add('paused');
      section.classList.remove('idle');
      $('[data-pp]').innerHTML = icon.play;
      if (started) reportProgress(body()).catch(() => {});
    });
    video.addEventListener('seeked', () => { if (started) reportProgress(body()).catch(() => {}); });
    video.addEventListener('canplay', () => section.classList.remove('busy'));
    video.addEventListener('error', () => {
      if (hls) return; // hls.js reports its own errors
      if (method !== 'Transcode') load(video.currentTime || resumeAt, { forceTranscode: true }); // direct play failed: let the server convert it
      else showError('The video could not be decoded.');
    });
    video.addEventListener('ended', async () => {
      endSession();
      if (!item) return;
      const next = await findNextEpisode(item).catch(() => undefined);
      if (!alive) return;
      if (!next) { leave(); return; }
      showUpNext(next);
    });

    const showUpNext = (next: BaseItem) => {
      const box = $('.upnext');
      let n = 10;
      const render = () => {
        box.innerHTML = `<p class="eyebrow">Up next in ${n}s</p>
          <h2>${esc(titleOf(next).sub || next.Name)}</h2>
          <div class="actions">
            <button class="btn btn-primary" type="button" data-up="go" data-autofocus>${icon.play}<span>Play now</span></button>
            <button class="btn" type="button" data-up="cancel">Cancel</button>
          </div>`;
      };
      render();
      box.hidden = false;
      box.querySelector<HTMLElement>('[data-up=go]')!.focus();
      const go = () => { clearInterval(upNextTimer); navigate(`/play/${next.Id}/resume`); };
      upNextTimer = window.setInterval(() => { n--; if (n <= 0) go(); else box.querySelector('.eyebrow')!.textContent = `Up next in ${n}s`; }, 1000);
      box.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-up]');
        if (!b) return;
        if (b.dataset.up === 'go') go();
        else { clearInterval(upNextTimer); box.hidden = true; leave(); }
      };
    };

    const onPageHide = () => endSession();
    window.addEventListener('pagehide', onPageHide);

    // ---------- Start ----------

    let resumeAt = 0;
    (async () => {
      try {
        item = await getItem(id);
        if (!alive) return;
        const t = titleOf(item);
        $('[data-title]').textContent = t.title;
        $('[data-sub]').textContent = t.sub;
        document.title = `${t.title} · Inflight Entertainment`;
        resumeAt = resumeSeconds(item, start);
        await load(resumeAt);
      } catch (e) {
        if (alive) showError(e);
      }
    })();

    return () => {
      alive = false;
      publish(); // last position, marked inactive so the map shows "holding"
      closed = true;
      miniMap?.destroy();
      endSession();
      clearTimeout(idleTimer);
      clearInterval(upNextTimer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pagehide', onPageHide);
      video.removeAttribute('src');
      video.load();
      document.title = 'Inflight Entertainment';
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  },
});
