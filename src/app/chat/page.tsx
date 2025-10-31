"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";

// Page: /chat — minimal chat output only. Connects to WS and renders messages with emote replacement.

// Static palette for inline fallback. Keys are Tailwind families and shades.
const PALETTE: Record<string, Record<string, string>> = {
  sky: {
    "400": "#38bdf8",
    "500": "#0ea5e9",
  },
  blue: {
    "400": "#60a5fa",
    "500": "#3b82f6",
  },
  green: {
    "400": "#34d399",
    "500": "#22c55e",
  },
  emerald: {
    "400": "#34d399",
    "500": "#10b981",
  },
  teal: {
    "400": "#2dd4bf",
    "500": "#14b8a6",
  },
  cyan: {
    "400": "#22d3ee",
    "500": "#06b6d4",
  },
  indigo: {
    "400": "#818cf8",
    "500": "#6366f1",
  },
  violet: {
    "400": "#a78bfa",
    "500": "#8b5cf6",
  },
  purple: {
    "400": "#c084fc",
    "500": "#a855f7",
  },
  pink: {
    "400": "#f472b6",
    "500": "#ec4899",
  },
  rose: {
    "400": "#fb7185",
    "500": "#f43f5e",
  },
  red: {
    "400": "#f87171",
    "500": "#ef4444",
  },
  orange: {
    "400": "#fb923c",
    "500": "#f97316",
  },
  amber: {
    "400": "#fbbf24",
    "500": "#f59e0b",
  },
  yellow: {
    "400": "#facc15",
    "500": "#eab308",
  },
  lime: {
    "400": "#a3e635",
    "500": "#84cc16",
  },
  slate: {
    "400": "#94a3b8",
    "500": "#64748b",
  },
  gray: {
    "400": "#9ca3af",
    "500": "#6b7280",
  },
  zinc: {
    "400": "#a1a1aa",
    "500": "#71717a",
  },
  neutral: {
    "400": "#a3a3a3",
    "500": "#737373",
  },
  stone: {
    "400": "#a8a29e",
    "500": "#78716c",
  },
};

type IncomingPayload = {
  username: string | null;
  usernameClass: string; // tailwind class from sender
  text: string;
};

type ChatMsg = IncomingPayload;

