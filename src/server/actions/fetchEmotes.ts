"use server";

import { env } from "~/env";

type Emote = { name: string; url: string; source: "twitch" | "bttv" | "7tv" };

let twitchAppToken: { token: string; expiresAt: number } | null = null;
async function fetch7TVGlobalEmotes(): Promise<Emote[]> {
  try {
    const res = await fetch("https://api.7tv.app/v3/emote-sets/global", { cache: "no-store" });
    if (!res.ok) {
      console.error("7TV global fetch failed", res.status);
      return [];
    }
    const data = (await res.json()) as { emotes?: SevenTVSetEmote[] };
    const ems = data.emotes ?? [];
    if (ems.length === 0) {
      console.warn("7TV global returned empty set");
      return [];
    }
    return ems
      .map((e): Emote | null => {
        const url = best7TVFile(e.data.host);
        return url ? { name: e.name, url, source: "7tv" } : null;
      })
      .filter((x): x is Emote => !!x);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("7TV global fetch error:", msg);
    return [];
  }
}

async function getTwitchAppToken(): Promise<string | null> {
  const now = Date.now();
  if (twitchAppToken && twitchAppToken.expiresAt > now + 60_000) {
    return twitchAppToken.token;
  }
  const clientId = env.TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  twitchAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return twitchAppToken.token;
}

async function getTwitchUserId(login: string): Promise<string | null> {
  const token = await getTwitchAppToken();
  const clientId = env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return null;
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}` ,{
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data: Array<{ id: string }> };
  return data.data?.[0]?.id ?? null;
}

async function fetchTwitchEmotes(broadcasterId: string): Promise<Emote[]> {
  const token = await getTwitchAppToken();
  const clientId = env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return [];
  const res = await fetch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${encodeURIComponent(broadcasterId)}` ,{
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data: Array<{ name: string; images: { url_1x: string; url_2x: string; url_4x: string } }>;
  };
  return (data.data ?? []).map((e) => ({ name: e.name, url: e.images?.url_2x ?? e.images?.url_1x, source: "twitch" }));
}

async function fetchBTTVEmotes(twitchId: string): Promise<Emote[]> {
  try {
    const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchId)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { channelEmotes?: Array<{ id: string; code: string }>; sharedEmotes?: Array<{ id: string; code: string }>; };
    const all = [...(data.channelEmotes ?? []), ...(data.sharedEmotes ?? [])];
    return all.map((e) => ({ name: e.code, url: `https://cdn.betterttv.net/emote/${e.id}/2x`, source: "bttv" }));
  } catch {
    return [];
  }
}

// 7TV v3 helpers
type SevenTVFile = { name: string; format: string; width: number; height: number };
type SevenTVHost = { url: string; files: SevenTVFile[] };
type SevenTVEmoteData = { id: string; name: string; host: SevenTVHost };
type SevenTVSetEmote = { id: string; name: string; data: SevenTVEmoteData };

function best7TVFile(host: SevenTVHost): string | null {
  const order = ["2x.webp", "2x.avif", "1x.webp", "1x.avif", "2x.gif", "1x.gif"];
  for (const name of order) {
    const f = host.files.find((x) => x.name === name);
    if (f) return `https:${host.url}/${f.name}`;
  }
  // Fallback to 2x.webp by convention
  return `https:${host.url}/2x.webp`;
}

async function fetch7TVEmotes(twitchId: string): Promise<Emote[]> {
  try {
    const u = `https://api.7tv.app/v3/users/twitch/${encodeURIComponent(twitchId)}`;
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok) {
      console.error("7TV channel fetch failed", res.status, u);
      return [];
    }
    const data = (await res.json()) as {
      emote_set?: { emotes?: SevenTVSetEmote[] };
    };
    const set = data.emote_set;
    if (!set?.emotes || set.emotes.length === 0) {
      console.warn("7TV channel has no emotes (v3)", twitchId);
      return [];
    }
    return set.emotes
      .map((e): Emote | null => {
        const url = best7TVFile(e.data.host);
        return url ? { name: e.name, url, source: "7tv" } : null;
      })
      .filter((x): x is Emote => !!x);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("7TV channel fetch error:", msg);
    return [];
  }
}

export async function fetchChannelEmotes(username: string): Promise<Emote[]> {
  const id = await getTwitchUserId(username);
  if (!id) return [];
  const [tw, bttv, stv] = await Promise.all([
    fetchTwitchEmotes(id),
    fetchBTTVEmotes(id),
    fetch7TVEmotes(id),
  ]);
  // Deduplicate by name, prefer Twitch > BTTV > 7tv
  const byName = new Map<string, Emote>();
  for (const src of [tw, bttv, stv]) {
    for (const e of src) {
      if (!byName.has(e.name)) byName.set(e.name, e);
    }
  }
  return Array.from(byName.values());
}

async function fetchTwitchGlobalEmotes(): Promise<Emote[]> {
  const token = await getTwitchAppToken();
  const clientId = env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return [];
  try {
    const res = await fetch("https://api.twitch.tv/helix/chat/emotes/global", {
      headers: { "Client-ID": clientId, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data: Array<{ name: string; images: { url_1x: string; url_2x: string; url_4x: string } }>;
    };
    return (data.data ?? []).map((e) => ({ name: e.name, url: e.images?.url_2x ?? e.images?.url_1x, source: "twitch" }));
  } catch {
    return [];
  }
}

async function fetchBTTVGlobalEmotes(): Promise<Emote[]> {
  try {
    const res = await fetch("https://api.betterttv.net/3/cached/emotes/global", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ id: string; code: string }>;
    return (data ?? []).map((e) => ({ name: e.code, url: `https://cdn.betterttv.net/emote/${e.id}/2x`, source: "bttv" }));
  } catch {
    return [];
  }
}

export async function fetchGlobalEmotes(): Promise<Emote[]> {
  const [tw, bttv, stv] = await Promise.all([
    fetchTwitchGlobalEmotes(),
    fetchBTTVGlobalEmotes(),
    fetch7TVGlobalEmotes(),
  ]);
  const byName = new Map<string, Emote>();
  // Prefer Twitch > BTTV > 7TV
  for (const src of [tw, bttv, stv]) {
    for (const e of src) {
      if (!byName.has(e.name)) byName.set(e.name, e);
    }
  }
  return Array.from(byName.values());
}
