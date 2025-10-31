"use client";

import { useState, type RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import type { ChatRunnerHandle } from "~/app/_components/chat-runner";
import { Checkbox } from "~/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";

type Status = {
  queuedCount: number;
  lastStats: { total: number; banned: number; noColon: number; accepted: number };
  callDelaySec: number;
  maxRandomDelaySec: number;
  temperature: number;
  maxTokens: number;
};

export function ControlsPanel({
  chatRef,
  status,
  emoteMap,
}: {
  chatRef: RefObject<ChatRunnerHandle | null>;
  status: Status | null;
  emoteMap: Record<string, { url: string; source: "twitch" | "bttv" | "7tv" }>;
}) {
  const [username, setUsername] = useState("");
  const callDelaySec = status?.callDelaySec ?? 0.5;
  const [randomize, setRandomize] = useState(true);
  const maxRandomDelaySec = status?.maxRandomDelaySec ?? 5;
  const [forceUser, setForceUser] = useState(true);
  const temperature = status?.temperature ?? 1;
  const maxTokens = status?.maxTokens ?? 60;
  // Group emotes by provider for tabs
  const entries = Object.entries(emoteMap);
  const twitch = entries.filter(([, m]) => m.source === "twitch");
  const bttv = entries.filter(([, m]) => m.source === "bttv");
  const stv = entries.filter(([, m]) => m.source === "7tv");
  const defaultTab = twitch.length ? "twitch" : bttv.length ? "bttv" : stv.length ? "7tv" : "twitch";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button onClick={() => chatRef.current?.start()}>Start</Button>
          <Button variant="destructive" onClick={() => chatRef.current?.stop()}>Stop</Button>
          {status && (
            <span className="text-sm text-muted-foreground">Queued: {status.queuedCount}</span>
          )}
        </div>
        {status && (
          <div className="text-xs text-muted-foreground">
            Last batch — total: {status.lastStats.total}, accepted: {status.lastStats.accepted}, banned: {status.lastStats.banned}, no-colon: {status.lastStats.noColon}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="text-sm w-36">Temperature: {temperature.toFixed(1)}</div>
          <Slider
            value={[temperature]}
            min={0}
            max={2}
            step={0.1}
            onValueChange={(v) => chatRef.current?.setTemperature(v?.[0] ?? 1)}
            className="w-full max-w-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm w-36">Max tokens: {maxTokens}</div>
          <Slider
            value={[maxTokens]}
            min={5}
            max={200}
            step={1}
            onValueChange={(v) => chatRef.current?.setMaxTokens(v?.[0] ?? 60)}
            className="w-full max-w-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm w-36">Call delay: {callDelaySec.toFixed(1)}s</div>
          <Slider
            value={[callDelaySec]}
            min={0}
            max={10}
            step={0.1}
            onValueChange={(v) => chatRef.current?.setCallDelay(v?.[0] ?? 0)}
            className="w-full max-w-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={randomize}
            onCheckedChange={(v) => {
              const val = v === true;
              setRandomize(val);
              chatRef.current?.setRandomizedDelay(val);
            }}
            id="randomize-delay"
          />
          <label htmlFor="randomize-delay" className="text-sm select-none">
            Randomized message delay
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={forceUser}
            onCheckedChange={(v) => {
              const val = v === true;
              setForceUser(val);
              chatRef.current?.setForceUsername(val);
            }}
            id="force-username"
          />
          <label htmlFor="force-username" className="text-sm select-none">
            Replace usernames (use valid_usernames.txt)
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm w-36">Max random: {maxRandomDelaySec.toFixed(0)}s</div>
          <Slider
            value={[maxRandomDelaySec]}
            min={0}
            max={60}
            step={1}
            onValueChange={(v) => chatRef.current?.setMaxRandomDelay(v?.[0] ?? 0)}
            className="w-full max-w-sm"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary">Channels & Emotes</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Channels & Emotes</SheetTitle>
              <SheetDescription>Manage channels and view loaded emotes.</SheetDescription>
            </SheetHeader>
            <div className="p-4 pt-0 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add channel username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="max-w-xs"
                />
                <Button onClick={() => (username.trim() ? chatRef.current?.addChannel(username.trim()) : undefined)}>
                  Add
                </Button>
              </div>
              {entries.length > 0 && (
                <div className="mt-2">
                  <div className="text-sm text-muted-foreground mb-2">
                    Loaded Emotes ({entries.length})
                  </div>
                  <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList>
                      <TabsTrigger value="twitch">Twitch ({twitch.length})</TabsTrigger>
                      <TabsTrigger value="bttv">BTTV ({bttv.length})</TabsTrigger>
                      <TabsTrigger value="7tv">7TV ({stv.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="twitch">
                      <ScrollArea className="h-[60vh] w-full rounded border p-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {twitch.map(([code, meta]) => (
                            <div key={code} className="flex items-center gap-2 text-xs">
                              <img src={meta.url} alt={code} className="h-5 w-5" />
                              <span className="font-mono leading-4">{code}</span>
                            </div>
                          ))}
                          {twitch.length === 0 && (
                            <div className="text-xs text-muted-foreground">No Twitch emotes loaded.</div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="bttv">
                      <ScrollArea className="h-[60vh] w-full rounded border p-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {bttv.map(([code, meta]) => (
                            <div key={code} className="flex items-center gap-2 text-xs">
                              <img src={meta.url} alt={code} className="h-5 w-5" />
                              <span className="font-mono leading-4">{code}</span>
                            </div>
                          ))}
                          {bttv.length === 0 && (
                            <div className="text-xs text-muted-foreground">No BTTV emotes loaded.</div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="7tv">
                      <ScrollArea className="h-[60vh] w-full rounded border p-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {stv.map(([code, meta]) => (
                            <div key={code} className="flex items-center gap-2 text-xs">
                              <img src={meta.url} alt={code} className="h-5 w-5" />
                              <span className="font-mono leading-4">{code}</span>
                            </div>
                          ))}
                          {stv.length === 0 && (
                            <div className="text-xs text-muted-foreground">No 7TV emotes loaded.</div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
            <SheetFooter />
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
