// Minimal Jellyfin API client (checked against the Jellyfin 12.4 OpenAPI spec).
// The server address and token come from the signed-in session in localStorage,
// never from source code.

import { getSession, type Session } from './session';

const CLIENT = 'Inflight Entertainment';
const VERSION = '0.2.0';
const TIMEOUT_MS = 15_000;
export const TICKS_PER_SECOND = 10_000_000;

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
  UnplayedItemCount?: number;
}

export interface BaseItem {
  Id: string;
  Name: string;
  Type: string; // Movie, Series, Season, Episode, MusicAlbum, Audio, CollectionFolder…
  CollectionType?: string;
  ProductionYear?: number;
  PremiereDate?: string;
  RunTimeTicks?: number;
  OfficialRating?: string;
  CommunityRating?: number;
  Genres?: string[];
  Overview?: string;
  Taglines?: string[];
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  SeriesId?: string;
  SeriesName?: string;
  SeriesPrimaryImageTag?: string;
  SeasonId?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  AlbumId?: string;
  AlbumPrimaryImageTag?: string;
  AlbumArtist?: string;
  Artists?: string[];
  ChildCount?: number;
  PrimaryImageAspectRatio?: number;
  UserData?: UserData;
}

export interface ItemsResult {
  Items: BaseItem[];
  TotalRecordCount: number;
  StartIndex: number;
}

export interface PublicInfo {
  ServerName?: string;
  Version?: string;
  Id?: string;
  ProductName?: string;
}

export type ApiErrorKind = 'network' | 'mixed-content' | 'auth' | 'not-found' | 'server' | 'timeout' | 'bad-response';

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message: string, public status?: number) {
    super(message);
  }
}

/** Accepts "media.example.com", "http://1.2.3.4:8096/web/", etc. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `${location.protocol === 'https:' ? 'https' : 'http'}://${url}`;
  url = url.replace(/\/+$/, '').replace(/\/web(\/index\.html)?$/i, '').replace(/\/+$/, '');
  return url;
}

function deviceId(): string {
  let id = localStorage.getItem('ife.deviceId');
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('ife.deviceId', id);
  }
  return id;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `Seatback (${browser})`;
}

function authHeader(token?: string): string {
  const q = (s: string) => s.replace(/"/g, '');
  const parts = [
    `Client="${q(CLIENT)}"`,
    `Device="${q(deviceName())}"`,
    `DeviceId="${q(deviceId())}"`,
    `Version="${VERSION}"`,
  ];
  if (token) parts.push(`Token="${q(token)}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(base: string, path: string, query?: Query): string {
  const u = new URL(base + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/** Set by main.ts so any request can bounce an expired session back to the welcome screen. */
let onAuthLost: (() => void) | null = null;
export function setAuthLostHandler(fn: () => void): void { onAuthLost = fn; }

async function request<T>(
  base: string,
  path: string,
  opts: { method?: string; query?: Query; body?: unknown; token?: string; expectJson?: boolean } = {},
): Promise<T> {
  if (location.protocol === 'https:' && base.startsWith('http:')) {
    throw new ApiError('mixed-content',
      'This page is served over HTTPS, so the browser blocks a plain HTTP server. Use an https:// address for your server, or run this app locally.');
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(base, path, opts.query), {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: authHeader(opts.token),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new ApiError('timeout', 'The server took too long to answer. Check that it is running and reachable.');
    }
    throw new ApiError('network',
      "Couldn't reach the server. Check the address, that the server is running, and that it allows this site (CORS).");
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError('auth', res.status === 401 ? 'Not signed in, or your session has expired.' : "You don't have access to this.", res.status);
  }
  if (res.status === 404) throw new ApiError('not-found', 'Not found on the server.', 404);
  if (!res.ok) throw new ApiError('server', `The server returned an error (${res.status}).`, res.status);
  if (opts.expectJson === false || res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('bad-response', "The server's answer wasn't understood. Is this a Jellyfin server?");
  }
}

// ---------- Before sign-in ----------

export async function getPublicInfo(serverUrl: string): Promise<PublicInfo> {
  const info = await request<PublicInfo>(serverUrl, '/System/Info/Public');
  if (!info || (!info.ServerName && !info.Id)) {
    throw new ApiError('bad-response', "That address answered, but it doesn't look like a Jellyfin server.");
  }
  return info;
}

export async function authenticate(serverUrl: string, username: string, password: string) {
  try {
    return await request<{ AccessToken: string; ServerId: string; User: { Id: string; Name: string } }>(
      serverUrl, '/Users/AuthenticateByName', { method: 'POST', body: { Username: username, Pw: password } },
    );
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'auth') throw new ApiError('auth', 'Wrong username or password.', e.status);
    throw e;
  }
}

// ---------- Signed in ----------

function sess(): Session {
  const s = getSession();
  if (!s) throw new ApiError('auth', 'Not signed in.');
  return s;
}

