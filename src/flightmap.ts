// Leaflet + OpenStreetMap flight map, used full-size on the map page and small inside the player.
// Leaflet is loaded on first use so the rest of the app stays light.

import type * as Leaflet from 'leaflet';
import { getFlightPlan, greatCircle, positionAlong, type LiveFlight } from './flight';
import { airport } from './airports';
import { esc } from './ui';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
export const PLANE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>`;

export interface FlightMap {
  update(f: LiveFlight): void;
  setFollow(on: boolean): void;
  destroy(): void;
}

export function createFlightMap(el: HTMLElement, opts: { padding?: number; labels?: boolean; onMessage?: (msg: string) => void } = {}): FlightMap {
  const plan = getFlightPlan();
  const from = airport(plan.from)!, to = airport(plan.to)!;
  const path = greatCircle(from, to);
  const pad = opts.padding ?? 70;
  let map: Leaflet.Map | null = null;
  let plane: Leaflet.Marker | null = null;
  let done: Leaflet.Polyline | null = null;
  let follow = false;
  let disposed = false;
  let last: LiveFlight | null = null;

  const draw = (f: LiveFlight) => {
    if (!map || !plane || !done) return;
    const pos = positionAlong(path, f.progress);
    plane.setLatLng(pos.at);
    const icon = plane.getElement()?.firstElementChild as HTMLElement | null;
    if (icon) {
      icon.style.transform = `rotate(${pos.heading.toFixed(1)}deg)`;
      icon.classList.toggle('holding', !!f.watching?.paused && f.mode === 'playback' && f.progress > 0 && !f.arrived);
    }
    done.setLatLngs([...path.slice(0, pos.index + 1), pos.at]); // at most 160 points: cheap
    if (follow) map.panTo(pos.at, { animate: true, duration: 0.5 });
  };

  (async () => {
    try {
      const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      if (disposed) return;
      map = L.map(el, { zoomSnap: 0.25, minZoom: 2, maxZoom: 12, worldCopyJump: false, attributionControl: true, zoomControl: opts.labels !== false });
      map.attributionControl.setPrefix(false);
      const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION, crossOrigin: true });
      let tileErrors = 0;
      tiles.on('tileerror', () => {
        if (++tileErrors === 3) opts.onMessage?.("Map tiles couldn't load (are you offline?). Your route is still shown.");
      });
      tiles.addTo(map);
      L.polyline(path, { className: 'route-todo-line', interactive: false }).addTo(map);
      done = L.polyline([path[0]], { className: 'route-done-line', interactive: false }).addTo(map);
      for (const [a, end] of [[from, path[0]], [to, path[path.length - 1]]] as const) {
        const dot = L.circleMarker(end, { radius: 7, className: 'city-dot', interactive: false });
        if (opts.labels !== false) {
          dot.bindTooltip(`<b>${esc(a.code)}</b> ${esc(a.city)}`, { permanent: true, direction: 'bottom', offset: [0, 8], className: 'city-label' });
        }
        dot.addTo(map);
      }
      plane = L.marker(path[0], {
        icon: L.divIcon({ className: 'plane-marker', html: `<div>${PLANE_SVG}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
        keyboard: false,
        interactive: false,
      }).addTo(map);
      map.fitBounds(path, { padding: [pad, pad] });
      opts.onMessage?.('');
      if (last) draw(last);
    } catch {
      if (!disposed) opts.onMessage?.("The map couldn't start. The countdown is still accurate.");
    }
  })();

  return {
    update(f) { last = f; draw(f); },
    setFollow(on) {
      follow = on;
      if (!map || !plane) return;
      if (on) map.setView(plane.getLatLng(), Math.max(map.getZoom(), 5));
      else map.fitBounds(path, { padding: [pad, pad] });
    },
    destroy() { disposed = true; map?.remove(); map = null; },
  };
}
