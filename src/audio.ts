// Music player that lives outside the page views, so it keeps playing while you browse.
// It draws itself into the "now playing" pill in the bottom bar whenever that exists.

import {
  TICKS_PER_SECOND, posterUrl, reportProgress, reportStart, reportStopped, universalAudioUrl,
  type BaseItem, type ReportBody,
} from './api';
import { esc, icon, toast } from './ui';

const PROGRESS_EVERY_MS = 10_000;

function newSessionId(): string {
  return crypto.randomUUID?.().replace(/-/g, '') ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

class AudioPlayer {
  private el = new Audio();
  private queue: BaseItem[] = [];
  private index = -1;
  private playSessionId = '';
  private started = false;
  private progressTimer = 0;
  private failures = 0;

  constructor() {
    this.el.preload = 'auto';
    this.el.addEventListener('playing', () => {
      if (!this.started && this.current) {
        this.started = true;
        reportStart(this.body()).catch(() => {});
        clearInterval(this.progressTimer);
        this.progressTimer = window.setInterval(() => { if (!this.el.paused) reportProgress(this.body()).catch(() => {}); }, PROGRESS_EVERY_MS);
      }
      this.render();
    });
    this.el.addEventListener('pause', () => {
      if (this.started) reportProgress(this.body()).catch(() => {});
      this.render();
    });
    this.el.addEventListener('timeupdate', () => this.renderProgress());
    this.el.addEventListener('ended', () => this.next(true));
    this.el.addEventListener('error', () => {
      if (!this.current || !this.el.getAttribute('src')) return;
      // Skip one track the browser can't play, but give up (with a message) if several fail in a row,
      // which usually means a server or sign-in problem rather than a bad file.
      this.failures++;
      if (this.failures >= 2) {
        this.stop();
        toast("Music couldn't play. Check your connection to the server.");
      } else {
        this.next(true);
      }
    });
    this.el.addEventListener('playing', () => { this.failures = 0; });
    window.addEventListener('pagehide', () => this.endTrack());

    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-np]');
      if (!b) return;
      const a = b.dataset.np;
      if (a === 'toggle') this.toggle();
      else if (a === 'next') this.next();
      else if (a === 'prev') this.prev();
      else if (a === 'stop') this.stop();
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.el.play());
      navigator.mediaSession.setActionHandler('pause', () => this.el.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    }
  }

  get current(): BaseItem | undefined { return this.queue[this.index]; }
  get isPlaying(): boolean { return !!this.current && !this.el.paused; }

  /** Plays a list of tracks starting at `start`. */
  playQueue(tracks: BaseItem[], start = 0): void {
    this.queue = tracks;
    this.playIndex(start);
  }

  toggle(): void {
    if (!this.current) return;
    if (this.el.paused) this.el.play().catch(() => {}); else this.el.pause();
  }

  pause(): void { if (this.current && !this.el.paused) this.el.pause(); }

  next(auto = false): void {
    if (this.index + 1 < this.queue.length) this.playIndex(this.index + 1);
    else if (auto) this.stop();
  }

  prev(): void {
    // Like most players: restart the song unless we're right at its start.
    if (this.el.currentTime > 4 || this.index === 0) { this.el.currentTime = 0; return; }
    this.playIndex(this.index - 1);
  }

  stop(): void {
    this.endTrack();
    this.el.removeAttribute('src');
    this.el.load();
    this.queue = [];
    this.index = -1;
    this.render();
  }

  private playIndex(i: number): void {
    this.endTrack();
    this.index = i;
    const t = this.current;
    if (!t) return this.stop();
    this.playSessionId = newSessionId();
    this.el.src = universalAudioUrl(t.Id, { playSessionId: this.playSessionId });
    this.el.play().catch(() => {});
    if ('mediaSession' in navigator) {
      const art = posterUrl(t, 512);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.Name,
        artist: t.Artists?.join(', ') ?? t.AlbumArtist ?? '',
        album: (t as BaseItem & { Album?: string }).Album ?? '',
        artwork: art ? [{ src: art, sizes: '512x512' }] : [],
      });
    }
    this.render();
  }

  private body(): ReportBody {
    return {
      ItemId: this.current!.Id,
      PlaySessionId: this.playSessionId,
      PositionTicks: Math.round((this.el.currentTime || 0) * TICKS_PER_SECOND),
      IsPaused: this.el.paused,
      CanSeek: true,
      PlayMethod: 'DirectPlay',
    };
  }

  private endTrack(): void {
    if (this.started && this.current) reportStopped(this.body());
    this.started = false;
    clearInterval(this.progressTimer);
  }

  /** Redraws the bottom-bar pill. Safe to call any time; does nothing if the bar isn't on screen. */
  render(): void {
    const box = document.querySelector<HTMLElement>('.now-playing');
    if (!box) return;
    const t = this.current;
    if (!t) {
      box.classList.remove('active');
      box.innerHTML = '<span class="np-dot"></span><span class="np-text">Nothing playing</span>';
      return;
    }
    const art = posterUrl(t, 96);
    box.classList.add('active');
    box.innerHTML = `
      <span class="np-art">${art ? `<img src="${esc(art)}" alt="" />` : icon.music}</span>
      <span class="np-info">
        <span class="np-title">${esc(t.Name)}</span>
        <span class="np-artist">${esc(t.Artists?.join(', ') || t.AlbumArtist || '')}</span>
      </span>
      <span class="np-controls">
        <button type="button" class="np-btn" data-np="prev" aria-label="Previous track">${icon.prev}</button>
        <button type="button" class="np-btn np-main" data-np="toggle" aria-label="${this.el.paused ? 'Play' : 'Pause'}">${this.el.paused ? icon.play : icon.pause}</button>
        <button type="button" class="np-btn" data-np="next" aria-label="Next track" ${this.index + 1 >= this.queue.length ? 'disabled' : ''}>${icon.next}</button>
        <button type="button" class="np-btn" data-np="stop" aria-label="Stop music">${icon.stop}</button>
      </span>
      <span class="np-progress"><span></span></span>`;
    this.renderProgress();
  }

  private renderProgress(): void {
    const bar = document.querySelector<HTMLElement>('.now-playing .np-progress span');
    const d = this.el.duration || (this.current?.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
    if (bar) bar.style.width = d ? `${Math.min(100, (this.el.currentTime / d) * 100)}%` : '0%';
  }
}

export const audioPlayer = new AudioPlayer();
