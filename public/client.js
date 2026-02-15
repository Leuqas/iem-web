const statusEl = document.getElementById("status");
const preloadEl = document.getElementById("preload");
const enableAudioBtn = document.getElementById("enable-audio");
const resyncBtn = document.getElementById("resync");

let trackUrls = {};

let howls = {};
let currentHowl = null;
let playbackTimer = null;
let clockOffsetMs = 0;

const socket = io();
const clientId = Math.random().toString(36).slice(2, 8);
console.log(`[client ${clientId}] client script loaded`);

function setStatus(message) {
  statusEl.textContent = message;
  console.log(`[client ${clientId}] status: ${message}`);
}

function setPreload(message) {
  preloadEl.textContent = message;
  console.log(`[client ${clientId}] preload: ${message}`);
}

function ensureHowlerAvailable() {
  if (typeof Howl === "undefined") {
    throw new Error("Howler.js not loaded");
  }
}

function createHowl(name, url) {
  ensureHowlerAvailable();
  return new Promise((resolve, reject) => {
    console.log(`[client ${clientId}] creating howl for ${name}`);
    const howl = new Howl({
      src: [url],
      preload: true,
      html5: false,
    });

    howl.once("load", () => {
      console.log(`[client ${clientId}] howl loaded ${name}`);
      resolve(howl);
    });

    howl.once("loaderror", (_, error) => {
      reject(new Error(`Failed to load ${url} (${error})`));
    });
  });
}

async function fetchTracks() {
  const response = await fetch("/tracks");
  if (!response.ok) {
    throw new Error(`Failed to fetch tracks (HTTP ${response.status})`);
  }
  const payload = await response.json();
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  trackUrls = Object.fromEntries(
    tracks.map((track) => [track.id, track.url])
  );
  return tracks;
}

async function preloadTracks() {
  setPreload("Loading tracks...");
  const tracks = await fetchTracks();

  if (tracks.length === 0) {
    setPreload("No MP3 files found in /public/audio.");
    return;
  }

  for (const track of tracks) {
    setPreload(`Loading ${track.title || track.id}...`);
    howls[track.id] = await createHowl(track.id, track.url);
  }

  setPreload("Tracks loaded. Ready!");
}

function stopPlayback() {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (currentHowl) {
    currentHowl.stop();
    currentHowl = null;
  }
  console.log(`[client ${clientId}] playback stopped`);
}

function startHowl(track, seekSeconds = 0) {
  const howl = howls[track];
  if (!howl) {
    setStatus(`Track ${track} not loaded yet.`);
    return;
  }

  const duration = howl.duration();
  if (duration && seekSeconds >= duration) {
    setStatus("Song already finished.");
    return;
  }

  stopPlayback();

  const id = howl.play();
  if (seekSeconds > 0) {
    howl.seek(seekSeconds, id);
  }
  currentHowl = howl;
  console.log(`[client ${clientId}] started ${track} at ${seekSeconds.toFixed(2)}s`);

  howl.once("end", () => {
    if (currentHowl === howl) {
      currentHowl = null;
      setStatus("Playback finished.");
    }
  });
}

function schedulePlayback({ track, startAt }) {
  const howl = howls[track];
  if (!howl) {
    setStatus(`Track ${track} not loaded yet.`);
    return;
  }

  const now = Date.now() + clockOffsetMs;
  const delayMs = Math.max(0, startAt - now);
  if (playbackTimer) {
    clearTimeout(playbackTimer);
  }
  console.log(
    `[client ${clientId}] scheduled ${track} at ${new Date(startAt).toISOString()} (in ${Math.round(
      delayMs
    )} ms)`
  );

  const delayLabel = Math.round(delayMs);
  if (delayMs > 10000) {
    console.warn(`[client ${clientId}] large delay detected: ${delayLabel} ms`);
  }
  setStatus(`Playing ${track} in ${delayLabel} ms.`);

  playbackTimer = setTimeout(() => {
    startHowl(track, 0);
        setTimeout(() => {
        requestResync();
    }, 1000);
  }, delayMs);
}

function requestResync() {
  if (resyncBtn) {
    resyncBtn.disabled = true;
  }
  setStatus("Resyncing...");
  socket.emit("client:resync", {}, (response) => {
    if (resyncBtn) {
      resyncBtn.disabled = false;
    }
    if (!response?.playback) {
      setStatus("No song currently playing.");
      return;
    }

    const { track, startAt } = response.playback;
    const now = Date.now() + clockOffsetMs;
    const elapsedMs = now - startAt;

    if (elapsedMs < 0) {
      schedulePlayback({ track, startAt });
      return;
    }

    const seekSeconds = elapsedMs / 1000;
    setStatus(`Resyncing to ${track} @ ${seekSeconds.toFixed(1)}s`);
    startHowl(track, seekSeconds);
  });
}

socket.on("connect", () => {
  setStatus("Connected. Waiting for cue...");
  console.log(`[client ${clientId}] socket connected`);

  const clientSentAt = Date.now();
  socket.emit("client:sync", { clientSentAt }, (response) => {
    if (!response?.serverNow) {
      console.warn(`[client ${clientId}] sync failed`, response);
      return;
    }

    const clientReceivedAt = Date.now();
    const roundTripMs = clientReceivedAt - clientSentAt;
    const estimatedClientTimeAtServerNow = clientSentAt + roundTripMs / 2;
    clockOffsetMs = response.serverNow - estimatedClientTimeAtServerNow;
    console.log(
      `[client ${clientId}] sync offset ${Math.round(clockOffsetMs)} ms (RTT ${roundTripMs} ms)`
    );
  });
});

socket.on("play", async (payload) => {
  console.log(`[client ${clientId}] received play`, payload);
  try {
    ensureHowlerAvailable();
    schedulePlayback(payload);
  } catch (error) {
    setStatus(`Audio error: ${error.message}`);
  }
});

socket.on("stop", () => {
  console.log(`[client ${clientId}] received stop`);
  stopPlayback();
  setStatus("Stopped by admin.");
});

enableAudioBtn.addEventListener("click", async () => {
  console.log(`[client ${clientId}] enable audio clicked`);
  try {
    await preloadTracks();
    enableAudioBtn.disabled = true;
    enableAudioBtn.textContent = "Audio Ready";
    if (resyncBtn) {
      resyncBtn.disabled = false;
    }
    setStatus("Ready for cues.");
    setTimeout(() => {
        requestResync();
    }, 1000);
  } catch (error) {
    setPreload(`Preload failed: ${error.message}`);
    console.error(`[client ${clientId}] preload error`, error);
  }
});

if (resyncBtn) {
  resyncBtn.addEventListener("click", () => {
    console.log(`[client ${clientId}] resync clicked`);
    requestResync();
  });
}
