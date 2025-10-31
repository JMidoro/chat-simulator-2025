"use client";

import type React from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
// fetch completions via API to avoid server action during render

export type ChatRunnerHandle = {
  appendToRawLog: (text: string) => void;
  start: () => void;
  stop: () => void;
  setCallDelay: (sec: number) => void;
  addChannel: (username: string) => Promise<void>;
  setRandomizedDelay: (enabled: boolean) => void;
  setMaxRandomDelay: (sec: number) => void;
  setForceUsername: (enabled: boolean) => void;
  setTemperature: (t: number) => void;
  setMaxTokens: (n: number) => void;
};

export const ChatRunner = forwardRef<
  ChatRunnerHandle,
  {
    minDelaySec?: number;
    maxDelaySec?: number;
    showControls?: boolean;
    onEmoteMapChange?: (
      m: Record<string, { url: string; source: "twitch" | "bttv" | "7tv" }>
    ) => void;
    onStatusChange?: (s: { queuedCount: number; lastStats: { total: number; banned: number; noColon: number; accepted: number }; callDelaySec: number; maxRandomDelaySec: number; temperature: number; maxTokens: number }) => void;
  }
>(function ChatRunner(
  { minDelaySec: _minDelaySec = 1, maxDelaySec = 5, showControls: _showControls = true, onEmoteMapChange, onStatusChange },
  ref
) {
  const [running, setRunning] = useState(false);
  type ChatMsg = { username?: string; content: string };
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [, setLoading] = useState(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const [userColors, setUserColors] = useState<Record<string, string>>({});
  const [rawLog, setRawLog] = useState<string>("");
  const rawEndRef = useRef<HTMLDivElement | null>(null);
  const rawLogRef = useRef<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const userColorsRef = useRef<Record<string, string>>({});
  const [callDelaySec, setCallDelaySec] = useState(0.5);
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastStats, setLastStats] = useState({ total: 0, banned: 0, noColon: 0, accepted: 0 });
  const [emoteMap, setEmoteMap] = useState<Record<string, { url: string; source: "twitch" | "bttv" | "7tv" }>>({});
  const [, setEmoteLoading] = useState(false);
  const globalsLoadedRef = useRef(false);
  const defaultChannelsLoadedRef = useRef(false);
  const [randomizeDelay, setRandomizeDelay] = useState(true);
  const [maxRandomDelaySec, setMaxRandomDelaySec] = useState<number>(maxDelaySec);
  const [forceUsername, setForceUsername] = useState<boolean>(true);
  const [temperature, setTemperature] = useState<number>(1);
  const [maxTokens, setMaxTokens] = useState<number>(60);
  const palette = useRef<string[]>([
    "text-red-600",
    "text-orange-600",
    "text-amber-600",
    "text-yellow-600",
    "text-lime-600",
    "text-green-600",
    "text-emerald-600",
    "text-teal-600",
    "text-cyan-600",
    "text-sky-600",
    "text-blue-600",
    "text-indigo-600",
    "text-violet-600",
    "text-purple-600",
    "text-fuchsia-600",
    "text-pink-600",
    "text-rose-600",
  ]);

  // Valid-username replacement mapping
  const validUsernamesRef = useRef<string[]>([]);
  const usedValidSetRef = useRef<Set<string>>(new Set());
  const usernameMapRef = useRef<Map<string, string>>(new Map()); // original (lowercased) -> valid username
  // Mention exclude list (case-insensitive, without leading @)
  const mentionExcludeSetRef = useRef<Set<string>>(new Set());
  // Streamer names (case-insensitive) special handling
  const streamerNamesSetRef = useRef<Set<string>>(new Set(["deme", "ludwig", "shxtou", "shoto", "lud", "joeyzerotv", "merryweather", "jamsvirtual", "porcelainmaid", "dougdoug"]));

  // Banned words (case-insensitive, exact token match on space-split)
  const bannedListRef = useRef<string[]>([
    'racism',
    'sexism',
    'sex',
    'rape',
    'hate',
    'terror',
    'terrorist',
    'alt right',
    'leftist',
    'white supremacist',
    'kys',
    'kill yourself',
    'keep yourself safe',
    'suicide',
    'self harm',
    'hate speech',
    'rape culture',
    'transphobia',
    'homophobic',
    'transphobic',
    'homophobe',
    'transphobe',
    'nazi',
    'nazism',
    'nuga',
  ]);
  const bannedSetRef = useRef<Set<string>>(new Set(bannedListRef.current.map((w) => w.toLowerCase())));

  // Pick an unused valid username; if all are used or list empty, fall back to the first or the original
  const pickUnusedValid = useCallback((fallback: string): string => {
    const list = validUsernamesRef.current ?? [];
    if (list.length === 0) return fallback;
    // Prefer first unused deterministically
    for (const candidate of list) {
      if (!usedValidSetRef.current.has(candidate)) {
        usedValidSetRef.current.add(candidate);
        return candidate;
      }
    }
    // All used; reuse randomly
    const idx = Math.floor(Math.random() * list.length);
    return list[idx] ?? fallback;
  }, []);

  const getOrAssignMappedUsername = useCallback((original: string): string => {
    const key = (original ?? "").trim().toLowerCase();
    if (!key) return original;
    const existing = usernameMapRef.current.get(key);
    if (existing) return existing;
    const mapped = pickUnusedValid(original);
    usernameMapRef.current.set(key, mapped);
    return mapped;
  }, [pickUnusedValid]);

  // Replace @streamer mentions -> @JoeyZeroTV (always)
  const replaceStreamerMentions = useCallback((text: string): string => {
    if (!text) return text;
    return text.replace(/@([A-Za-z0-9_]+)/g, (m, p1: string) => {
      const norm = (p1 ?? "").toLowerCase();
      if (streamerNamesSetRef.current.has(norm)) return "@JoeyZeroTV";
      return m;
    });
  }, []);

  // Replace non-streamer @mentions with mapped valid usernames (only when forceUsername is enabled)
  const replaceOtherMentions = useCallback((text: string): string => {
    if (!text) return text;
    return text.replace(/@([A-Za-z0-9_]+)/g, (m, p1: string) => {
      const raw = p1 ?? "";
      const norm = raw.toLowerCase();
      if (norm === "joeyzerotv") return m; // keep mapped streamer mention
      if (streamerNamesSetRef.current.has(norm)) return m; // streamer handled separately
      if (mentionExcludeSetRef.current.has(norm)) return m;
      const mapped = getOrAssignMappedUsername(raw);
      return `@${mapped}`;
    });
  }, [getOrAssignMappedUsername]);

  // Replace standalone streamer names, ignoring any text inside [ ... ] brackets
  const replaceStreamerNamesInContent = useCallback((content: string): string => {
    const bracketRe = /\[[^\]]+\]/g;
    // Compute case style from non-bracket text only
    const nonBracketText = content.replace(bracketRe, "");
    const isAllCaps = /[A-Za-z]/.test(nonBracketText) && nonBracketText === nonBracketText.toUpperCase();
    const replacement = isAllCaps ? "JOEY" : "Joey";

    let result = "";
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = bracketRe.exec(content)) !== null) {
      const before = content.slice(lastIndex, m.index);
      // Replace in non-bracket segment by exact space-delimited tokens
      if (before) {
        const seg = before
          .split(" ")
          .map((tok) => {
            const norm = tok.toLowerCase();
            return streamerNamesSetRef.current.has(norm) ? replacement : tok;
          })
          .join(" ");
        result += seg;
      }
      // Append bracket segment unchanged
      result += m[0];
      lastIndex = bracketRe.lastIndex;
    }
    // Tail segment
    const tail = content.slice(lastIndex);
    if (tail) {
      const seg = tail
        .split(" ")
        .map((tok) => {
          const norm = tok.toLowerCase();
          return streamerNamesSetRef.current.has(norm) ? replacement : tok;
        })
        .join(" ");
      result += seg;
    }
    return result;
  }, []);

  const ensureColorFor = useCallback((username: string) => {
    setUserColors((prev): Record<string, string> => {
      if (prev[username]) return prev;
      const len = palette.current.length;
      const idx = len > 0 ? Math.floor(Math.random() * len) : 0;
      const color = palette.current[idx] ?? "text-gray-600";
      return { ...prev, [username]: color };
    });
  }, []);

  const parseIncomingWithStats = useCallback(
    (raw: string): { messages: ChatMsg[]; stats: { total: number; banned: number; noColon: number; accepted: number } } => {
      // Helper: remove trailing broken bracket and drop bracketed emotes that are not in emoteMap
      const stripUnknownBracketedEmotes = (text: string): string => {
        if (!text) return text;
        // Remove any trailing broken emote signal like "[xyz"
        let out = text.replace(/\[[^\]]*$/g, "");
        // Keep only bracketed emotes that exist in our map; drop others
        out = out.replace(/\[([^\]]+)\]/g, (_m, p1: string) => {
          const key = (p1 ?? "").toLowerCase();
          return emoteMap[p1] || emoteMap[key] ? `[${p1}]` : "";
        });
        return out;
      };
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const out: ChatMsg[] = [];
      let banned = 0;
      let noColon = 0;
      for (const line of lines) {
        const m = /^([^:]+):\s*(.*)$/.exec(line);
        if (m) {
          const username = m[1]?.trim();
          const originalContent = m[2] ?? "";
          const hasBanned = originalContent
            .split(" ")
            .some((tok) => bannedSetRef.current.has(tok.toLowerCase()));
          if (hasBanned) {
            banned += 1;
            continue;
          }
          // Speaker username mapping: never map streamer names
          const isStreamer = (username ?? "").trim().length > 0 && streamerNamesSetRef.current.has((username ?? "").toLowerCase());
          const mappedUsername = forceUsername && username && !isStreamer ? getOrAssignMappedUsername(username) : (username ?? undefined);
          // Content replacements
          let content = originalContent;
          // Always map @streamer -> @JoeyZeroTV
          content = replaceStreamerMentions(content);
          // Map other mentions only when forceUsername enabled
          if (forceUsername) {
            content = replaceOtherMentions(content);
          }
          // Always replace standalone streamer names (non-emote tokens)
          content = replaceStreamerNamesInContent(content);
          // Remove broken/unknown bracketed emotes so they don't show in chat or raw log
          content = stripUnknownBracketedEmotes(content);
          // If message becomes empty after removing all emotes, skip it to avoid biasing the raw log
          const contentWithoutEmotes = content.replace(/\[[^\]]+\]/g, " ").trim();
          if (contentWithoutEmotes.length === 0) {
            continue;
          }
          if (mappedUsername) ensureColorFor(mappedUsername);
          out.push({ username: mappedUsername, content });
        } else {
          noColon += 1;
        }
      }
      return { messages: out, stats: { total: lines.length, banned, noColon, accepted: out.length } };
    },
    [ensureColorFor, replaceStreamerMentions, replaceOtherMentions, replaceStreamerNamesInContent, forceUsername, getOrAssignMappedUsername, emoteMap]
  );

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useImperativeHandle(ref, () => ({
    appendToRawLog: (text: string) => {
      setRawLog((prev) => {
        const next = prev ? `${prev}\n${text}` : text;
        rawLogRef.current = next;
        return next;
      });
    },
    start: () => {
      setRunning(true);
    },
    stop: () => {
      setRunning(false);
      runningRef.current = false;
      // clear pending delayed displays when stopping
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    },
    setCallDelay: (sec: number) => setCallDelaySec(Math.max(0, sec)),
    addChannel: async (username: string) => {
      await addChannel(username);
    },
    setRandomizedDelay: (enabled: boolean) => setRandomizeDelay(Boolean(enabled)),
    setMaxRandomDelay: (sec: number) => setMaxRandomDelaySec(Math.max(0, Math.min(60, Math.floor(sec)))),
    setForceUsername: (enabled: boolean) => setForceUsername(Boolean(enabled)),
    setTemperature: (t: number) => setTemperature(Math.max(0, Math.min(2, Number.isFinite(t) ? t : 1))),
    setMaxTokens: (n: number) => setMaxTokens(Math.max(5, Math.min(200, Math.floor(Number.isFinite(n) ? n : 60)))),
  }));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runningRef.current = false;
      // clear any pending delayed displays
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);


  // Keep a live ref of the raw log for prompt building inside async loops
  useEffect(() => {
    rawLogRef.current = rawLog;
  }, [rawLog]);

  // Keep a live ref of userColors for immediate access during emits
  useEffect(() => {
    userColorsRef.current = userColors;
  }, [userColors]);

  // Connect to WebSocket server (relay parsed chat to other clients)
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
      wsRef.current = ws;
      ws.onopen = () => {
        // connected
      };
      ws.onmessage = () => {
        // ChatRunner does not consume messages
      };
      ws.onerror = () => {
        // ignore
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };
    } catch {
      // ignore
    }
    return () => {
      try {
        ws?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, []);

  const emitParsed = useCallback((msgs: ChatMsg[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const m of msgs) {
      const username = m.username ?? null;
      const payload = {
        username,
        usernameClass: username ? userColorsRef.current[username] ?? "" : "",
        text: m.content,
      };
      try {
        ws.send(JSON.stringify({ type: "chat", payload }));
      } catch {
        // ignore
      }
    }
  }, []);

  // Fetch global emotes once on mount
  useEffect(() => {
    if (globalsLoadedRef.current) return;
    globalsLoadedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/emotes/global", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as { emotes?: Array<{ name: string; url: string; source: "twitch" | "bttv" | "7tv" }> };
        const list = data.emotes ?? [];
        if (!Array.isArray(list)) return;
        setEmoteMap((prev) => {
          const next = { ...prev };
          for (const e of list) {
            if (e?.name && e?.url) {
              next[e.name] = { url: e.url, source: e.source };
              next[e.name.toLowerCase()] = { url: e.url, source: e.source };
            }
          }
          return next;
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  // Load valid usernames for mapping
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/usernames", { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { usernames?: string[] };
        const list = Array.isArray(data.usernames) ? data.usernames : [];
        validUsernamesRef.current = list;
      } catch {
        // ignore
      }
    })();
  }, []);

  // Emit status changes upwards
  useEffect(() => {
    onStatusChange?.({ queuedCount, lastStats, callDelaySec, maxRandomDelaySec, temperature, maxTokens });
  }, [queuedCount, lastStats, callDelaySec, maxRandomDelaySec, temperature, maxTokens, onStatusChange]);

  // Emit emote map updates upwards
  useEffect(() => {
    onEmoteMapChange?.(emoteMap);
  }, [emoteMap, onEmoteMapChange]);

  const getCompletionViaApi = useCallback(async (prompt: string): Promise<string> => {
    try {
      const res = await fetch("/api/completion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, temperature, max_tokens: maxTokens, stop: "\n" }),
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) return `(Error ${res.status}) ${text}`;
      try {
        const parsed = JSON.parse(text) as { choices?: Array<{ text?: string }> };
        return parsed?.choices?.[0]?.text ?? text;
      } catch {
        return text;
      }
    } catch {
      return "(Failed to load completion)";
    }
  }, [temperature, maxTokens]);

  const addChannel = async (name: string) => {
    if (!name) return;
    setEmoteLoading(true);
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
          if (e?.name && e?.url) {
            next[e.name] = { url: e.url, source: e.source };
            next[e.name.toLowerCase()] = { url: e.url, source: e.source };
          }
        }
        return next;
      });
    } finally {
      setEmoteLoading(false);
    }
  };

  // Load default channels once on mount
  useEffect(() => {
    if (defaultChannelsLoadedRef.current) return;
    defaultChannelsLoadedRef.current = true;
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
  }, []);

  // Controls (add channel, sliders, start/stop) are managed in ControlsPanel.
  // ChatRunner exposes imperative methods via ref and focuses on chat display + raw log.

  const tick = useCallback(async () => {
    if (!runningRef.current || !mountedRef.current) return;
    setLoading(true);
    try {
      // Build prompt: 75% chance include last 50 lines of raw log, then a trailing 'CHAT:'
      let prompt = "CHAT:";
      if (Math.random() < 0.3) {
        const lines = rawLogRef.current ? rawLogRef.current.split("\n") : [];
        const last = lines.slice(-50).filter((l) => l.length > 0);
        prompt = (last.length ? last.join("\n") + "\n" : "") + "CHAT:";
      } else {
        const last = rawLogRef.current ? rawLogRef.current.split("\n").filter((l) => l.startsWith("STREAMER:")) : [];
        prompt = (last.length ? last.join("\n") + "\n" : "") + "CHAT:";
      }
      const result = await getCompletionViaApi(prompt);
      if (!mountedRef.current) return;
      // Parse and filter first according to rules; if nothing valid, skip both outputs
      const { messages: parsed, stats } = parseIncomingWithStats(result);
      setLastStats(stats);
      if (parsed.length === 0) {
        // Still continue the loop for the next request
      } else {
        // Append immediately to raw log as a concatenated block
        const acceptedText = parsed
          .map((m) => (m.username ? `${m.username}: ${m.content}` : m.content))
          .join("\n");
        setRawLog((prev) => (prev ? `${prev}\nCHAT: ${acceptedText}` : `CHAT: ${acceptedText}`));
        if (randomizeDelay) {
          // schedule the display after a random delay while immediately firing next request
          const minMs = 0;
          const maxMs = Math.max(minMs, Math.floor(maxRandomDelaySec * 1000));
          const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
          const id = window.setTimeout(() => {
            if (!mountedRef.current) return;
            setMessages((prev) => {
              const next = [...prev, ...parsed];
              return next.slice(-200);
            });
            emitParsed(parsed);
            // remove consumed timeout id
            timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
            setQueuedCount((c) => Math.max(0, c - 1));
          }, randomMs);
          timeoutsRef.current.push(id);
          setQueuedCount((c) => c + 1);
        } else {
          // Immediately add messages without synthetic delay
          setMessages((prev) => {
            const next = [...prev, ...parsed];
            return next.slice(-200);
          });
          emitParsed(parsed);
        }
      }
    } finally {
      setLoading(false);
    }
    if (!runningRef.current || !mountedRef.current) return;
    // Optional delay between successive LLM calls (controlled by slider)
    if (callDelaySec > 0) {
      await new Promise((r) => setTimeout(r, Math.floor(callDelaySec * 1000)));
    }
    // Request the next completion
    void tick();
  }, [parseIncomingWithStats, callDelaySec, randomizeDelay, getCompletionViaApi, maxRandomDelaySec, emitParsed]);

  // When toggled to running, start the tick loop after mount/commit
  useEffect(() => {
    if (running && mountedRef.current) {
      runningRef.current = true;
      void tick();
    }
  }, [running, tick]);

  // Auto-scroll to bottom when a new message arrives
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Auto-scroll for raw log
  useEffect(() => {
    rawEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [rawLog]);

  // (controls removed; start/stop handled via imperative API)

  return (
    <div className="flex w-full flex-col gap-4">
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[320px] w-full p-4">
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => {
                const colorClass = m.username ? userColors[m.username] ?? "" : "";
                const renderContent = (text: string) => {
                  // Render bracketed emotes [name] as images if known; drop them if unknown.
                  // All other text is rendered verbatim; we no longer treat plain tokens as emotes.
                  const els: React.ReactNode[] = [];
                  // Remove broken trailing emote signal (opened but not closed)
                  const safeText = text.replace(/\[[^\]]*$/g, "");
                  const re = /\[([^\]]+)\]/g;
                  let last = 0;
                  let k = 0;
                  let match: RegExpExecArray | null;
                  while ((match = re.exec(safeText)) !== null) {
                    const before = safeText.slice(last, match.index);
                    if (before) {
                      els.push(
                        <span key={`t-${i}-${k++}`} className="whitespace-pre-wrap break-words">
                          {before}
                        </span>
                      );
                    }
                    const name: string = match[1] ?? "";
                    const key = name.toLowerCase();
                    const em = name ? (emoteMap[key] ?? emoteMap[name]) : undefined;
                    if (em?.url) {
                      els.push(
                        <img
                          key={`e-${i}-${k++}`}
                          src={em.url}
                          alt={name}
                          className="inline-block h-[1.25rem] align-[-0.2em]"
                        />
                      );
                    }
                    // if unknown emote, skip (remove)
                    last = re.lastIndex;
                  }
                  const tail = safeText.slice(last);
                  if (tail) {
                    els.push(
                      <span key={`t-${i}-${k++}`} className="whitespace-pre-wrap break-words">
                        {tail}
                      </span>
                    );
                  }
                  return <>{els}</>;
                };
                return (
                  <div key={i} className="text-sm">
                    {m.username ? (
                      <>
                        <span className={`font-bold ${colorClass}`}>{m.username}</span>
                        <span>: </span>
                        <span className="whitespace-pre-wrap break-words">{renderContent(m.content)}</span>
                      </>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{renderContent(m.content)}</span>
                    )}
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card className="">
        <CardHeader>
          <CardTitle>Raw Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[200px] w-full p-4">
            <pre className="whitespace-pre-wrap break-words text-xs">{rawLog}</pre>
            <div ref={rawEndRef} />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
});
