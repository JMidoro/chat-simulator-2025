import type { NextRequest } from "next/server";
import { env } from "~/env";

function ensureBareChatSuffix(basePrompt: string | undefined): string {
  const p = (basePrompt ?? "CHAT:").replace(/\s+$/u, "");
  if (p.endsWith("CHAT:")) return `${p} `;
  const needsNl = p.length > 0 && !p.endsWith("\n");
  return `${p}${needsNl ? "\n" : ""}CHAT: `;
}

export async function GET(req: NextRequest) {
  try {
    const hostHeader = req.headers.get("host") ?? "localhost";
    // Extract bare hostname (strip any port from the host header)
    const hostname = hostHeader.split(":")[0] ?? "localhost";

    const upstreamUrl = `http://${hostname}:5005/v1/completions`;

    const body = {
      prompt: ensureBareChatSuffix("CHAT:"),
      temperature: 1,
      max_tokens: 60,
      frequency_penalty: 0.8,
      repetition_penalty: 1.2,
      presence_penalty: 0.8,
      stop: "\n",
    };

    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        ...(env.LLM_API_KEY
          ? { Authorization: `Bearer ${env.LLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(body),
      // Never cache; we want a fresh completion each time
      cache: "no-store",
    });

    const text = await upstreamRes.text();

    return new Response(text, {
      status: upstreamRes.ok ? 200 : upstreamRes.status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("/api/completion error:", err);
    return new Response("Error fetching completion", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hostHeader = req.headers.get("host") ?? "localhost";
    const hostname = hostHeader.split(":")[0] ?? "localhost";

    const upstreamUrl = `http://${hostname}:5005/v1/completions`;

    const {
      prompt,
      temperature = 1,
      max_tokens = 60,
      stop = "\n",
    } = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      temperature?: number;
      max_tokens?: number;
      stop?: string;
    };

    const body = {
      prompt: ensureBareChatSuffix(prompt),
      temperature,
      max_tokens,
      stop,
    };

    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        ...(env.LLM_API_KEY
          ? { Authorization: `Bearer ${env.LLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstreamRes.text();

    return new Response(text, {
      status: upstreamRes.ok ? 200 : upstreamRes.status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("/api/completion POST error:", err);
    return new Response("Error fetching completion", { status: 500 });
  }
}
