const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative user-library-read';
const REDIRECT_URI = window.location.origin + window.location.pathname;
 
// TODO: Replace with D1 database query later
// Magic link: aa361e4ccd39469a8e01aa69e8117c22
const HARDCODED_CLIENT_ID = 'aa361e4ccd39469a8e01aa69e8117c22';
 
// Whitelist: Only playlists starting with "kid-spot" are allowed
const CURATED_PLAYLISTS_PATTERN = /^kid-spot/i;  // Case-insensitive, starts with "kid-spot"
 
const debug = new URLSearchParams(window.location.search).has('debug');
const logEl = document.getElementById('log');
if (debug) logEl.style.display = 'block';
function log(...a) {
  console.log(...a);
  if (debug) logEl.textContent += a.join(' ') + '\n';
}
 
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(str) {
  return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}
function randStr(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len))).map(b => chars[b % chars.length]).join('');
}
 
async function startLogin() {
  // Use hardcoded Client ID
  const clientId = HARDCODED_CLIENT_ID;
  localStorage.setItem('client_id', clientId);
  const verifier = randStr(64);
  localStorage.setItem('verifier', verifier);
  const challenge = b64url(await sha256(verifier));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES
  });
  window.location = 'https://accounts.spotify.com/authorize?' + params.toString();
}
 
async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: localStorage.getItem('client_id'),
    code_verifier: localStorage.getItem('verifier')
  });
  const data = await tokenRequest(body);
  if (!data) return;
  window.history.replaceState({}, '', REDIRECT_URI);
  boot();
}
 
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: localStorage.getItem('client_id')
  });
  const data = await tokenRequest(body);
  return !!data;
}
 
async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  if (!data.access_token) {
    log('token request failed', JSON.stringify(data));
    return null;
  }
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('expires_at', Date.now() + (data.expires_in * 1000));
  if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
  return data;
}
 
async function getValidToken() {
  const expiresAt = Number(localStorage.getItem('expires_at') || 0);
  if (Date.now() > expiresAt - 60000) {
    const ok = await refreshAccessToken();
    if (!ok) return null;
  }
  return localStorage.getItem('access_token');
}
 
function showScreen(id) {
  ['setup', 'grid-screen', 'playlist-screen', 'player-screen'].forEach(s => {
    document.getElementById(s).style.display = s === id ? (id === 'player-screen' ? 'flex' : 'block') : 'none';
  });
}
 
let player, deviceId;
let mockMode = false;
let mockAudio;
let localQueue = [];
let localIndex = 0;
let currentContextUri = null;
let currentPlaylistName = null;
let lastState = null;
let tickIntervalId = null;
let seeking = false;
let pendingSlideIn = false;
let pendingSlideInTimeout = null;
let previousScreenBeforePlayer = 'grid-screen';
let currentPlaylistDetail = null; // { tracks, contextUri, name, isRemote }
const SLEEP_OPTIONS_MIN = [0, 15, 30, 45, 60];
let sleepIndex = 0;
let sleepTimeoutId = null;
let sleepEndsAt = null;
 
