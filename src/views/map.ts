import type { View } from '../router';
import { fmtDuration, liveFlight, localTimeAt, type LiveFlight } from '../flight';
import { createFlightMap, PLANE_SVG } from '../flightmap';
import { esc } from '../ui';
import { getMapMode, onWatch, setMapMode, type MapMode } from '../watch';

function hudLabel(f: LiveFlight): string {
  if (f.arrived) return `Welcome to ${f.to.city}`;
  if (f.mode === 'realtime') return 'Time to destination';
  if (!f.watching) return 'At the gate · start a film or episode to depart';
  if (f.watching.paused) return `Holding · ${f.watching.title} is paused`;
  return `Following ${f.watching.title}`;
}

function arrivalText(f: LiveFlight): string {
  if (f.arrived) return 'Landed';
  if (f.mode === 'playback' && (!f.watching || f.watching.paused)) return '—';
  return localTimeAt(f.to.tz, new Date(Date.now() + f.remainingMs));
}

export const mapView: View = () => {
  const f0 = liveFlight();
  const mode = getMapMode();
  return {
    html: `
    <section class="map">
      <div class="map-stage">
        <div class="map-canvas" aria-label="Flight map from ${esc(f0.from.city)} to ${esc(f0.to.city)}"></div>
        <div class="map-loading" data-map-msg>Loading map…</div>
        <div class="map-hud">
          <p class="eyebrow">${esc(f0.from.city)} to ${esc(f0.to.city)}</p>
          <div class="hud-big" data-remain></div>
          <div class="hud-label" data-remain-label></div>
          <div class="hud-bar"><span data-bar></span></div>
        </div>
        <div class="map-mode" role="radiogroup" aria-label="Flight clock">
          <button type="button" role="radio" aria-checked="${mode === 'realtime'}" data-mode="realtime">Real time</button>
          <button type="button" role="radio" aria-checked="${mode === 'playback'}" data-mode="playback">Follow my film</button>
        </div>
        <button class="icon-btn map-follow" type="button" data-follow aria-pressed="false" title="Follow the plane">${PLANE_SVG}</button>
      </div>
      <div class="map-panel">
        <div><span>Arrival (${esc(f0.to.code)} time)</span><b data-arrival></b></div>
        <div><span>Time at ${esc(f0.to.city)}</span><b data-dest-time></b></div>
        <div><span>Distance to go</span><b data-km></b></div>
        <div><span>Altitude</span><b data-alt></b></div>
        <div><span>Ground speed</span><b data-speed></b></div>
      </div>
    </section>`,
    mount(root) {
      const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
      const msg = $('[data-map-msg]');
      const fmap = createFlightMap($('.map-canvas'), {
        onMessage: (m) => { msg.textContent = m; msg.hidden = !m; msg.classList.toggle('warn', !!m); },
      });

      const update = () => {
        const f = liveFlight();
        $('[data-remain]').textContent = f.arrived ? 'Arrived' : fmtDuration(f.remainingMs, true);
        $('[data-remain-label]').textContent = hudLabel(f);
        $('[data-bar]').style.width = `${(f.progress * 100).toFixed(2)}%`;
        $('[data-arrival]').textContent = arrivalText(f);
        $('[data-dest-time]').textContent = localTimeAt(f.to.tz);
        $('[data-km]').textContent = `${Math.round(f.totalKm * (1 - f.progress)).toLocaleString()} km`;
        $('[data-alt]').textContent = `${f.altitudeM.toLocaleString()} m`;
        $('[data-speed]').textContent = `${f.speedKmh.toLocaleString()} km/h`;
        fmap.update(f);
      };
      update();
      const timer = window.setInterval(update, 1000);
      const off = onWatch(update);

      root.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          setMapMode(b.dataset.mode as MapMode);
          root.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          update();
        }),
      );

      let follow = false;
      const followBtn = $('[data-follow]');
      followBtn.addEventListener('click', () => {
        follow = !follow;
        followBtn.setAttribute('aria-pressed', String(follow));
        fmap.setFollow(follow);
      });

      return () => { clearInterval(timer); off(); fmap.destroy(); };
    },
  };
};
