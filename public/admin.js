const statusEl = document.getElementById("status");
const ipEl = document.getElementById("ip");
const qrEl = document.getElementById("qr");
const trackButtonsEl = document.getElementById("track-buttons");
const stopBtn = document.getElementById("stop");

const socket = io();
const adminId = Math.random().toString(36).slice(2, 8);
console.log(`[admin ${adminId}] admin script loaded`);

function setStatus(message) {
  statusEl.textContent = message;
  console.log(`[admin ${adminId}] status: ${message}`);
}

socket.on("connect", () => {
  setStatus("Connected. Ready to send cues.");
  console.log(`[admin ${adminId}] socket connected`);
});

async function loadConfig() {
  if (!ipEl) return;
  try {
    const response = await fetch("/config");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config = await response.json();
    const url = `http://${config.ip}:${config.port}`;
    ipEl.textContent = url;
    await renderQrCode(url);
    console.log(`[admin ${adminId}] config loaded`, config);
  } catch (error) {
    ipEl.textContent = "Local IP: unavailable";
    if (qrEl) {
      qrEl.textContent = "QR unavailable";
    }
    console.error(`[admin ${adminId}] config load failed`, error);
  }
}

function renderQrCode(url) {
  if (!qrEl) return;
  if (typeof QRCode === "undefined") {
    qrEl.textContent = "QR library not loaded";
    return;
  }

  qrEl.textContent = "";
  try {
    const container = document.createElement("div");
    qrEl.appendChild(container);
    new QRCode(container, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#0b0e14",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
    // add white border around QR code for better visibility
    container.style.padding = "10px";
    container.style.backgroundColor = "#ffffff";
    // radius
    container.style.borderRadius = "8px";
  } catch (error) {
    qrEl.textContent = "Failed to render QR";
    console.error(`[admin ${adminId}] QR render failed`, error);
  }
}

function emitPlay(track) {
  setStatus(`Scheduling ${track}...`);
  console.log(`[admin ${adminId}] sending play ${track}`);
  socket.emit("admin:play", { track }, (response) => {
    if (!response?.ok) {
      setStatus(`Failed to schedule ${track}.`);
      console.warn(`[admin ${adminId}] schedule failed`, response);
      return;
    }
    const startTime = new Date(response.startAt).toLocaleTimeString();
    setStatus(`Sent ${track}. Starts at ${startTime}.`);
    console.log(`[admin ${adminId}] scheduled ${track}`, response);
  });
}

async function loadTracks() {
  if (!trackButtonsEl) return;
  try {
    const response = await fetch("/tracks");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
    renderTrackButtons(tracks);
  } catch (error) {
    console.error(`[admin ${adminId}] track load failed`, error);
    trackButtonsEl.textContent = "Failed to load tracks.";
  }
}

function renderTrackButtons(tracks) {
  trackButtonsEl.innerHTML = "";
  if (tracks.length === 0) {
    trackButtonsEl.textContent = "No MP3 files found in /public/audio.";
    setStatus("No tracks available.");
    return;
  }

  for (const track of tracks) {
    const button = document.createElement("button");
    button.className = "primary admin-primary";
    button.type = "button";
    button.dataset.track = track.id;
    button.textContent = track.title || track.id;
    button.addEventListener("click", () => emitPlay(track.id));
    trackButtonsEl.appendChild(button);
  }
}

// ── Timeline state ──
const timelineContainer = document.getElementById("timeline-container");
const timelineTrackName = document.getElementById("timeline-track-name");
const timelineFill = document.getElementById("timeline-bar-fill");
const timelineHandle = document.getElementById("timeline-bar-handle");
const timelineBarWrapper = document.getElementById("timeline-bar-wrapper");
const timelineCurrent = document.getElementById("timeline-current");
const timelineDuration = document.getElementById("timeline-duration");

let timelineState = null; // { track, startAt, duration }
let timelineAnimFrame = null;
let trackDurations = {}; // cache of track durations
let isSeeking = false;

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function showTimeline(track, startAt, duration) {
  timelineState = { track, startAt, duration };
  timelineContainer.style.display = "";
  timelineTrackName.textContent = `Now playing: ${track}`;
  timelineDuration.textContent = formatTime(duration);
  if (!timelineAnimFrame) updateTimeline();
}

function hideTimeline() {
  timelineState = null;
  timelineContainer.style.display = "none";
  if (timelineAnimFrame) {
    cancelAnimationFrame(timelineAnimFrame);
    timelineAnimFrame = null;
  }
  timelineFill.style.width = "0%";
  timelineHandle.style.left = "0%";
  timelineCurrent.textContent = "0:00";
}

function updateTimeline() {
  if (!timelineState) return;
  const { startAt, duration } = timelineState;
  const elapsed = (Date.now() - startAt) / 1000;
  const progress = Math.min(Math.max(elapsed / duration, 0), 1);

  if (!isSeeking) {
    const pct = (progress * 100).toFixed(2) + "%";
    timelineFill.style.width = pct;
    timelineHandle.style.left = pct;
    timelineCurrent.textContent = formatTime(elapsed);
  }

  if (progress >= 1) {
    hideTimeline();
    return;
  }
  timelineAnimFrame = requestAnimationFrame(updateTimeline);
}

function seekTo(fraction) {
  if (!timelineState) return;
  const seekSeconds = fraction * timelineState.duration;
  socket.emit("admin:seek", { seekTo: seekSeconds }, (res) => {
    if (res?.ok) {
      timelineState.startAt = res.startAt;
      setStatus(`Seeked to ${formatTime(seekSeconds)}`);
    }
  });
}

// Drag / click on timeline bar
function handleTimelinePointer(e) {
  const rect = timelineBarWrapper.getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const fraction = x / rect.width;
  const pct = (fraction * 100).toFixed(2) + "%";
  timelineFill.style.width = pct;
  timelineHandle.style.left = pct;
  if (timelineState) {
    timelineCurrent.textContent = formatTime(fraction * timelineState.duration);
  }
  return fraction;
}

timelineBarWrapper.addEventListener("pointerdown", (e) => {
  if (!timelineState) return;
  isSeeking = true;
  timelineBarWrapper.setPointerCapture(e.pointerId);
  handleTimelinePointer(e);
});

timelineBarWrapper.addEventListener("pointermove", (e) => {
  if (!isSeeking) return;
  handleTimelinePointer(e);
});

timelineBarWrapper.addEventListener("pointerup", (e) => {
  if (!isSeeking) return;
  isSeeking = false;
  const fraction = handleTimelinePointer(e);
  seekTo(fraction);
});

// Fetch track duration via an Audio element
function getTrackDuration(trackId, url) {
  return new Promise((resolve) => {
    if (trackDurations[trackId]) {
      resolve(trackDurations[trackId]);
      return;
    }
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audio.addEventListener("loadedmetadata", () => {
      trackDurations[trackId] = audio.duration;
      resolve(audio.duration);
    });
    audio.addEventListener("error", () => resolve(0));
  });
}

// Listen for playback events to drive the timeline
socket.on("play", async (payload) => {
  const { track, startAt } = payload;
  try {
    const res = await fetch("/tracks");
    const data = await res.json();
    const entry = (data.tracks || []).find((t) => t.id === track);
    if (entry) {
      const dur = await getTrackDuration(track, entry.url);
      if (dur > 0) showTimeline(track, startAt, dur);
    }
  } catch (err) {
    console.error(`[admin ${adminId}] timeline load error`, err);
  }
});

socket.on("seek", (payload) => {
  if (timelineState && payload.track === timelineState.track) {
    timelineState.startAt = Date.now() - payload.seekTo * 1000;
  }
});

socket.on("stop", () => {
  hideTimeline();
});

stopBtn.addEventListener("click", () => {
  socket.emit("admin:stop");
  setStatus("Stop sent to all devices.");
  hideTimeline();
  console.log(`[admin ${adminId}] stop sent`);
});

loadConfig();
loadTracks();
