// The passenger's flight: chosen route, great-circle path and a real-time countdown.
// The flight departs when you board (sign in) and lands after a realistic flight time.

import { getMapMode, getWatch } from './watch';
import { AIRPORTS, DEFAULT_FROM, DEFAULT_TO, airport, type Airport } from './airports';
import { getSession } from './session';

export interface FlightPlan {
  from: string;
  to: string;
  /** Epoch ms when the passenger boarded. */
  departedAt: number;
}

const CRUISE_KMH = 850;
const TAXI_AND_CLIMB_MIN = 30;
const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(a: Airport, b: Airport): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function flightDurationMs(a: Airport, b: Airport): number {
  const minutes = (distanceKm(a, b) / CRUISE_KMH) * 60 + TAXI_AND_CLIMB_MIN;
  return Math.round(minutes / 5) * 5 * 60_000; // round to 5 min like a timetable
}

/** Points along the great circle; longitudes are unwrapped so lines don't jump across the map. */
export function greatCircle(a: Airport, b: Airport, n = 160): [number, number][] {
  const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
  const d = distanceKm(a, b) / EARTH_KM;
  const pts: [number, number][] = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    let lat: number, lon: number;
    if (d < 1e-9) { lat = a.lat; lon = a.lon; }
    else {
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      lat = deg(Math.atan2(z, Math.hypot(x, y)));
      lon = deg(Math.atan2(y, x));
    }
    if (prevLon !== null) {
      while (lon - prevLon > 180) lon -= 360;
      while (lon - prevLon < -180) lon += 360;
    }
    prevLon = lon;
    pts.push([lat, lon]);
  }
  return pts;
}

/** Compass bearing in degrees from p to q (lat/lon pairs). */
export function bearing(p: [number, number], q: [number, number]): number {
  const φ1 = rad(p[0]), φ2 = rad(q[0]), Δλ = rad(q[1] - p[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const fallbackDeparture = Date.now();

export function getFlightPlan(): FlightPlan {
  const f = getSession()?.flight;
  if (f && airport(f.from) && airport(f.to) && f.from !== f.to) return f;
  return { from: DEFAULT_FROM, to: DEFAULT_TO, departedAt: fallbackDeparture };
}

export interface FlightState {
  from: Airport;
  to: Airport;
  totalKm: number;
  durationMs: number;
  elapsedMs: number;
  remainingMs: number;
  /** 0..1 along the route. */
  progress: number;
  arrived: boolean;
  altitudeM: number;
  speedKmh: number;
}

export function flightState(plan = getFlightPlan(), now = Date.now()): FlightState {
  const from = airport(plan.from) ?? AIRPORTS[0];
  const to = airport(plan.to) ?? AIRPORTS[1];
  const durationMs = flightDurationMs(from, to);
  const elapsedMs = Math.min(Math.max(0, now - plan.departedAt), durationMs);
  const progress = durationMs ? elapsedMs / durationMs : 1;
  const remainingMs = durationMs - elapsedMs;
  const arrived = remainingMs <= 0;

  // Simple profile: climb over the first 20 min, descend over the last 25.
  const climb = Math.min(1, elapsedMs / (20 * 60_000));
  const descend = Math.min(1, remainingMs / (25 * 60_000));
  const phase = Math.min(climb, descend);
  return {
    from, to, durationMs, elapsedMs, remainingMs, progress, arrived,
    totalKm: distanceKm(from, to),
    altitudeM: arrived ? 0 : Math.round((10_670 * phase) / 10) * 10,
    speedKmh: arrived ? 0 : Math.round(250 + (CRUISE_KMH + 50 - 250) * phase),
  };
}

/** Position and heading of the plane along a precomputed path. */
export function positionAlong(path: [number, number][], progress: number): { at: [number, number]; heading: number; index: number } {
  const t = Math.min(1, Math.max(0, progress)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(t));
  const f = t - i;
  const a = path[i], b = path[i + 1];
  return { at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: bearing(a, b), index: i };
}

export function fmtDuration(ms: number, withSeconds = false): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (withSeconds) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function localTimeAt(tz: string, d = new Date()): string {
  try {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
  } catch {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// ---------- Which clock drives the flight ----------



export interface LiveFlight extends FlightState {
  mode: 'realtime' | 'playback';
  /** In playback mode: what's being watched, and whether it's paused. */
  watching?: { title: string; paused: boolean; active: boolean };
}

/**
 * Real time: the flight departed at boarding and lasts a realistic time for the route.
 * Playback: the film's runtime is the flight time and its position moves the plane,
 * so the plane pauses and jumps exactly when the film does.
 */
export function liveFlight(now = Date.now()): LiveFlight {
  const plan = getFlightPlan();
  if (getMapMode() === 'realtime') return { ...flightState(plan, now), mode: 'realtime' };

  const w = getWatch();
  const base = flightState({ ...plan, departedAt: now }, now); // at the gate
  if (!w || !w.durationSec) return { ...base, speedKmh: 0, mode: 'playback' }; // at the gate
  const durationMs = w.durationSec * 1000;
  const elapsedMs = Math.min(Math.max(0, w.positionSec * 1000), durationMs);
  const remainingMs = durationMs - elapsedMs;
  const progress = elapsedMs / durationMs;
  const climb = Math.min(1, progress / 0.08), descend = Math.min(1, (1 - progress) / 0.1);
  const phase = Math.min(climb, descend);
  const arrived = remainingMs <= 500;
  return {
    ...base,
    mode: 'playback',
    durationMs, elapsedMs, remainingMs, progress, arrived,
    altitudeM: arrived ? 0 : Math.round((10_670 * phase) / 10) * 10,
    speedKmh: arrived ? 0 : Math.round(250 + 650 * phase),
    watching: { title: w.title, paused: w.paused, active: w.active },
  };
}
