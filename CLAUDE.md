# Focus Player - Developer Documentation

**A kid-safe, curated Spotify music player with lock screen controls.**

---

## 🎯 Overview

Focus Player is a simplified, distraction-free music player that:
- ✅ Streams music from Spotify
- ✅ Shows ONLY curated playlists (whitelisted by name pattern)
- ✅ Works on lock screen (next/previous controls)
- ✅ Demo mode for testing without Spotify
- ✅ No feed, no algorithm, no ads
- ✅ Built for parents to control what kids listen to

**Live:** `https://spot0.ashish161.workers.dev/`

---

## 🔑 Key Features

| Feature | Status | Notes |
|---------|--------|-------|
| Spotify Integration | ✅ | Web Playback SDK |
| Playlist Filtering | ✅ | Whitelist pattern: `kid-spot*` |
| Lock Screen Controls | ✅ | Android: Full (next/prev). iOS: Basic (play/pause, 10s skip) |
| Demo Mode | ✅ | Local MP3 playback, no Spotify needed |
| Sleep Timer | ✅ | 15, 30, 45, 60 minute options |
| Shuffle | ✅ | Full shuffle support |
| Resume Playback | ✅ | Remembers last played position |
| Responsive | ✅ | Mobile-first design |

---

## 🛠 Architecture

### **Frontend Stack**
- **HTML** — Simple, semantic markup
- **CSS** — Light theme, dark mode support, responsive grid
- **JavaScript** — Vanilla JS, no build step required
- **Spotify SDK** — Web Playback SDK for streaming

### **Hosting**
- **Cloudflare Pages** — Static file hosting, global CDN, auto-HTTPS
- **No backend required** — Everything runs in the browser

### **Authentication**
- **OAuth 2.0 with PKCE** — Spotify authorization code flow
- **Client ID** — Hardcoded (see Configuration section)
- **Tokens** — Stored in `localStorage`

---

## ⚙️ Configuration

### **1. Hardcoded Spotify Client ID**

**File:** `app.js` line 6

```javascript
const HARDCODED_CLIENT_ID = 'aa361e4ccd39469a8e01aa69e8117c22';
```

**Why hardcoded?**
- Simplifies UX (no paste-and-setup needed)
- Auto-authenticates on first visit
- Kid-friendly (no manual configuration)

**Future:** Will be replaced with D1 database query (see D1 Migration section)

---

### **2. Playlist Whitelist Filter**

**File:** `app.js` line 9

```javascript
const CURATED_PLAYLISTS_PATTERN = /^kid-spot/i;
```

**Current Rule:** Only show playlists starting with `kid-spot` (case-insensitive)

**Examples that appear:**
- `kid-spot-music`
- `kid-spot-nursery-rhymes`
- `Kid-Spot-Disney`
- `KID-SPOT-HITS`

**How it works (line 347-349):**
```javascript
(data.items || []).forEach(pl => {
  if (!CURATED_PLAYLISTS_PATTERN.test(pl.name)) return;
  // Only add tile if name matches pattern
  ...
});
```

**To change:** Update the regex pattern or replace with array of playlist names.

---

### **3. Spotify Scopes**

**File:** `app.js` line 1

```javascript
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative user-library-read';
```

**Permissions requested:**
- `streaming` — Play music via Web Playback SDK
- `playlist-read-private` — Read user's private playlists
- `playlist-read-collaborative` — Read collaborative playlists
- `user-read-playback-state` — Check current playback status
- `user-modify-playback-state` — Play/pause/skip controls

---

## 🚀 Deployment

### **Quick Deploy (Cloudflare Pages)**

1. **Upload to Pages:**
   ```
   Go to dash.cloudflare.com → Pages → Create Project → Direct Upload
   Upload the zip file or folder
   ```

2. **Get Your URL:**
   ```
   https://your-project-name.pages.dev/
   ```

3. **Update Spotify Redirect URI:**
   ```
   developer.spotify.com/dashboard → Your App → Settings
   Redirect URIs: https://your-project-name.pages.dev/
   ```

4. **Done!** 🚀
   - App auto-logs in with hardcoded Client ID
   - User authorizes once
   - See only `kid-spot*` playlists

