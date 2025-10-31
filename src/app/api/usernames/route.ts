import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(_req: NextRequest) {
  try {
    const file = path.resolve(process.cwd(), "valid_usernames.txt");
    const raw = await readFile(file, "utf8");
    const usernames = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return new Response(JSON.stringify({ usernames }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(JSON.stringify({ usernames: [] }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
