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

stopBtn.addEventListener("click", () => {
  socket.emit("admin:stop");
  setStatus("Stop sent to all devices.");
  console.log(`[admin ${adminId}] stop sent`);
});

loadConfig();
loadTracks();
