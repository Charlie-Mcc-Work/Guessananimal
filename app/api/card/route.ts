import { NextResponse } from "next/server";
import { fetchCard } from "@/lib/sources";

/** Serverless endpoint returning a normalized animal "card".
 *  Optional query params:
 *   - silhouette=1 to hint the UI to render silhouette (you can also do this client-side)
 */
export const dynamic = "force-dynamic"; // avoid full static caching for variety

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const card = await fetchCard();
    // Edge caching hint (1h) – host dependent
    return NextResponse.json({ ...card, silhouette: searchParams.get("silhouette") === "1" }, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=300"
      }
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load animal" }, { status: 500 });
  }
}