function formatTime(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
 
function startTicker() {
  if (tickIntervalId) return;
  tickIntervalId = setInterval(tick, 1000);
  tick();
}
function stopTicker() {
  clearInterval(tickIntervalId);
  tickIntervalId = null;
}
 
function tick() {
  updateProgressDisplay();
  updateTimerLabel();
}
 
function updateProgressDisplay() {
  let posMs, durationMs;
  if (mockMode) {
    if (!mockAudio) return;
    posMs = mockAudio.currentTime * 1000;
    durationMs = (mockAudio.duration || 30) * 1000;
  } else {
    if (!lastState) return;
    posMs = lastState.paused ? lastState.position : lastState.position + (Date.now() - lastState.timestamp);
    durationMs = lastState.duration;
  }
  const seekBar = document.getElementById('seekBar');
  if (!seeking) {
    seekBar.max = durationMs;
    seekBar.value = Math.min(posMs, durationMs);
    document.getElementById('elapsedTime').textContent = formatTime(posMs);
  }
  document.getElementById('durationTime').textContent = formatTime(durationMs);
}
 
function updateTimerLabel() {
  const btn = document.getElementById('timerBtn');
  if (sleepEndsAt) {
    btn.textContent = 'Timer: ' + formatTime(sleepEndsAt - Date.now());
  } else {
    btn.textContent = 'Timer: Off';
  }
}
 
const DEMO_PLAYLISTS = [
  { name: 'Morning Chill', cover: 'cover1.svg', tracks: [
    { name: 'Sunrise Keys', artist: 'Demo Sessions', file: 'track1.mp3', cover: 'cover1.svg' },
    { name: 'Soft Wake', artist: 'Demo Sessions', file: 'track3.mp3', cover: 'cover1.svg' }
  ]},
  { name: 'Focus Beats', cover: 'cover2.svg', tracks: [
    { name: 'Flow State', artist: 'Demo Sessions', file: 'track2.mp3', cover: 'cover2.svg' },
    { name: 'Deep Work', artist: 'Demo Sessions', file: 'track4.mp3', cover: 'cover2.svg' }
  ]},
  { name: 'Wind Down', cover: 'cover3.svg', tracks: [
    { name: 'Evening Fade', artist: 'Demo Sessions', file: 'track3.mp3', cover: 'cover3.svg' }
  ]},
  { name: 'Deep Work', cover: 'cover4.svg', tracks: [
    { name: 'Fifth Interval', artist: 'Demo Sessions', file: 'track4.mp3', cover: 'cover4.svg' },
    { name: 'Sunrise Keys', artist: 'Demo Sessions', file: 'track1.mp3', cover: 'cover4.svg' }
  ]}
];
 
function renderDemoGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  document.getElementById('resumeBanner').style.display = 'none';
  DEMO_PLAYLISTS.forEach(pl => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    const img = document.createElement('img');
    img.src = pl.cover;
    const label = document.createElement('span');
    label.textContent = pl.name;
    tile.append(img, label);
    tile.addEventListener('click', () => openDemoPlaylistDetail(pl));
    grid.appendChild(tile);
  });
  showScreen('grid-screen');
}
 
function openDemoPlaylistDetail(pl) {
  currentPlaylistDetail = { tracks: pl.tracks, isRemote: false, cover: pl.cover, name: pl.name };
  document.getElementById('plName').textContent = pl.name;
  document.getElementById('plCover').src = pl.cover;
  const list = document.getElementById('plTrackList');
  list.innerHTML = '';
  pl.tracks.forEach((track, idx) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    const index = document.createElement('div');
    index.className = 'track-index';
    index.textContent = idx + 1;
    const info = document.createElement('div');
    info.className = 'track-info';
    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = track.name;
    const artist = document.createElement('div');
    artist.className = 'track-artist';
    artist.textContent = track.artist;
    info.append(name, artist);
    row.append(index, info);
    row.addEventListener('click', () => {
      previousScreenBeforePlayer = 'playlist-screen';
      playLocalQueue(pl.tracks, idx);
    });
    list.appendChild(row);
  });
  showScreen('playlist-screen');
}
 
function initMock() {
  mockMode = true;
  playLocalQueue([{ name: 'Test tone (440Hz)', artist: 'no Spotify — background/lock test', file: 'dummy.mp3' }], 0);
}
 
function playLocalQueue(queue, startIndex) {
  mockMode = true;
  localQueue = queue;
  localIndex = startIndex;
  if (!mockAudio) {
    mockAudio = new Audio();
    mockAudio.addEventListener('play', updateMockUI);
    mockAudio.addEventListener('pause', updateMockUI);
    mockAudio.addEventListener('ended', () => nextLocalTrack());
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { mockAudio.play(); });
      navigator.mediaSession.setActionHandler('pause', () => { mockAudio.pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => nextLocalTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevLocalTrack());
    }
  }
  loadLocalTrack();
  showScreen('player-screen');
}
 
