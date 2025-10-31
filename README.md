<div align="center">

<h1>🎮 Chat Simulator 2025</h1>

<p>
  <strong style="color:#9146FF;">Twitch‑style chat</strong> driven by a fine‑tuned, high‑TPS LLM that reacts to your stream and voice input in real time. This app is a <em>wrapper</em> around your local/remote LLM — you bring the model and horsepower; the app brings the vibes.
</p>

<a href="https://nextjs.org"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs&logoColor=white"></a>
<a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-blue"></a>
<a href="https://www.prisma.io/"><img alt="Prisma" src="https://img.shields.io/badge/Prisma-ORM-2D3748"></a>
<a href="https://trpc.io/"><img alt="tRPC" src="https://img.shields.io/badge/tRPC-11-3178C6"></a>
<a href="#"><img alt="Twitch Vibes" src="https://img.shields.io/badge/Vibes-9146FF?labelColor=000000"></a>

</div>

---

## Overview

- **Purpose**: Simulate a fast, emote‑rich Twitch chat that reacts to microphone input and ongoing stream context.
- **How it works**: The UI orchestrates prompts to your LLM via a simple `/v1/completions` HTTP endpoint. The LLM outputs lines like `username: message`, which are parsed, filtered, colorized, and displayed with emotes.
- **You supply the model**: Point the app at your high‑TPS, fine‑tuned model. The app is deliberately lightweight and model‑agnostic.

## Features

- **Real‑time chat simulation** with randomized delay to mimic human chatter
- **Voice input** via browser mic (React Speech Recognition)
- **Emote support** from Twitch/BTTV/7TV with per‑channel loading
- **Safety/pass filters** (banned word list, mention mapping)
- **WebSocket relay** to broadcast parsed chat to other clients

## Quickstart

1. **Install**
   ```bash
   npm install
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   # Fill in values (see Environment Variables below)
   ```

3. **Database (SQLite via Prisma)**
   ```bash
   npm run db:push   # or: npm run db:generate
   ```

4. **Run the WebSocket relay** (used to broadcast chat):
   ```bash
   npm run ws
   ```

5. **Start the app**
   - Separate terminals:
     ```bash
     npm run dev      # Next.js dev server
     ```
     and keep the WS relay running: `npm run ws`
   - Or one command to run both:
     ```bash
     npm run start:all
     ```

6. **Open** http://localhost:3000 and allow microphone permissions when prompted.

## Environment Variables

Edit `.env` (based on `.env.example`):

- `AUTH_SECRET` — NextAuth secret. Generate with `npx auth secret`.
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` — Optional Discord OAuth.
- `DATABASE_URL` — Defaults to `file:./db.sqlite`.
- `LLM_API_KEY` — Optional; forwarded as `Authorization: Bearer` to your LLM.
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — Used for channel emotes.
- `TWITCH_CHANNELS` — Optional JSON/CSV of default channels.

Client‑side WS overrides (optional):

- `NEXT_PUBLIC_WS_URL` — Full ws(s) URL if not on localhost.
- `NEXT_PUBLIC_WS_PORT` — Defaults to `3001`.

## LLM Backend

This app expects a **Completions API** at:

```
POST http://<host>:5005/v1/completions
Content-Type: application/json
Authorization: Bearer <LLM_API_KEY>   # optional

{
  "prompt": "...",
  "temperature": 1,
  "max_tokens": 60,
  "stop": "\n"
}
```

- The server-side proxy is implemented at `src/app/api/completion/route.ts`.
- Responses are returned as text (or OpenAI‑style shape); the UI parses lines into chat.
- Bring your own model/server. High token throughput is recommended for a lively feed.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run ws` — Start the WebSocket relay (`ws-server.js`)
- `npm run start:all` — Run both WS and app together
- `npm run db:push` — Push Prisma schema to SQLite
- `npm run db:studio` — Prisma Studio

## Notes

- The chat parser enforces a small banned‑term list and handles username mentions.
- Bracketed emotes like `[OMEGALUL]` render if known; unknown/broken ones are dropped.
- Microphone permission is required for voice input.

---

Made with ❤️ and a lot of <span style="color:#9146FF; font-weight:600;">Twitch purple</span>.