async function authed<T>(path: string, opts: { method?: string; query?: Query; body?: unknown; expectJson?: boolean } = {}): Promise<T> {
  const s = sess();
  try {
    return await request<T>(s.serverUrl, path, { ...opts, token: s.accessToken });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) onAuthLost?.();
    throw e;
  }
}

const LIST_FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,Genres,ChildCount';

export async function logout(): Promise<void> {
  await authed('/Sessions/Logout', { method: 'POST', expectJson: false });
}

export function getViews(): Promise<ItemsResult> {
  return authed('/UserViews', { query: { userId: sess().userId } });
}

export function getLatest(limit = 16): Promise<BaseItem[]> {
  return authed('/Items/Latest', {
    query: { userId: sess().userId, limit, fields: LIST_FIELDS, enableImageTypes: 'Primary', imageTypeLimit: 1, groupItems: true },
  });
}

export interface ItemQuery {
  includeItemTypes?: string;
  parentId?: string;
  searchTerm?: string;
  sortBy?: string;
  sortOrder?: 'Ascending' | 'Descending';
  startIndex?: number;
  limit?: number;
  recursive?: boolean;
  fields?: string;
}

export function getItems(q: ItemQuery): Promise<ItemsResult> {
  return authed('/Items', {
    query: {
      userId: sess().userId,
      recursive: q.recursive ?? true,
      fields: q.fields ?? LIST_FIELDS,
      enableImageTypes: 'Primary',
      imageTypeLimit: 1,
      enableTotalRecordCount: true,
      ...q,
    },
  });
}

export async function countItems(includeItemTypes: string): Promise<number> {
  const r = await getItems({ includeItemTypes, limit: 0, fields: '' });
  return r.TotalRecordCount;
}

export async function getItem(id: string): Promise<BaseItem> {
  try {
    return await authed<BaseItem>(`/Items/${encodeURIComponent(id)}`, { query: { userId: sess().userId } });
  } catch (e) {
    // Jellyfin answers 400 for malformed ids and 404 for removed ones; both mean "not here".
    if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
      throw new ApiError('not-found', 'This title is no longer in the library, or the link is wrong.', e.status);
    }
    throw e;
  }
}

export function getSeasons(seriesId: string): Promise<ItemsResult> {
  return authed(`/Shows/${encodeURIComponent(seriesId)}/Seasons`, {
    query: { userId: sess().userId, enableImageTypes: 'Primary', enableUserData: true },
  });
}

export function getEpisodes(seriesId: string, seasonId: string): Promise<ItemsResult> {
  return authed(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, {
    query: { userId: sess().userId, seasonId, fields: 'Overview,PrimaryImageAspectRatio', enableImageTypes: 'Primary', enableUserData: true },
  });
}

export function getAlbumTracks(albumId: string): Promise<ItemsResult> {
  return getItems({ parentId: albumId, includeItemTypes: 'Audio', sortBy: 'ParentIndexNumber,IndexNumber,SortName', recursive: true, fields: 'RunTimeTicks' });
}

// ---------- Images (no auth header needed) ----------

export function imageUrl(itemId: string, type: 'Primary' | 'Backdrop' | 'Thumb', opts: { tag?: string; fillHeight?: number; fillWidth?: number; maxWidth?: number; quality?: number } = {}): string {
  const s = getSession();
  if (!s) return '';
  return buildUrl(s.serverUrl, `/Items/${encodeURIComponent(itemId)}/Images/${type}`, {
    tag: opts.tag,
    fillHeight: opts.fillHeight,
    fillWidth: opts.fillWidth,
    maxWidth: opts.maxWidth,
    quality: opts.quality ?? 90,
  });
}

/** Best poster for a card: episodes use their series poster so rails look consistent. */
export function posterUrl(item: BaseItem, fillHeight = 360): string {
  if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) {
    return imageUrl(item.SeriesId, 'Primary', { tag: item.SeriesPrimaryImageTag, fillHeight });
  }
  if (item.ImageTags?.Primary) return imageUrl(item.Id, 'Primary', { tag: item.ImageTags.Primary, fillHeight });
  if (item.Type === 'Audio' && item.AlbumId && item.AlbumPrimaryImageTag) {
    return imageUrl(item.AlbumId, 'Primary', { tag: item.AlbumPrimaryImageTag, fillHeight });
  }
  return '';
}

export function backdropUrl(item: BaseItem): string {
  if (item.BackdropImageTags?.length) return imageUrl(item.Id, 'Backdrop', { tag: item.BackdropImageTags[0], maxWidth: 1600, quality: 80 });
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
    return imageUrl(item.ParentBackdropItemId, 'Backdrop', { tag: item.ParentBackdropImageTags[0], maxWidth: 1600, quality: 80 });
  }
  return '';
}

export function ticksToMinutes(ticks?: number): number | undefined {
  return ticks ? Math.round(ticks / TICKS_PER_SECOND / 60) : undefined;
}

