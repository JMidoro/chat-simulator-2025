"use client";

import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useEffect, useRef, useState } from "react";

export function SpeechPanel({ onCommit }: { onCommit?: (text: string) => void }) {
  const [mounted, setMounted] = useState(false);
  const onCommitRef = useRef(onCommit);
  const {
    transcript,
    listening,
    browserSupportsSpeechRecognition,
    resetTranscript,
  } = useSpeechRecognition();

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  // Avoid SSR/client markup mismatch by deferring render until mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep latest onCommit without re-creating the debounce effect
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Debounce transcript; after 1.5s of inactivity, commit and reset
  useEffect(() => {
    if (!transcript) return;
    const id = window.setTimeout(() => {
      const text = transcript.trim();
      if (text) {
        onCommitRef.current?.(`STREAMER: ${text}`);
        resetTranscript();
      }
    }, 1500);
    return () => clearTimeout(id);
  }, [transcript, resetTranscript]);

  if (!mounted) {
    return null;
  }

  if (!browserSupportsSpeechRecognition) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-sm text-muted-foreground">
            Browser does not support speech recognition.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Transcript</CardTitle>
          <div className="text-sm text-muted-foreground">
            Microphone: {listening ? "on" : "off"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          onClick={() =>
            listening
              ? SpeechRecognition.stopListening()
              : SpeechRecognition.startListening({ continuous: true })
          }
          variant={listening ? "destructive" : "default"}
        >
          {listening ? "Stop" : "Start"}
        </Button>
        <ScrollArea className="h-[320px] w-full p-4">
          <pre className="whitespace-pre-wrap break-words text-sm">{transcript}</pre>
          <div ref={endRef} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