function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [emoteMap, setEmoteMap] = useState<Record<string, { url: string; source: "twitch" | "bttv" | "7tv" }>>({});
  const endRef = useRef<HTMLDivElement | null>(null);

  // Load global emotes
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/emotes/global", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as { emotes?: Array<{ name: string; url: string; source: "twitch" | "bttv" | "7tv" }> };
        const list = data.emotes ?? [];
        if (!Array.isArray(list)) return;
        if (cancelled) return;
        setEmoteMap((prev) => {
          const next = { ...prev };
          for (const e of list) {
            if (e?.name && e?.url) next[e.name] = { url: e.url, source: e.source };
          }
          return next;
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load default channels to mirror main page
  const addChannel = useCallback(async (name: string) => {
    if (!name) return;
    try {
      const res = await fetch("/api/emotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { emotes?: Array<{ name: string; url: string; source: "twitch" | "bttv" | "7tv" }> };
      const list = data.emotes ?? [];
      if (!Array.isArray(list)) return;
      setEmoteMap((prev) => {
        const next = { ...prev };
        for (const e of list) {
          if (e?.name && e?.url) next[e.name] = { url: e.url, source: e.source };
        }
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        // deme
        await addChannel("deme");
        // ludwig
        await addChannel("ludwig");
        // shxtou
        await addChannel("shxtou");
        // dougdoug
        await addChannel("dougdoug");
        // porcelainmaid
        await addChannel("porcelainmaid");
        // jamsvirtual
        await addChannel("jamsvirtual");
        // Merryweather
        await addChannel("merryweather");
      } catch {
        // ignore
      }
    })();
  }, [addChannel]);

  // Connect to WebSocket server
  useEffect(() => {
    let url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) {
      const { protocol, hostname } = window.location;
      const wsProto = protocol === "https:" ? "wss" : "ws";
      const port = process.env.NEXT_PUBLIC_WS_PORT ?? "3001";
      url = `${wsProto}://${hostname}:${port}`;
    }
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as { type?: string; payload?: IncomingPayload };
          if (parsed?.type === "chat" && parsed?.payload) {
            setMessages((prev) => {
              const next = [...prev, parsed.payload!];
              return next.slice(-200);
            });
          }
        } catch {
          // ignore
        }
      };
      ws.onerror = () => {
        // ignore
      };
    } catch {
      // ignore
    }
    return () => {
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const renderContent = useCallback((text: string, keyPrefix: string) => {
    // Remove trailing broken emote like "[abc"
    const safeText = text.replace(/\[[^\]]*$/g, "");
    const els: React.ReactNode[] = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0;
    let k = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(safeText)) !== null) {
      const before = safeText.slice(last, m.index);
      if (before) {
        els.push(
          <span key={`${keyPrefix}-t-${k++}`} className="whitespace-pre-wrap break-words">
            {before}
          </span>
        );
      }
      const name: string = m[1] ?? "";
      const em = name ? emoteMap[name] : undefined;
      if (em?.url) {
        els.push(
          <img
            key={`${keyPrefix}-e-${k++}`}
            src={em.url}
            alt={name}
            className="inline-block h-[2rem] align-[-0.2em]"
          />
        );
      }
      // If unknown emote, drop it
      last = re.lastIndex;
    }
    const tail = safeText.slice(last);
    if (tail) {
      els.push(
        <span key={`${keyPrefix}-t-${k++}`} className="whitespace-pre-wrap break-words">
          {tail}
        </span>
      );
    }
    return <>{els}</>;
  }, [emoteMap]);

  // Inline color fallback for older Chromium that fails to parse Tailwind color syntax.
  // Parses a Tailwind text class (e.g., "text-sky-500") into a HEX color used via inline style.
  const colorFromTailwindText = useCallback((classList: string | undefined): string | undefined => {
    if (!classList) return undefined;
    const tokens = classList.split(/\s+/).filter(Boolean);
    // Look from right to left for the last text-* token. Handle variant prefixes like dark:text-*, hover:text-* by taking the last segment after ':'.
    let textToken: string | undefined;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const core = t?.split(":")?.pop();
      if (core?.startsWith("text-")) {
        textToken = core;
        break;
      }
    }
    if (!textToken) return undefined;

    // Handle text-white / text-black
    if (textToken === "text-white") return "#ffffff";
    if (textToken === "text-black") return "#000000";

    // Handle arbitrary hex color e.g., text-[#0ea5e9] or text-[#0ea5e9]/80
    const hexMatch = /^text-\[#([0-9a-fA-F]{3,8})\](?:\/[0-9]{1,3})?$/.exec(textToken);
    if (hexMatch) {
      const raw = hexMatch[1]!;
      // Prefer 6-digit hex; if 3 or 4 digits, browsers expand; if 8 digits, most modern browsers support #RRGGBBAA
      // For compatibility with older Chromium, strip alpha if present (8 digits -> first 6)
      const hex = raw.length === 8 ? raw.slice(0, 6) : raw;
      return `#${hex}`;
    }

    const m = /^text-([a-z]+)-(50|100|200|300|400|500|600|700|800|900)(?:\/(\d{1,3}))?$/.exec(textToken);
    if (!m) return undefined;
    const family = m[1]!;
    const shade = m[2]!;
    const fam = PALETTE[family];
    if (!fam) return undefined;
    if (fam[shade]) return fam[shade];
    // Shade fallback: approximate to 400 or 500 if exact shade missing
    const shadeNum = parseInt(shade, 10);
    return shadeNum <= 450 ? fam["400"] : fam["500"];
  }, []);

  // (palette moved to module scope)

  return (
    <main className="min-h-screen">
      <div className="mr-auto w-full max-w-md">
        <ScrollArea className="h-screen w-full rounded-md border">
          <div className="flex flex-col gap-3 p-3 bg-black/10">
            {messages.map((m, i) => (
              <div key={i} className="text-xl text-white break-words">
                {m.username ? (
                  <>
                    <span
                      className={`font-bold ${m.usernameClass}`}
                      style={{ color: colorFromTailwindText(m.usernameClass) ?? "#0ea5e9" }}
                      data-color-fallback={colorFromTailwindText(m.usernameClass) ?? "#0ea5e9"}
                    >
                      {m.username}
                    </span>
                    <span>: </span>
                    <span className="whitespace-pre-wrap break-words">{renderContent(m.text, `msg-${i}`)}</span>
                  </>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{renderContent(m.text, `msg-${i}`)}</span>
                )}
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground">Waiting for messages…</div>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>
      </div>
    </main>
  );
}

export default ChatPage;
