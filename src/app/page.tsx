"use client";

import { useRef, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ChatRunner, type ChatRunnerHandle } from "~/app/_components/chat-runner";
import { SpeechPanel } from "~/app/_components/speech-panel";
import { ControlsPanel } from "~/app/_components/controls-panel";

export default function Home() {
  const chatRef = useRef<ChatRunnerHandle | null>(null);
  const handleCommit = useCallback((text: string) => {
    chatRef.current?.appendToRawLog(text);
  }, []);
  const [status, setStatus] = useState<{
    queuedCount: number;
    lastStats: { total: number; banned: number; noColon: number; accepted: number };
    callDelaySec: number;
    maxRandomDelaySec: number;
    temperature: number;
    maxTokens: number;
  } | null>(null);
  const [emoteMap, setEmoteMap] = useState<Record<string, { url: string; source: "twitch" | "bttv" | "7tv" }>>({});

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <ChatRunner
                ref={chatRef}
                showControls={false}
                onStatusChange={setStatus}
                onEmoteMapChange={setEmoteMap}
              />
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <ControlsPanel chatRef={chatRef} status={status} emoteMap={emoteMap} />
          <SpeechPanel onCommit={handleCommit} />
        </div>
      </div>
    </main>
  );
}