---

## 📱 Platform Behavior

### **Android**
- ✅ Lock screen shows: Album art, title, artist
- ✅ Lock screen controls: Play/Pause, **Next, Previous**
- ✅ Works with headphone buttons
- ✅ Best experience overall

### **iOS**
- ✅ Lock screen shows: Album art, title, artist (small)
- ✅ Lock screen controls: Play/Pause, **10s back/forward** (iOS default)
- ⚠️ No custom next/previous (iOS limitation)
- ⚠️ No Siri voice commands (web app limitation)
- ℹ️ Works best on iOS 15+

### **Web (Desktop)**
- ✅ Full player interface
- ✅ All controls visible
- ✅ Best for setup/testing

---

## 🔄 User Flow

```
┌─────────────────────────────┐
│ 1. User opens app           │
│    (auto-login triggered)   │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 2. Redirect to Spotify      │
│    (OAuth authorization)    │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 3. User clicks "Authorize"  │
│    Grants app permissions   │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 4. Callback to app with     │
│    authorization code       │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 5. Exchange code for token  │
│    (stored in localStorage) │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 6. Init Spotify SDK         │
│    Load playlists           │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 7. Filter playlists         │
│    Show only kid-spot*      │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ 8. Display playlist grid    │
│    Ready to play!           │
└─────────────────────────────┘
```

---

## 🔐 Security & Privacy

### **What's stored locally:**
- `client_id` — Hardcoded (safe, public)
- `access_token` — Spotify OAuth token (expires ~1 hour)
- `refresh_token` — Refresh credential (long-lived)
- `expires_at` — Token expiry timestamp
- `lastPlayback` — Last played playlist/position

### **What's NOT stored:**
- ❌ Passwords (OAuth handles auth)
- ❌ Email addresses
- ❌ Listening history
- ❌ Payment info

### **What Spotify can see:**
- Your Spotify account (same as regular Spotify app)
- Playlists you play
- Playback events

---

## 🗄️ Future: D1 Database Migration

### **Timeline Comment**
```javascript
// TODO: Replace with D1 database query later
// Magic link: aa361e4ccd39469a8e01aa69e8117c22
const HARDCODED_CLIENT_ID = 'aa361e4ccd39469a8e01aa69e8117c22';
```

### **Why Migrate to D1?**
- ✅ Dynamic Client IDs (per family/account)
- ✅ Store curated playlists per child
- ✅ Track listening history
- ✅ Manage access control

### **Migration Path**

**Current (Hardcoded):**
```javascript
const HARDCODED_CLIENT_ID = 'aa361e4ccd39469a8e01aa69e8117c22';
```

**After D1:**
```javascript
// Fetch from D1 database
const response = await fetch('/api/client-config', {
  headers: { 'X-Magic-Link': 'aa361e4ccd39469a8e01aa69e8117c22' }
});
const { clientId, allowedPlaylists } = await response.json();
```

**No changes to:**
- ✅ `startLogin()` function
- ✅ OAuth flow
- ✅ Playback logic
- ✅ UI/UX

Just swap the data source!

---

## 🐛 Troubleshooting

### **App shows "Insufficient client scope" (403 error)**
- **Cause:** Missing Spotify scopes during authorization
- **Fix:** 
  1. Clear `localStorage` (F12 → Application → Local Storage → Clear All)
  2. Reload and re-authorize
  3. Verify scopes in `app.js` line 1

### **iOS lock screen shows empty box**
- **Cause:** iOS Safari Media Session API limitations
- **Fix:** This is expected. Artwork should display; 10s skip buttons are OS default
- **Note:** No workaround available; iOS limitation

### **Only 10 playlists show instead of all**
- **Cause:** API limit of 50; may need pagination
- **Fix:** Uncomment pagination logic or increase `limit=50` parameter

### **Kid-spot playlists don't appear**
- **Cause:** Playlist names don't match pattern
- **Fix:**
  1. Check exact playlist name in Spotify (case-sensitive for regex)
  2. Verify regex pattern in `app.js` line 9
  3. Test regex: `console.log(/^kid-spot/i.test('Kid-Spot-Music'))`

---

## 📂 File Structure

