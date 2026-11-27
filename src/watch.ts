// What the passenger is watching, shared between the player and the flight map.
// Kept in localStorage so the map still knows where the film was after a reload.

export interface WatchState {
  itemId: string;
  title: string;
  positionSec: number;
  durationSec: number;
  paused: boolean;
  /** True while the player is open. */
  active: boolean;
}

const KEY = 'ife.watch';
type Listener = (w: WatchState | null) => void;
const listeners = new Set<Listener>();
let current: WatchState | null = load();
let lastSaved = 0;

function load(): WatchState | null {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) ?? 'null') as WatchState | null;
    return w ? { ...w, active: false, paused: true } : null;
  } catch {
    return null;
  }
}

export function getWatch(): WatchState | null {
  return current;
}

export function setWatch(w: WatchState): void {
  current = w;
  const now = Date.now();
  // Write through at most every 2s during playback, immediately on pause or stop.
  if (w.paused || !w.active || now - lastSaved > 2000) {
    localStorage.setItem(KEY, JSON.stringify(w));
    lastSaved = now;
  }
  listeners.forEach((fn) => fn(w));
}

export function clearWatch(): void {
  current = null;
  localStorage.removeItem(KEY);
  listeners.forEach((fn) => fn(null));
}

export function onWatch(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Map mode setting ----------

export type MapMode = 'realtime' | 'playback';

export function getMapMode(): MapMode {
  return localStorage.getItem('ife.mapMode') === 'playback' ? 'playback' : 'realtime';
}

export function setMapMode(m: MapMode): void {
  localStorage.setItem('ife.mapMode', m);
  listeners.forEach((fn) => fn(current));
}
