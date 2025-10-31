import { NextResponse } from "next/server";
import { fetchGlobalEmotes } from "~/server/actions/fetchEmotes";

export async function GET() {
  try {
    const emotes = await fetchGlobalEmotes();
    return NextResponse.json({ emotes }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