function loadLocalTrack() {
  const track = localQueue[localIndex];
  mockAudio.loop = localQueue.length === 1;
  mockAudio.src = track.file;
  mockAudio.play().then(() => log('local: play() resolved')).catch(e => log('local: play() rejected', e.message));
 
  const artUrl = track.cover || '';
  if (artUrl) document.getElementById('nowArt').src = artUrl;
  else document.getElementById('nowArt').removeAttribute('src');
  document.getElementById('nowTitle').textContent = track.name;
  document.getElementById('nowArtist').textContent = track.artist;
  setAdaptiveBg(artUrl);
 
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artist,
      album: 'Focus Player',
      artwork: artUrl ? [{ src: artUrl, sizes: '256x256', type: 'image/jpeg' }] : []
    });
  }
  startTicker();
}
 
function nextLocalTrack() {
  localIndex = (localIndex + 1) % localQueue.length;
  loadLocalTrack();
}
function prevLocalTrack() {
  localIndex = (localIndex - 1 + localQueue.length) % localQueue.length;
  loadLocalTrack();
}
 
function setPlayPauseIcon(isPaused) {
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  if (!playIcon || !pauseIcon) return;
  playIcon.style.display = isPaused ? '' : 'none';
  pauseIcon.style.display = isPaused ? 'none' : '';
}
 
function updateMockUI() {
  setPlayPauseIcon(mockAudio.paused);
}
 
function initPlayer() {
  const sdkScript = document.createElement('script');
  sdkScript.src = 'https://sdk.scdn.co/spotify-player.js';
  document.body.appendChild(sdkScript);
 
  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
      name: 'Focus Player',
      getOAuthToken: async cb => cb(await getValidToken()),
      volume: 0.8
    });
 
    player.addListener('ready', ({ device_id }) => {
      deviceId = device_id;
      log('device ready', device_id);
      loadPlaylists();
    });
    player.addListener('not_ready', () => log('device offline'));
    player.addListener('initialization_error', ({ message }) => log('init_error', message));
    player.addListener('authentication_error', ({ message }) => log('auth_error', message));
    player.addListener('account_error', ({ message }) => log('account_error (need Premium)', message));
    player.addListener('playback_error', ({ message }) => log('playback_error', message));
    player.addListener('player_state_changed', updateNowPlaying);
 
    player.connect();
  };
}
 
function updateNowPlaying(state) {
  if (!state) return;
  const track = state.track_window.current_track;
  const artUrl = track.album.images[0]?.url || '';
  document.getElementById('nowArt').src = artUrl;
  document.getElementById('nowTitle').textContent = track.name;
  document.getElementById('nowArtist').textContent = track.artists.map(a => a.name).join(', ');
  setPlayPauseIcon(state.paused);
  document.getElementById('shuffleBtn').classList.toggle('active', !!state.shuffle);
  setAdaptiveBg(artUrl);
 
  if (pendingSlideIn) {
    pendingSlideIn = false;
    clearTimeout(pendingSlideInTimeout);
    slideArtIn();
  }
 
  lastState = { position: state.position, duration: state.duration, paused: state.paused, timestamp: Date.now() };
  if (currentContextUri) {
    localStorage.setItem('lastPlayback', JSON.stringify({
      contextUri: currentContextUri, name: currentPlaylistName, positionMs: state.position
    }));
  }
  startTicker();
}
 
function setAdaptiveBg(imgUrl) {
  if (!imgUrl) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 16; canvas.height = 16;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const blend = (c, t, amt) => Math.round(c * (1 - amt) + t * amt);
      const [cr, cg, cb] = [250, 243, 234];
      const bg = `rgb(${blend(r, cr, 0.55)},${blend(g, cg, 0.55)},${blend(b, cb, 0.55)})`;
      document.documentElement.style.setProperty('--player-bg', bg);
    } catch (e) {
      log('adaptive bg skipped (canvas tainted):', e.message);
    }
  };
  img.src = imgUrl;
}
 
async function loadPlaylists() {
  const token = await getValidToken();
  const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  (data.items || []).forEach(pl => {
    // Filter: Only show playlists matching the whitelist pattern
    if (!CURATED_PLAYLISTS_PATTERN.test(pl.name)) return;
 
    const tile = document.createElement('div');
    tile.className = 'tile';
    const img = document.createElement('img');
    img.src = (pl.images && pl.images[0]?.url) || '';
    const label = document.createElement('span');
    label.textContent = pl.name;
    tile.append(img, label);
    tile.addEventListener('click', () => openSpotifyPlaylistDetail(pl));
    grid.appendChild(tile);
  });
  renderResumeBanner();
  showScreen('grid-screen');
}
 
