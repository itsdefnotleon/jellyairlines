// The airline is named after the Jellyfin server: "<server name> Airlines".
// The name comes from the server at runtime, never from source code.

export const FALLBACK_SERVER_NAME = 'Jelly';

export function airlineName(serverName?: string | null): string {
  const base = (serverName ?? '').trim() || FALLBACK_SERVER_NAME;
  // Don't produce "Sky Airlines Airlines" if the server is already named that way.
  return /\bairlines?$/i.test(base) ? base : `${base} Airlines`;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Two-letter carrier code plus a stable flight number, e.g. "CN 482". */
export function flightNumber(serverName?: string | null): string {
  const base = (serverName ?? '').trim() || FALLBACK_SERVER_NAME;
  const words = base.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  let code = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? 'JA').slice(0, 2);
  code = code.toUpperCase().padEnd(2, 'A');
  const num = 100 + (hash(base) % 900);
  return `${code} ${num}`;
}

export { hash };
