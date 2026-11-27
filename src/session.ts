// Session lives in the browser only (localStorage). No server addresses or
// credentials are ever stored in source code. The password is never stored.

export interface Session {
  serverUrl: string;
  serverName: string;
  serverId: string;
  userId: string;
  userName: string;
  accessToken: string;
  /** Route chosen at boarding; the flight departs when you sign in. */
  flight?: { from: string; to: string; departedAt: number };
}

const KEY = 'ife.session';

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    // Ignore sessions from the mock-data build, which had no token.
    return s && s.accessToken && s.userId && s.serverUrl ? s : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

/** Remembered between visits so returning passengers only re-enter their password. */
export function lastLogin(): { serverUrl: string; userName: string } {
  try {
    return JSON.parse(localStorage.getItem('ife.lastLogin') ?? '') ?? { serverUrl: '', userName: '' };
  } catch {
    return { serverUrl: '', userName: '' };
  }
}

export function rememberLogin(serverUrl: string, userName: string): void {
  localStorage.setItem('ife.lastLogin', JSON.stringify({ serverUrl, userName }));
}
