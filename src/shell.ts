import { airlineName, flightNumber } from './brand';
import { flightState, fmtDuration, liveFlight } from './flight';
import { getSession } from './session';
import { esc, icon, logoMark } from './ui';

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function shellHtml(): string {
  const s = getSession();
  const f = flightState();
  return `
  <div class="screen">
    <header class="topbar">
      <a class="brand" href="#/home" aria-label="Home" data-nav>
        ${logoMark()}
        <span class="brand-name">${esc(airlineName(s?.serverName))}</span>
      </a>
      <a class="flight-strip" href="#/map" aria-label="Flight map: ${esc(f.from.city)} to ${esc(f.to.city)}" data-nav>
        <span class="flight-no">${esc(flightNumber(s?.serverName))}</span>
        <span class="route"><b>${f.from.code}</b><span class="route-line" data-progress><span class="route-progress"></span>${icon.plane}</span><b>${f.to.code}</b></span>
      </a>
      <div class="clocks">
        <div class="clock"><span class="clock-label">Local time</span><span class="clock-val" data-clock="local"></span></div>
        <div class="clock"><span class="clock-label">Time to ${esc(f.to.city)}</span><span class="clock-val" data-clock="remain"></span></div>
      </div>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="bottombar" aria-label="Seat controls">
      <a class="bb-btn" href="#/home" data-nav>${icon.home}<span>Home</span></a>
      <button class="bb-btn" type="button" data-action="back">${icon.back}<span>Back</span></button>
      <div class="now-playing" aria-live="polite">
        <span class="np-dot"></span><span class="np-text">Nothing playing</span>
      </div>
      <div class="seat-tag">${icon.seat}<span>Seat 23A</span></div>
      <button class="bb-btn" type="button" data-action="signout">${icon.exit}<span>Disembark</span></button>
    </nav>
  </div>`;
}

let clockTimer = 0;
export function startClocks(): void {
  const tick = () => {
    const now = new Date();
    const f = liveFlight(now.getTime());
    document.querySelectorAll<HTMLElement>('[data-clock="local"]').forEach((el) => (el.textContent = fmtTime(now)));
    document.querySelectorAll<HTMLElement>('[data-clock="remain"]').forEach((el) => (el.textContent = f.arrived ? 'Arrived' : fmtDuration(f.remainingMs)));
    document.querySelectorAll<HTMLElement>('[data-progress]').forEach((el) => el.style.setProperty('--p', f.progress.toFixed(4)));
  };
  tick();
  clearInterval(clockTimer);
  clockTimer = window.setInterval(tick, 1000);
}