export function fmtTicks(ticks?: number): string {
  if (!ticks) return '';
  const total = Math.round(ticks / TICKS_PER_SECOND);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Playback ----------

export interface MediaStream {
  Index: number;
  Type: 'Video' | 'Audio' | 'Subtitle' | string;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  IsExternal?: boolean;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsTextSubtitleStream?: boolean;
  DeliveryMethod?: 'Encode' | 'Embed' | 'External' | 'Hls' | 'Drop';
  DeliveryUrl?: string;
}

export interface MediaSource {
  Id: string;
  Container?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: 'http' | 'hls';
  MediaStreams: MediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
  RunTimeTicks?: number;
}

export interface PlaybackInfo {
  MediaSources: MediaSource[];
  PlaySessionId?: string;
  ErrorCode?: 'NotAllowed' | 'NoCompatibleStream' | 'RateLimitExceeded';
}

export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

export function getPlaybackInfo(itemId: string, body: {
  DeviceProfile: unknown;
  MaxStreamingBitrate?: number;
  AudioStreamIndex?: number;
  SubtitleStreamIndex?: number;
  MediaSourceId?: string;
  EnableDirectPlay?: boolean;
  EnableDirectStream?: boolean;
  EnableTranscoding?: boolean;
  AlwaysBurnInSubtitleWhenTranscoding?: boolean;
}): Promise<PlaybackInfo> {
  return authed(`/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, {
    method: 'POST',
    body: { UserId: sess().userId, AutoOpenLiveStream: true, ...body },
  });
}

/** Media elements can't send headers, so stream URLs carry the token as ApiKey (checked against a live 12.4 server). */
export function withApiKey(pathOrUrl: string): string {
  const s = sess();
  const u = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : s.serverUrl + pathOrUrl);
  // Jellyfin 12.4 accepts ApiKey (the old api_key spelling is rejected with 401 on audio).
  u.searchParams.delete('api_key');
  if (!u.searchParams.has('ApiKey')) u.searchParams.set('ApiKey', s.accessToken);
  return u.toString();
}

export function directStreamUrl(itemId: string, mediaSourceId: string, playSessionId?: string): string {
  return withApiKey(buildUrl(sess().serverUrl, `/Videos/${encodeURIComponent(itemId)}/stream`, {
    static: true, mediaSourceId, playSessionId, deviceId: deviceId(),
  }));
}

export function subtitleUrl(itemId: string, mediaSourceId: string, index: number): string {
  return withApiKey(`/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Subtitles/${index}/0/Stream.vtt`);
}

export function universalAudioUrl(itemId: string, opts: { playSessionId: string; startTicks?: number }): string {
  const s = sess();
  return withApiKey(buildUrl(s.serverUrl, `/Audio/${encodeURIComponent(itemId)}/universal`, {
    userId: s.userId,
    deviceId: deviceId(),
    // Jellyfin reads this as a comma-separated list of container|codec pairs it may send untouched.
    container: 'opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webm|webm,wav,ogg',
    transcodingContainer: 'mp4',
    transcodingProtocol: 'http',
    audioCodec: 'aac',
    maxStreamingBitrate: 140_000_000,
    playSessionId: opts.playSessionId,
    startTimeTicks: opts.startTicks || undefined,
    enableRedirection: true,
    enableRemoteMedia: false,
  }));
}

export interface ReportBody {
  ItemId: string;
  MediaSourceId?: string;
  PlaySessionId?: string;
  PositionTicks: number;
  IsPaused?: boolean;
  IsMuted?: boolean;
  CanSeek?: boolean;
  PlayMethod?: PlayMethod;
  AudioStreamIndex?: number;
  SubtitleStreamIndex?: number;
  Failed?: boolean;
}

export function reportStart(b: ReportBody): Promise<void> {
  return authed('/Sessions/Playing', { method: 'POST', body: b, expectJson: false });
}
export function reportProgress(b: ReportBody): Promise<void> {
  return authed('/Sessions/Playing/Progress', { method: 'POST', body: b, expectJson: false });
}

/** Uses keepalive so the final position still reaches the server when the tab closes. */
export function reportStopped(b: ReportBody): void {
  const s = getSession();
  if (!s) return;
  fetch(`${s.serverUrl}/Sessions/Playing/Stopped`, {
    method: 'POST',
    keepalive: true,
    headers: { Authorization: authHeader(s.accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  }).catch(() => {});
}

/** Tells the server to stop a transcode we no longer need. */
export function stopEncoding(playSessionId?: string): void {
  const s = getSession();
  if (!s || !playSessionId) return;
  fetch(buildUrl(s.serverUrl, '/Videos/ActiveEncodings', { deviceId: deviceId(), playSessionId }), {
    method: 'DELETE', keepalive: true, headers: { Authorization: authHeader(s.accessToken) },
  }).catch(() => {});
}

export async function getNextUp(seriesId: string): Promise<BaseItem | undefined> {
  const r = await authed<ItemsResult>('/Shows/NextUp', { query: { userId: sess().userId, seriesId, limit: 1, enableResumable: true } });
  return r.Items[0];
}
