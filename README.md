# Inflight Entertainment for Jellyfin

A web client for [Jellyfin](https://jellyfin.org) that looks and feels like an airplane seatback screen. Jellyfin does the real work: libraries, metadata, users and transcoding. This app is only the screen in front of your seat.

The airline is named after your server. A server called "Cloud Nine" becomes **Cloud Nine Airlines**.

## Features

- **Boarding:** sign in to your Jellyfin server and choose a route from 46 airports. The boarding pass shows the distance and a realistic flight time.
- **Home:** big tiles for Movies, TV, Music and the Flight Map, plus a Recently added row.
- **Browse:** poster grids that load more as you scroll, server-side search, and sorting (A–Z, recently added, release year).
- **Detail pages:** backdrops, ratings and resume points. Shows have season tabs and episode lists; albums have track lists.
- **Video:** resume where you left off, subtitles, audio track choice, and an "Up next" countdown between episodes. Your position is reported back to Jellyfin. Files the browser can't play are converted by the server and streamed with HLS.
- **Music:** keeps playing while you browse, with controls in the bottom bar and your keyboard's media keys.
- **Flight map:** OpenStreetMap with a great-circle route, a moving plane and a countdown to landing. It has two modes:
  - **Real time** (default): the flight departs when you board and lands after the route's flight time.
  - **Follow my film:** the film's length is the flight time, and the plane pauses and seeks with the video.

  The player also has a mini map.
- **Controls:** made for landscape touchscreens, and it also works with a mouse or the keyboard. Arrow keys move between controls like a seatback remote, and Escape goes back. In the player: Space or K, the arrow keys, F, and Escape.

## Requirements

- [Node.js](https://nodejs.org) 20 or newer (tested with 22), which includes npm
- A Jellyfin server (developed against 12.4) and an account on it

## Run it locally

```sh
npm install
npm run dev
```

Open http://localhost:5173. Enter your server address, such as `http://192.168.1.20:8096` or `https://media.example.com`, along with your username and password. Then pick a route and press **Board**.

You don't need to set any server address or credentials in the code or in config files. The address and a sign-in token are stored only in your browser's local storage, and your password is never stored. **Disembark** signs you out.

## Build

```sh
npm run build      # type-checks, then writes static files to dist/
npm run preview    # serves dist/ at http://localhost:4173 to try the build
```

`dist/` is plain static files. The app uses relative paths and `#/` routes, so you can host it from any folder on any static web server.

## Publish on GitHub Pages

1. Push this project to a GitHub repository with `main` as the default branch.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the app and publishes it to `https://<user>.github.io/<repo>/`.

### Your server must use HTTPS

GitHub Pages is served over HTTPS, and browsers block HTTPS pages from talking to plain HTTP servers. So the hosted app can only reach a Jellyfin server with an `https://` address. The app explains this if you try an `http://` address.

Ways to get one:

- **Reverse proxy:** put Caddy, nginx or Traefik with a certificate in front of Jellyfin.
- **Tailscale:** use `tailscale serve`, or Tailscale Funnel to reach it from outside your network.
- **Cloudflare Tunnel.**
- **Skip GitHub Pages:** run the app locally (`npm run dev` or `npm run preview`), or host `dist/` over plain HTTP on your own network. Then `http://` server addresses work.

### CORS

The browser calls Jellyfin directly from the app's address, so Jellyfin must allow cross-origin requests. A default Jellyfin install does, and the app was tested that way. If you get "Couldn't reach the server" even though the address is right, check that your reverse proxy isn't removing Jellyfin's CORS headers.

## Map tiles

The flight map uses OpenStreetMap's public tiles. That's fine for personal use under the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/), which requires the attribution shown on the map. For anything heavier, change `TILE_URL` in `src/flightmap.ts` to your own tile server or a provider you have an account with. If the tiles can't load, the route and countdown still work.

## Project layout

```
src/
  main.ts          app start-up, routing, sign-out, error and offline handling
  api.ts           Jellyfin API client (sign-in, browsing, playback, progress reporting)
  session.ts       what's stored in the browser
  profile.ts       tells Jellyfin which formats this browser can play
  audio.ts         music player that survives navigation
  watch.ts         shares playback position with the flight map
  flight.ts        route maths, flight time and countdown
  flightmap.ts     Leaflet map (loaded only when needed)
  airports.ts      airport list (add your own here)
  brand.ts         "<server name> Airlines" and the flight number
  shell.ts         top bar and bottom bar
  spatial-nav.ts   arrow-key navigation
  views/           welcome, home, browse, item, player and map screens
  styles.css       the whole look, plain CSS
```

Dependencies: [Leaflet](https://leafletjs.com) draws the map and [hls.js](https://github.com/video-dev/hls.js) plays server-converted video in browsers without built-in HLS. Both load only when needed. Vite and TypeScript are used for building only.

## Known limits and untested parts

Tested on Jellyfin 12.4 in a Chromium browser: sign-in, browsing, search, movie playback with resume, subtitles, seeking, progress reporting, music, the flight map in both modes, and the error and session-expiry screens.

Not tested yet:

- Episode playback and the "Up next" countdown
- Switching between several audio tracks
- Picture-based subtitles (PGS or DVD), which the server burns into the video
- Direct play of files the browser supports natively (everything tested was converted by the server)
- Safari, iOS and Firefox
- TVs and tablets

Other limits:

- Stream URLs carry your sign-in token as an `ApiKey` parameter, because browser video elements can't send headers. Anyone who can see those URLs, such as in proxy logs, could use the token until you sign out.
- Seeking past about 90% of a film tells Jellyfin you watched it, just like the official apps.
