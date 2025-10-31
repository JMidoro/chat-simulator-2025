import { WebSocketServer } from "ws";
import tmi from "tmi.js";
import dotenv from "dotenv";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import path from "node:path";

dotenv.config();

const PORT = Number(
  process.env.WS_PORT ?? process.env.NEXT_PUBLIC_WS_PORT ?? 3001,
);

const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });

// Local username log path
const LOG_DIR = process.env.LOG_DIR || "logs";
const USERNAME_LOG = path.resolve(process.cwd(), LOG_DIR, "usernames.log");
const USERNAME_SET = new Set(); // stores lowercase usernames for case-insensitive uniqueness

// Load existing usernames once into memory (best-effort)
async function preloadUsernames() {
  try {
    const txt = await readFile(USERNAME_LOG, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const s = line.trim();
      if (s) USERNAME_SET.add(s.toLowerCase());
    }
  } catch {
    // file may not exist yet; ignore
  }
}
void preloadUsernames();

/** @param {string} name */
async function logUsernameToFile(name) {
  if (!name) return;
  const key = String(name).trim();
  const norm = key.toLowerCase();
  if (!key || USERNAME_SET.has(norm)) return;
  try {
    await mkdir(path.dirname(USERNAME_LOG), { recursive: true });
    await appendFile(USERNAME_LOG, `${key}\n`, "utf8");
    USERNAME_SET.add(norm);
  } catch (err) {
    // Non-fatal: just report once in console
    console.error("[ws] failed to log username", err);
  }
}

/**
 * @param {string} raw
 * @param {import('ws').WebSocket=} except
 */
function broadcast(raw, except) {
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */ && client !== except) {
      client.send(raw);
    }
  }
}

wss.on("connection", (ws, req) => {
  console.log("[ws] client connected from", req.socket.remoteAddress);

  ws.on("message", (data) => {
    try {
      const text = data.toString();
      const msg = JSON.parse(text);
      if (msg && msg.type === "chat" && msg.payload) {
        // Log username from client-originated messages (not from Twitch)
        const uname = msg?.payload?.username;
        void logUsernameToFile(typeof uname === "string" ? uname : "");
        // Relay chat payload to all clients (including sender)
        broadcast(JSON.stringify({ type: "chat", payload: msg.payload }));
      }
    } catch (err) {
      console.error("[ws] failed to process message", err);
    }
  });

  ws.on("close", () => {
    console.log("[ws] client disconnected");
  });

  ws.on("error", (err) => {
    console.error("[ws] client error", err);
  });
});

wss.on("listening", () => {
  console.log(`[ws] server listening on ws://localhost:${PORT}`);
});

// --- Twitch chat ingestion via tmi.js (anonymous) ---
const channelsEnv = process.env.TWITCH_CHANNELS || "";
const TWITCH_CHANNELS = channelsEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (TWITCH_CHANNELS.length === 0) {
  console.warn(
    '[tmi] No TWITCH_CHANNELS specified. Set TWITCH_CHANNELS="channel1,channel2" to read live chat.',
  );
}

const tmiClient = new tmi.Client({
  // Anonymous read-only connection (no identity)
  channels: TWITCH_CHANNELS,
  connection: { secure: true, reconnect: true },
});

// eslint-disable-next-line jsdoc/require-param
/** @param {string} channel @param {import('tmi.js').ChatUserstate} tags @param {string} message @param {boolean} self */
tmiClient.on("message", (channel, tags, message, self) => {
  if (self) return;
  try {
    const username = tags["display-name"] || tags.username || null;
    const color = typeof tags.color === "string" ? tags.color : null; // e.g. "#1E90FF"
    // Reuse existing client renderer by passing a Tailwind arbitrary color class
    const usernameClass = color ? `text-[${color}]` : "";
    const payload = { username, usernameClass, text: message };
    const raw = JSON.stringify({ type: "chat", payload });
    broadcast(raw);
  } catch (err) {
    console.error("[tmi] failed to broadcast message", err);
  }
});

/** @param {string} addr @param {number} port */
tmiClient.on("connected", (addr, port) => {
  console.log(
    `[tmi] connected to ${addr}:${port} — channels: ${TWITCH_CHANNELS.join(", ") || "(none)"}`,
  );
});

/** @param {string} reason */
tmiClient.on("disconnected", (reason) => {
  console.warn("[tmi] disconnected", reason);
});

/** @param {unknown} err */
tmiClient.connect().catch((err) => {
  console.error("[tmi] connect error", err);
});
