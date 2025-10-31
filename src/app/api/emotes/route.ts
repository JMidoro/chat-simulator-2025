import { NextResponse } from "next/server";
import { fetchChannelEmotes } from "~/server/actions/fetchEmotes";

export async function POST(req: Request) {
  try {
    const { username } = (await req.json()) as { username?: string };
    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }
    const emotes = await fetchChannelEmotes(username);
    return NextResponse.json({ emotes }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
