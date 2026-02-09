# Clicktrack Sync Server

A tiny Node.js + Socket.IO app that synchronizes playback across devices on the same Wi-Fi router. The admin page broadcasts a timestamp 2 seconds in the future so all clients start together.

## ✅ What you get

- `/admin` page with dynamically-loaded play buttons + stop control
- `/` client page for all devices to receive cues and play in sync
- Audio is preloaded and decoded in advance to avoid buffering

## Setup

1. Add your audio files here (any `.mp3` files are auto-discovered):

```
public/audio/
```

2. Install dependencies:

```
npm install
```

3. Start the server:

```
npm start
```

Then open:

- `http://<your-computer-ip>:3000/` on each device
- `http://<your-computer-ip>:3000/admin` on the controller phone/tablet

> Tip: you can find your local IP with `ipconfig` on Windows.

## Notes

- Each device must tap **Enable Audio** once to unlock audio playback on mobile browsers.
- The clicktrack is scheduled using Web Audio for tighter sync.

## Troubleshooting

- If audio doesn’t play on mobile, tap **Enable Audio** and try again.
- If clients are late, keep devices on the same router and avoid power-saving modes.

## Run the smoke test

```
npm test
```
