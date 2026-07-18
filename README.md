# Focus Player - Cloudflare Pages Deployment

A beautiful, lightweight music player with Spotify integration.

## Deploy to Cloudflare Pages

### Option 1: Direct Upload (Easiest)
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select **Pages** from the left menu
3. Click **Create a project** → **Direct upload**
4. Drag and drop this entire folder (or upload the zip)
5. Done! Your app is live at `yourdomain.pages.dev`

### Option 2: Git Integration
1. Push this folder to a GitHub repo
2. In Cloudflare Pages, connect your GitHub account
3. Select the repo and branch
4. Build command: (leave blank)
5. Build output directory: `/` (root)
6. Cloudflare will auto-deploy on push

## Setup Instructions

### To use with Spotify:
1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Set **Redirect URI** to: `https://yourdomain.pages.dev/` (your actual deployed URL)
3. Copy your **Client ID**
4. Open the app and paste the Client ID when prompted
5. Authorize with Spotify
6. Start playing!

### Demo Mode (No Spotify Required)
- Click "View demo playlists" to play sample tracks
- Click "Test tone only" to verify audio is working

## Features

- 🎵 Spotify playlist streaming (requires Premium)
- 📱 Works on desktop & mobile (lock screen controls on iOS)
- ☁️ No backend needed (runs entirely in browser)
- 🎨 Adaptive album art background colors
- ⏰ Sleep timer
- 🔀 Shuffle & controls
- 📍 Resume playback from last position
- 🎧 Demo mode with sample tracks

## File Structure

```
.
├── index.html           # Main app
├── style.css            # Styling
├── app.js               # Spotify + playback logic
├── _redirects           # SPA routing config
├── cover1.svg-4.svg     # Demo playlist covers
├── track1.mp3-4.mp3     # Demo tracks
├── dummy.mp3            # Test tone
└── README.md            # This file
```

## No Backend Required

This app runs **100% in the browser**:
- Spotify OAuth handled by browser redirect
- API calls go directly to Spotify servers
- All data stored in browser's localStorage
- No Python/Node server needed

## Support

If you have issues:
- Check browser console (`F12` → Console tab)
- Verify Spotify Client ID is correct
- Ensure Redirect URI matches your Cloudflare Pages URL exactly
- Try demo mode to isolate issues

Enjoy! 🎧
# spot
# spot
