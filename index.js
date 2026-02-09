const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const AUDIO_DIR = path.join(__dirname, "public", "audio");

async function listAudioTracks() {
	try {
		const entries = await fs.promises.readdir(AUDIO_DIR, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name)
			.filter((name) => path.extname(name).toLowerCase() === ".mp3")
			.sort((a, b) => a.localeCompare(b, "en"))
			.map((name) => {
				const id = path.basename(name, path.extname(name));
				const encodedName = encodeURIComponent(name);
				return {
					id,
					title: id,
					url: `/audio/${encodedName}`,
				};
			});
	} catch (error) {
		if (error?.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

function getLocalIp() {
	const nets = os.networkInterfaces();
	for (const entries of Object.values(nets)) {
		for (const net of entries ?? []) {
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	return "localhost";
}

function buildServer() {
	const app = express();
	const publicDir = path.join(__dirname, "public");
	app.locals.port = DEFAULT_PORT;
	let currentPlayback = null;

	app.use(express.static(publicDir));
	app.use("/vendor", express.static(path.join(__dirname, "node_modules", "howler", "dist")));
	app.use(
		"/vendor/qrcodejs",
		express.static(path.join(__dirname, "node_modules", "qrcodejs"))
	);

	app.get("/", (req, res) => {
		res.sendFile(path.join(publicDir, "index.html"));
	});

	app.get("/admin", (req, res) => {
		res.sendFile(path.join(publicDir, "admin.html"));
	});

	app.get("/config", (req, res) => {
		res.json({
			ip: getLocalIp(),
			port: app.locals.port ?? DEFAULT_PORT,
		});
	});

	app.get("/tracks", async (req, res) => {
		try {
			const tracks = await listAudioTracks();
			res.json({ tracks });
		} catch (error) {
			console.error("Failed to list tracks", error);
			res.status(500).json({ error: "Failed to list tracks." });
		}
	});

	const server = http.createServer(app);
	const io = new Server(server, {
		cors: {
			origin: "*",
		},
	});

	io.on("connection", (socket) => {
		console.log(`Socket connected: ${socket.id}`);

		socket.on("client:sync", (payload, ack) => {
			if (typeof ack === "function") {
				ack({
					serverNow: Date.now(),
					clientSentAt: payload?.clientSentAt ?? null,
				});
			}
		});

		socket.on("client:resync", (_, ack) => {
			console.log(`Resync requested by ${socket.id}`);
			if (typeof ack === "function") {
				ack({
					serverNow: Date.now(),
					playback: currentPlayback,
				});
			}
		});

		socket.on("disconnect", (reason) => {
			console.log(`Socket disconnected: ${socket.id} (${reason})`);
		});

		socket.on("admin:play", async (payload, ack) => {
			try {
				const track = payload?.track;
				const tracks = await listAudioTracks();
				const trackMap = new Map(tracks.map((entry) => [entry.id, entry]));
				if (!trackMap.has(track)) {
					console.warn(`Rejected unknown track: ${track}`);
					if (typeof ack === "function") {
						ack({ ok: false, error: "Unknown track." });
					}
					return;
				}

				const startAt = Date.now() + 2000;
				const message = { track, startAt };
				currentPlayback = message;
				console.log(`Broadcast play: ${track} at ${new Date(startAt).toISOString()}`);
				io.emit("play", message);

				if (typeof ack === "function") {
					ack({ ok: true, ...message });
				}
			} catch (error) {
				console.error("Failed to play track", error);
				if (typeof ack === "function") {
					ack({ ok: false, error: "Failed to play track." });
				}
			}
		});

		socket.on("admin:stop", () => {
			console.log("Broadcast stop");
			currentPlayback = null;
			io.emit("stop");
		});
	});

	return { app, server, io };
}

function startServer(port = DEFAULT_PORT) {
	const { app, server, io } = buildServer();

	return new Promise((resolve) => {
		server.listen(port, () => {
			const actualPort = server.address().port;
			const ip = getLocalIp();
			app.locals.port = actualPort;
			console.log(`Clicktrack server listening on http://${ip}:${actualPort}`);
			resolve({ server, io, port: actualPort });
		});
	});
}

if (require.main === module) {
	startServer();
}

module.exports = { buildServer, startServer };