```
focus-player/
├── index.html           # Main UI structure
├── style.css            # Styling (light/dark mode)
├── app.js               # All JavaScript logic
├── cover1.svg-4.svg     # Demo playlist artwork
├── track1.mp3-4.mp3     # Demo tracks
├── dummy.mp3            # Test tone (440Hz)
├── README.md            # User-facing docs
└── CLAUDE.md            # This file (dev docs)
```

---

## 🔄 Key Functions

| Function | Purpose | Location |
|----------|---------|----------|
| `boot()` | Initialize app on load | Line 469 |
| `startLogin()` | Trigger Spotify OAuth | Line 27 |
| `exchangeCode()` | Exchange auth code for token | Line 45 |
| `getValidToken()` | Get or refresh access token | Line 88 |
| `loadPlaylists()` | Fetch & filter Spotify playlists | Line 335 |
| `playPlaylist()` | Start playing selected playlist | Line 375 |
| `playLocalQueue()` | Play demo/local tracks | Line 210 |
| `initPlayer()` | Load Spotify Web Playback SDK | Line 263 |

---

## 🎨 Customization

### **Change Playlist Filter**

**Current (kid-spot* pattern):**
```javascript
const CURATED_PLAYLISTS_PATTERN = /^kid-spot/i;
```

**Option 1: Exact playlist names**
```javascript
const CURATED_PLAYLISTS = ['Kids Music', 'Disney Songs', 'Study Time'];
// Then in loadPlaylists():
if (!CURATED_PLAYLISTS.includes(pl.name)) return;
```

**Option 2: Multiple patterns**
```javascript
const CURATED_PLAYLISTS_PATTERN = /^(kid-spot|children|family)/i;
```

**Option 3: Array of regex patterns**
```javascript
const CURATED_PLAYLISTS_PATTERNS = [/^kid-spot/i, /kids/i, /nursery/i];
// Then:
if (!CURATED_PLAYLISTS_PATTERNS.some(p => p.test(pl.name))) return;
```

### **Change Redirect URI**

If deploying to different domain:
1. Update Spotify Dashboard: Settings → Redirect URIs
2. No code change needed (uses `window.location.origin`)

### **Change Sleep Timer Options**

**Line 113:**
```javascript
const SLEEP_OPTIONS_MIN = [0, 15, 30, 45, 60];  // Add/remove minutes
```

---

## 📊 Development Notes

### **Browser Support**
- ✅ Chrome/Chromium (Android)
- ✅ Safari (iOS 13+)
- ✅ Firefox
- ✅ Edge
- ⚠️ Spotify Web Playback SDK requires HTTPS

### **Spotify API Rate Limits**
- 🟢 Low volume (OK for kids app)
- No special handling needed yet
- Can fetch up to 50 playlists per request

### **localStorage Limits**
- Typical: 5-10MB per domain
- Current usage: ~2KB
- No issues expected

### **Performance**
- ⚡ ~1-2 sec to load playlists
- ⚡ Instant next/previous (local)
- ⚡ Playlist load: ~500ms (network bound)

---

## 🚀 Next Steps

1. **Deploy to production**
   - Upload zip to Cloudflare Pages
   - Test on Android & iOS
   - Verify Spotify auth flow

2. **Create D1 database schema** (future)
   - Store Client IDs per family
   - Store curated playlists per child
   - Manage access tokens

3. **Add parental controls** (future)
   - Passcode for settings
   - Time limits
   - Content restrictions

4. **Analytics** (future)
   - Track listening by child
   - Generate reports
   - Usage insights

---

## 📝 License & Attribution

- **Spotify Integration:** Uses Spotify Web API & Web Playback SDK
- **Hosting:** Cloudflare Pages
- **Built with:** Vanilla JS (no dependencies)

---

## 🤝 Support

**For issues:**
- Check browser console (`F12` → Console tab)
- Verify Spotify app settings
- Clear localStorage and re-test
- Check this documentation

**For D1 migration questions:**
- Reference the migration template in "D1 Migration" section
- Magic link available in code comments

---

**Last Updated:** July 2026  
**Version:** 1.0 (Hardcoded Client ID + Kid-Spot Filter)