async function openSpotifyPlaylistDetail(pl) {
  const coverUrl = (pl.images && pl.images[0]?.url) || '';
  document.getElementById('plName').textContent = pl.name;
  document.getElementById('plCover').src = coverUrl;
  const list = document.getElementById('plTrackList');
  list.innerHTML = '<div class="track-row"><div class="track-info"><div class="track-name">Loading…</div></div></div>';
  showScreen('playlist-screen');
 
  const playlistId = pl.uri.split(':')[2];
  const token = await getValidToken();
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const tracks = (data.items || []).map(item => item.track).filter(Boolean);
  currentPlaylistDetail = { tracks, isRemote: true, contextUri: pl.uri, name: pl.name };
 
  list.innerHTML = '';
  tracks.forEach((track, idx) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    const index = document.createElement('div');
    index.className = 'track-index';
    index.textContent = idx + 1;
    const info = document.createElement('div');
    info.className = 'track-info';
    const name = document.createElement('div');
    name.className = 'track-name';
    name.textContent = track.name;
    const artist = document.createElement('div');
    artist.className = 'track-artist';
    artist.textContent = (track.artists || []).map(a => a.name).join(', ');
    info.append(name, artist);
    row.append(index, info);
    row.addEventListener('click', () => {
      previousScreenBeforePlayer = 'playlist-screen';
      playPlaylist(pl.uri, pl.name, 0, track.uri);
    });
    list.appendChild(row);
  });
}
 
function renderResumeBanner() {
  const banner = document.getElementById('resumeBanner');
  const saved = JSON.parse(localStorage.getItem('lastPlayback') || 'null');
  if (!saved || !saved.contextUri) {
    banner.style.display = 'none';
    return;
  }
  banner.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Resume: ' + saved.name;
  const sub = document.createElement('span');
  sub.textContent = 'from ' + formatTime(saved.positionMs);
  banner.append(title, sub);
  banner.style.display = 'block';
  banner.onclick = () => {
    previousScreenBeforePlayer = 'grid-screen';
    playPlaylist(saved.contextUri, saved.name, saved.positionMs);
  };
}
 
async function playPlaylist(contextUri, name, positionMs = 0, trackUri = null) {
  currentContextUri = contextUri;
  currentPlaylistName = name;
  await player.activateElement();
  const token = await getValidToken();
  const body = { context_uri: contextUri };
  if (trackUri) body.offset = { uri: trackUri };
  if (positionMs > 0) body.position_ms = positionMs;
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status !== 204) log('play failed', res.status, await res.text());
  showScreen('player-screen');
  startTicker();
}
 
function dismissPlayerScreen() {
  stopTicker();
  if (mockMode && !demoGridMode) {
    // "Test tone only" flow has no grid/playlist context to return to.
    showScreen('setup');
    return;
  }
  showScreen(previousScreenBeforePlayer);
  if (previousScreenBeforePlayer === 'grid-screen' && !mockMode) {
    renderResumeBanner();
  }
}
 
function goNext() { mockMode ? nextLocalTrack() : player.nextTrack(); }
function goPrev() { mockMode ? prevLocalTrack() : player.previousTrack(); }
 
