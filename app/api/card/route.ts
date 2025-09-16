// app/api/card/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";            // fast startup for small handlers
export const dynamic = "force-dynamic";   // never pre-render
export const revalidate = 0;              // disable ISR
export const fetchCache = "force-no-store";

type Card = {
  imageUrl: string;
  commonName: string;
  scientificName: string;
  license: string;
  source: string;
  attributions: string[];
};

const SAMPLE: Card[] = [
  {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg",
    commonName: "Domestic cat",
    scientificName: "Felis catus",
    license: "CC BY-SA",
    source: "https://commons.wikimedia.org",
    attributions: ["Wikimedia Commons"],
  },
  {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6e/Golde33443.jpg",
    commonName: "Golden eagle",
    scientificName: "Aquila chrysaetos",
    license: "CC BY-SA",
    source: "https://commons.wikimedia.org",
    attributions: ["Wikimedia Commons"],
  },
  // …replace with your real pool / external fetch
];

export async function GET() {
  const idx = Math.floor(Math.random() * SAMPLE.length);
  const card = SAMPLE[idx];

  return NextResponse.json(card, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}

