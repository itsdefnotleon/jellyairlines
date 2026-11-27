import type { View } from '../router';
import { navigate } from '../router';
import { airlineName, flightNumber } from '../brand';
import { AIRPORTS, DEFAULT_FROM, DEFAULT_TO, airport } from '../airports';
import { ApiError, authenticate, getPublicInfo, normalizeServerUrl } from '../api';
import { distanceKm, flightDurationMs, fmtDuration } from '../flight';
import { lastLogin, rememberLogin, setSession } from '../session';
import { esc, icon, logoMark } from '../ui';

const LAST_ROUTE_KEY = 'ife.lastRoute';

function airportOptions(selected: string): string {
  return AIRPORTS.map(
    (a) => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${a.code} · ${esc(a.city)}</option>`,
  ).join('');
}

function lastRoute(): { from: string; to: string } {
  try {
    const r = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) ?? 'null');
    if (r && airport(r.from) && airport(r.to) && r.from !== r.to) return r;
  } catch { /* ignore */ }
  return { from: DEFAULT_FROM, to: DEFAULT_TO };
}

export const welcomeView: View = () => {
  const route = lastRoute();
  const last = lastLogin();
  const expired = sessionStorage.getItem('ife.expired') === '1';
  sessionStorage.removeItem('ife.expired');

  return {
    bare: true,
    html: `
    <section class="welcome">
      <div class="welcome-sky" aria-hidden="true">
        <div class="horizon"></div>
        <div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
      </div>

      <div class="welcome-left">
        <div class="welcome-brand">${logoMark()}<p class="eyebrow">Welcome aboard</p></div>
        <h1 class="welcome-title" data-airline-title>${esc(airlineName(null))}</h1>
        <div class="boarding">
          <div><span>Flight</span><b data-flightno>${esc(flightNumber(null))}</b></div>
          <div><span>From</span><b data-from-code></b><small data-from-city></small></div>
          <div><span>To</span><b data-to-code></b><small data-to-city></small></div>
          <div><span>Flight time</span><b data-duration></b><small data-distance></small></div>
          <div><span>Seat</span><b>23A</b></div>
        </div>
      </div>

      <form class="welcome-panel" novalidate>
        <h2>Connect your seat</h2>
        <label class="field">
          <span>Server address</span>
          <input name="server" type="url" inputmode="url" autocomplete="url" placeholder="https://media.example.com" required value="${esc(last.serverUrl)}" ${last.serverUrl ? '' : 'data-autofocus'} />
        </label>
        <p class="server-status" data-status aria-live="polite"></p>
        <div class="field-row">
          <label class="field">
            <span>Username</span>
            <input name="user" autocomplete="username" required value="${esc(last.userName)}" />
          </label>
          <label class="field">
            <span>Password</span>
            <input name="pass" type="password" autocomplete="current-password" ${last.serverUrl && last.userName ? 'data-autofocus' : ''} />
          </label>
        </div>
        <fieldset class="route-pick">
          <legend>Choose your flight</legend>
          <div class="field-row">
            <label class="field"><span>From</span><select name="from">${airportOptions(route.from)}</select></label>
            <button class="icon-btn swap" type="button" data-swap aria-label="Swap departure and destination">${icon.swap}</button>
            <label class="field"><span>To</span><select name="to">${airportOptions(route.to)}</select></label>
          </div>
        </fieldset>
        <p class="form-error" role="alert" ${expired ? '' : 'hidden'}>${expired ? 'Your session ended. Please sign in again.' : ''}</p>
        <button class="btn btn-primary btn-xl" type="submit">${icon.plane}<span>Board</span></button>
      </form>
    </section>`,
    mount(root) {
      const form = root.querySelector('form')!;
      const server = form.elements.namedItem('server') as HTMLInputElement;
      const user = form.elements.namedItem('user') as HTMLInputElement;
      const pass = form.elements.namedItem('pass') as HTMLInputElement;
      const from = form.elements.namedItem('from') as HTMLSelectElement;
      const to = form.elements.namedItem('to') as HTMLSelectElement;
      const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      const err = form.querySelector<HTMLElement>('.form-error')!;
      const status = form.querySelector<HTMLElement>('[data-status]')!;
      const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
      let serverName: string | null = null;
      let checkedUrl = '';
      let checking: Promise<boolean> | null = null;

      const setName = (name: string | null) => {
        serverName = name;
        $('[data-airline-title]').textContent = airlineName(name);
        $('[data-flightno]').textContent = flightNumber(name);
      };

      const updateRoute = () => {
        const a = airport(from.value)!, b = airport(to.value)!;
        $('[data-from-code]').textContent = a.code;
        $('[data-from-city]').textContent = a.city;
        $('[data-to-code]').textContent = b.code;
        $('[data-to-city]').textContent = b.city;
        const same = a.code === b.code;
        $('[data-duration]').textContent = same ? '—' : fmtDuration(flightDurationMs(a, b));
        $('[data-distance]').textContent = same ? 'Pick two airports' : `${Math.round(distanceKm(a, b)).toLocaleString()} km`;
        if (!same && err.dataset.kind === 'route') err.hidden = true;
      };

      // Look up the server's public name as soon as an address is entered.
      const checkServer = (): Promise<boolean> => {
        const url = normalizeServerUrl(server.value);
        if (!url) {
          setName(null);
          status.textContent = '';
          status.className = 'server-status';
          checkedUrl = '';
          return Promise.resolve(false);
        }
        if (url === checkedUrl) return Promise.resolve(true);
        status.textContent = 'Contacting server…';
        status.className = 'server-status';
        const p = getPublicInfo(url).then(
          (info) => {
            if (normalizeServerUrl(server.value) !== url) return false;
            checkedUrl = url;
            setName(info.ServerName ?? null);
            status.textContent = `Connected to ${info.ServerName ?? 'Jellyfin'}${info.Version ? ` · Jellyfin ${info.Version}` : ''}`;
            status.className = 'server-status ok';
            return true;
          },
          (e) => {
            if (normalizeServerUrl(server.value) !== url) return false;
            checkedUrl = '';
            setName(null);
            status.textContent = e instanceof ApiError ? e.message : "Couldn't reach the server.";
            status.className = 'server-status bad';
            return false;
          },
        );
        checking = p;
        return p;
      };

      server.addEventListener('change', checkServer);
      if (server.value) checkServer();
      from.addEventListener('change', updateRoute);
      to.addEventListener('change', updateRoute);
      root.querySelector('[data-swap]')!.addEventListener('click', () => {
        [from.value, to.value] = [to.value, from.value];
        updateRoute();
      });
      updateRoute();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        if (!server.value.trim()) return showError('Enter your server address.', server);
        if (!user.value.trim()) return showError('Enter your username.', user);
        if (from.value === to.value) return showError('Departure and destination must be different airports.', to, 'route');

        setBusy(true);
        try {
          const url = normalizeServerUrl(server.value);
          if (checking) await checking;
          if (checkedUrl !== url && !(await checkServer())) {
            return showError(status.textContent || "Couldn't reach the server.", server);
          }
          const auth = await authenticate(url, user.value.trim(), pass.value);
          localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ from: from.value, to: to.value }));
          rememberLogin(url, user.value.trim());
          setSession({
            serverUrl: url,
            serverName: serverName ?? '',
            serverId: auth.ServerId,
            userId: auth.User.Id,
            userName: auth.User.Name,
            accessToken: auth.AccessToken,
            flight: { from: from.value, to: to.value, departedAt: Date.now() },
          });
          pass.value = '';
          navigate('/home');
        } catch (e2) {
          const msg = e2 instanceof ApiError ? e2.message : 'Sign-in failed. Please try again.';
          showError(msg, e2 instanceof ApiError && e2.kind === 'auth' ? pass : server);
        } finally {
          setBusy(false);
        }
      });

      function setBusy(busy: boolean) {
        submit.disabled = busy;
        submit.querySelector('span')!.textContent = busy ? 'Boarding…' : 'Board';
      }

      function showError(msg: string, field: HTMLElement, kind = '') {
        err.textContent = msg;
        err.dataset.kind = kind;
        err.hidden = false;
        field.focus();
      }
    },
  };
};