// ---- Spotify-style swipe gestures (single recognizer, axis-locked) ----
function setupSwipeGestures() {
  const playerScreen = document.getElementById('player-screen');
  const artFrame = document.querySelector('.art-frame');
  if (!playerScreen || !artFrame) return;
 
  const AXIS_LOCK_PX = 10;      // movement needed before committing to an axis
  const DISMISS_PX = 110;       // downward px to trigger dismiss
  const DISMISS_VELOCITY = 0.5; // px/ms fast-flick dismiss
  const SKIP_PX = 70;           // horizontal px to trigger next/prev
 
  function isInteractive(el) {
    return !!(el.closest && el.closest('button, input'));
  }
 
  let dragging = false;
  let axis = null; // 'v' | 'h' | null (undecided until AXIS_LOCK_PX of movement)
  let startX = 0, startY = 0, startTime = 0;
 
  playerScreen.addEventListener('pointerdown', (e) => {
    if (isInteractive(e.target)) return;
    dragging = true;
    axis = null;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    playerScreen.style.transition = 'none';
    artFrame.style.transition = 'none';
  });
 
  playerScreen.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
 
    if (!axis) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx) && dy > 0) axis = 'v';
      else if (Math.abs(dx) > Math.abs(dy)) axis = 'h';
      else { dragging = false; return; } // e.g. upward-only movement: ignore
    }
 
    if (axis === 'v' && dy > 0) {
      playerScreen.style.transform = `translateY(${dy}px)`;
      playerScreen.style.opacity = String(Math.max(1 - dy / 400, 0.4));
    } else if (axis === 'h') {
      artFrame.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    }
  });
 
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const endX = e.clientX != null ? e.clientX : startX;
    const endY = e.clientY != null ? e.clientY : startY;
    const dx = endX - startX;
    const dy = endY - startY;
    const dt = Math.max(Date.now() - startTime, 1);
 
    if (axis === 'v') {
      const velocity = dy / dt;
      playerScreen.style.transition = 'transform .25s ease, opacity .25s ease';
      if (dy > DISMISS_PX || velocity > DISMISS_VELOCITY) {
        playerScreen.style.transform = 'translateY(100%)';
        playerScreen.style.opacity = '0';
        setTimeout(() => {
          playerScreen.style.transition = 'none';
          playerScreen.style.transform = '';
          playerScreen.style.opacity = '';
          dismissPlayerScreen();
        }, 220);
      } else {
        playerScreen.style.transform = '';
        playerScreen.style.opacity = '';
      }
    } else if (axis === 'h') {
      artFrame.style.transition = 'transform .2s ease';
      if (dx < -SKIP_PX) {
        slideArtOutThenIn(-1, goNext);
      } else if (dx > SKIP_PX) {
        slideArtOutThenIn(1, goPrev);
      } else {
        artFrame.style.transform = '';
      }
    }
    axis = null;
  }
 
  playerScreen.addEventListener('pointerup', endDrag);
  playerScreen.addEventListener('pointercancel', endDrag);
}
 
function slideArtOutThenIn(direction, action) {
  const artFrame = document.querySelector('.art-frame');
  artFrame.style.transition = 'transform .18s ease, opacity .18s ease';
  artFrame.style.transform = `translateX(${direction * 340}px) rotate(${direction * 8}deg)`;
  artFrame.style.opacity = '0';
  setTimeout(() => {
    action();
    artFrame.style.transition = 'none';
    artFrame.style.transform = `translateX(${-direction * 340}px)`;
    if (mockMode) {
      // Mock mode updates art synchronously inside action() above, so it's safe to slide in now.
      requestAnimationFrame(() => slideArtIn());
    } else {
      // Real Spotify mode: player.nextTrack()/previousTrack() are async network calls.
      // Wait for the actual player_state_changed event (in updateNowPlaying) to deliver the
      // new track's artwork before sliding it in -- otherwise we'd briefly show the old art.
      pendingSlideIn = true;
      clearTimeout(pendingSlideInTimeout);
      pendingSlideInTimeout = setTimeout(() => {
        // Safety net: if Spotify's event is unusually slow, don't leave the art stuck off-screen.
        if (pendingSlideIn) { pendingSlideIn = false; slideArtIn(); }
      }, 1500);
    }
  }, 180);
}
 
function slideArtIn() {
  const artFrame = document.querySelector('.art-frame');
  requestAnimationFrame(() => {
    artFrame.style.transition = 'transform .22s ease, opacity .18s ease';
    artFrame.style.transform = '';
    artFrame.style.opacity = '1';
  });
}
 
let demoGridMode = false;
 
