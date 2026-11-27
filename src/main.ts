import './styles.css';
import { ApiError, logout, setAuthLostHandler } from './api';
import { toast } from './ui';
import { currentPath, navigate, resolve, route } from './router';
import { clearSession, getSession } from './session';
import { shellHtml, startClocks } from './shell';
import { installSpatialNav } from './spatial-nav';
import { welcomeView } from './views/welcome';
import { homeView } from './views/home';
import { browseView } from './views/browse';
import { itemView } from './views/item';
import { mapView } from './views/map';
import { playerView } from './views/player';
import { audioPlayer } from './audio';

route('/welcome', welcomeView);
route('/home', homeView);
route('/browse/:kind', browseView);
route('/item/:id', itemView);
route('/map', mapView);
route('/play/:id/:start', playerView);

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;
let shellMounted = false;

function render(): void {
  try {
    renderRoute();
  } catch (e) {
    // Never leave a blank screen: show a recoverable error instead.
    console.error(e);
    if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
    cleanup = undefined;
    shellMounted = false;
    app.innerHTML = `<div class="bare fatal"><div class="error-panel" role="alert">
      <div class="error-icon">!</div>
      <div class="error-body"><h2>Cabin systems need a restart</h2><p>Something unexpected went wrong on this screen.</p></div>
      <button class="btn btn-primary" type="button" onclick="location.hash='#/home';location.reload()">Back to home</button>
    </div></div>`;
  }
}

function renderRoute(): void {
  const path = currentPath();
  const signedIn = !!getSession();
  if (!signedIn && path !== '/welcome') return navigate('/welcome');
  if (signedIn && (path === '/' || path === '/welcome')) return navigate('/home');

  const match = resolve(path) ?? resolve('/home')!;
  const result = match.view(match.params);

  if (typeof cleanup === 'function') cleanup();

  let root: HTMLElement;
  if (result.bare) {
    app.innerHTML = `<div class="bare">${result.html}</div>`;
    shellMounted = false;
    root = app.firstElementChild as HTMLElement;
  } else {
    if (!shellMounted) {
      app.innerHTML = shellHtml();
      shellMounted = true;
      startClocks();
      audioPlayer.render();
    }
    root = document.getElementById('view')!;
    root.innerHTML = result.html;
    root.scrollTop = 0;
  }
  cleanup = result.mount?.(root);

  // Move focus into the new screen for keyboard and screen-reader users.
  const first = root.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
  (first ?? root).focus({ preventScroll: true });
}

app.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'back') {
    if (history.length > 1) history.back();
    else navigate('/home');
  } else if (action === 'signout') {
    // logout() reads the token before clearSession() runs; the token is dropped locally either way.
    audioPlayer.stop();
    logout().catch(() => {});
    clearSession();
    shellMounted = false;
    navigate('/welcome');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Backspace') {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement) return;
    if (currentPath() !== '/home' && getSession()) { e.preventDefault(); history.back(); }
  }
});

// An expired or revoked token sends the passenger back to the welcome screen with a note.
setAuthLostHandler(() => {
  if (!getSession()) return;
  audioPlayer.stop();
  clearSession();
  sessionStorage.setItem('ife.expired', '1');
  shellMounted = false;
  navigate('/welcome');
});

// Hide broken artwork so the generated fallback shows through.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t instanceof HTMLImageElement) t.remove();
}, true);

// Unexpected errors elsewhere get a short message rather than failing silently.
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(e.reason instanceof ApiError ? e.reason.message : 'Something went wrong. Please try again.');
});

// Tell passengers when the connection drops, and when it's back.
const offline = document.createElement('div');
offline.className = 'offline-banner';
offline.setAttribute('role', 'status');
offline.textContent = "You're offline. Films and music will resume when the connection returns.";
offline.hidden = navigator.onLine;
document.body.append(offline);
window.addEventListener('offline', () => { offline.hidden = false; });
window.addEventListener('online', () => { offline.hidden = true; toast('Back online.'); });

window.addEventListener('hashchange', render);
installSpatialNav();
render();
