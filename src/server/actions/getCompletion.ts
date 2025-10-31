"use server";

import { headers } from "next/headers";
import { env } from "~/env";
import { z } from "zod";

function ensureBareChatSuffix(basePrompt?: string): string {
  const p = (basePrompt ?? "CHAT:").replace(/\s+$/u, "");
  if (p.endsWith("CHAT:")) return `${p} `;
  const needsNl = p.length > 0 && !p.endsWith("\n");
  return `${p}${needsNl ? "\n" : ""}CHAT: `;
}

export async function getCompletion(prompt?: string): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const hostname = host.split(":")[0] ?? "localhost";
  const upstreamUrl = `http://${hostname}:5005/v1/completions`;

  try {
    const ensuredPrompt = ensureBareChatSuffix(prompt);
    const res = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: ensuredPrompt,
        temperature: 1,
        max_tokens: 60,
        stop: "\n",
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) return `(Error ${res.status}) ${text}`;

    // Validate structure and return choices[0].text if present, else raw text
    const CompletionSchema = z.object({
      choices: z.array(z.object({ text: z.string() })),
    });
    const parsed = CompletionSchema.safeParse(JSON.parse(text) as unknown);
    if (!parsed.success) return text;
    const first = parsed.data.choices[0]?.text ?? "";
    return first;
  } catch {
    return "(Failed to load completion)";
  }
}