document.getElementById('loginBtn').addEventListener('click', startLogin);
document.getElementById('mockBtn').addEventListener('click', () => { demoGridMode = false; initMock(); });
document.getElementById('demoBtn').addEventListener('click', () => { demoGridMode = true; renderDemoGrid(); });
document.getElementById('backBtn').addEventListener('click', dismissPlayerScreen);
document.getElementById('plBackBtn').addEventListener('click', () => {
  showScreen('grid-screen');
  if (!mockMode) renderResumeBanner();
});
document.getElementById('plPlayBtn').addEventListener('click', () => {
  if (!currentPlaylistDetail || !currentPlaylistDetail.tracks.length) return;
  previousScreenBeforePlayer = 'playlist-screen';
  if (currentPlaylistDetail.isRemote) {
    playPlaylist(currentPlaylistDetail.contextUri, currentPlaylistDetail.name, 0, currentPlaylistDetail.tracks[0].uri);
  } else {
    playLocalQueue(currentPlaylistDetail.tracks, 0);
  }
});
document.getElementById('plShuffleBtn').addEventListener('click', async (e) => {
  if (!currentPlaylistDetail || !currentPlaylistDetail.tracks.length) return;
  previousScreenBeforePlayer = 'playlist-screen';
  const randomIdx = Math.floor(Math.random() * currentPlaylistDetail.tracks.length);
  if (currentPlaylistDetail.isRemote) {
    const token = await getValidToken();
    await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=true&device_id=${deviceId}`, {
      method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
    });
    playPlaylist(currentPlaylistDetail.contextUri, currentPlaylistDetail.name, 0, currentPlaylistDetail.tracks[randomIdx].uri);
  } else {
    playLocalQueue(currentPlaylistDetail.tracks, randomIdx);
  }
});
document.getElementById('playPauseBtn').addEventListener('click', () => {
  if (mockMode) { mockAudio.paused ? mockAudio.play() : mockAudio.pause(); }
  else player.togglePlay();
});
document.getElementById('nextBtn').addEventListener('click', goNext);
document.getElementById('prevBtn').addEventListener('click', goPrev);
 
setupSwipeGestures();
 
document.getElementById('shuffleBtn').addEventListener('click', async () => {
  const btn = document.getElementById('shuffleBtn');
  const newState = !btn.classList.contains('active');
  if (mockMode) {
    if (localQueue.length < 2) return;
    const current = localQueue[localIndex];
    const rest = localQueue.filter((_, i) => i !== localIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    localQueue = [current, ...rest];
    localIndex = 0;
    btn.classList.toggle('active', newState);
    return;
  }
  btn.classList.toggle('active', newState);
  const token = await getValidToken();
  await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${newState}&device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` }
  });
});
 
document.getElementById('timerBtn').addEventListener('click', () => {
  sleepIndex = (sleepIndex + 1) % SLEEP_OPTIONS_MIN.length;
  const mins = SLEEP_OPTIONS_MIN[sleepIndex];
  if (sleepTimeoutId) clearTimeout(sleepTimeoutId);
  if (mins === 0) {
    sleepEndsAt = null;
    updateTimerLabel();
    return;
  }
  sleepEndsAt = Date.now() + mins * 60000;
  sleepTimeoutId = setTimeout(() => {
    if (mockMode) mockAudio.pause(); else player.pause();
    sleepEndsAt = null;
    sleepIndex = 0;
    updateTimerLabel();
    log('sleep timer fired, paused playback');
  }, mins * 60000);
  updateTimerLabel();
});
 
const seekBar = document.getElementById('seekBar');
seekBar.addEventListener('input', () => {
  seeking = true;
  document.getElementById('elapsedTime').textContent = formatTime(Number(seekBar.value));
});
seekBar.addEventListener('change', async () => {
  const ms = Number(seekBar.value);
  if (mockMode) mockAudio.currentTime = ms / 1000;
  else await player.seek(ms);
  seeking = false;
});
 
async function boot() {
  // Auto-set hardcoded Client ID for when the user taps "Log in with Spotify"
  localStorage.setItem('client_id', HARDCODED_CLIENT_ID);
 
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code) {
    showScreen('setup');
    await exchangeCode(code);
    return;
  }
  const token = await getValidToken();
  if (token) {
    initPlayer();
  } else {
    // Show setup screen so Demo / Test Tone buttons stay reachable.
    // Login still works with one tap (no pasting needed) via HARDCODED_CLIENT_ID.
    showScreen('setup');
  }
}
 
boot();
 
