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

// Map iNaturalist license_code -> human label
function licenseLabel(code?: string | null): string {
  if (!code) return "All rights reserved / unknown";
  const c = code.toLowerCase();
  switch (c) {
    case "cc0":
      return "CC0";
    case "cc-by":
      return "CC BY";
    case "cc-by-sa":
      return "CC BY-SA";
    case "cc-by-nc":
      return "CC BY-NC";
    case "cc-by-nd":
      return "CC BY-ND";
    case "cc-by-nc-sa":
      return "CC BY-NC-SA";
    case "cc-by-nc-nd":
      return "CC BY-NC-ND";
    default:
      return code.toUpperCase();
  }
}

// Prefer a large image; iNat photo URLs can be resized by replacing "square"
function bestPhotoUrl(photo: any): string | null {
  // iNat often provides multiple fields. Prefer original_url/large_url if present.
  if (photo?.original_url) return photo.original_url as string;
  if (photo?.large_url) return photo.large_url as string;
  if (photo?.url) {
    // Typical pattern: .../photos/<id>/square.jpg
    return (photo.url as string).replace("square", "large");
  }
  return null;
}

// Build a Card object from an iNaturalist observation
function toCard(obs: any): Card | null {
  if (!obs || !obs.taxon) return null;
  const photo = Array.isArray(obs.photos) && obs.photos.length > 0 ? obs.photos[0] : null;
  const imageUrl = bestPhotoUrl(photo);
  if (!imageUrl) return null;

  const common =
    obs.taxon.preferred_common_name ||
    obs.taxon.english_common_name ||
    obs.taxon.name || // fallback (scientific)
    "Unknown";

  const scientific = obs.taxon.name || "Unknown";
  const license = licenseLabel(photo?.license_code || obs.license_code);
  const source = obs.uri || "https://www.inaturalist.org";
  const attributions: string[] = [];

  // Try to add photographer & observer attribution if available
  if (photo?.attribution) attributions.push(photo.attribution);
  if (obs?.user?.name || obs?.user?.login) {
    attributions.push("Observer: " + (obs.user.name || obs.user.login));
  }
  attributions.push("iNaturalist");

  return {
    imageUrl,
    commonName: common,
    scientificName: scientific,
    license,
    source,
    attributions,
  };
}

async function fetchRandomINatObservation(): Promise<Card | null> {
  // Notes:
  // - has[]=photos ensures the observation has at least one photo
  // - quality_grade=research yields better-validated IDs (tweak if you want more variety)
  // - photo_license limits to reusable images (adjust to your needs)
  // - order_by=random gives a random record each time
  // - locale=en helps get English common names when available
  const params = new URLSearchParams();
  params.set("per_page", "1");
  params.append("has[]", "photos");
  params.set("quality_grade", "research");
  params.set("photo_license", "cc0,cc-by,cc-by-sa,cc-by-nc"); // adjust if you want NC or not
  params.set("order_by", "random");
  params.set("order", "desc");
  params.set("locale", "en");
  params.set("preferred_place_id", "1"); // global; can be tuned if you want

  const url = "https://api.inaturalist.org/v1/observations?" + params.toString();

  const res = await fetch(url, {
    // Edge runtime fetch; avoid caching so each call is fresh
    cache: "no-store",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    return null;
  }
  const json = await res.json().catch(() => null) as any;
  const results = json?.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const card = toCard(results[0]);
  return card;
}

export async function GET() {
  // Try a few times in case we get an observation without a usable photo URL
  for (let i = 0; i < 3; i++) {
    try {
      const card = await fetchRandomINatObservation();
      if (card) {
        return NextResponse.json(card, {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Vercel-CDN-Cache-Control": "no-store",
          },
        });
      }
    } catch {
      // ignore and retry
    }
  }

  // If iNaturalist is temporarily unavailable, fail gracefully
  return NextResponse.json(
    { error: "Upstream unavailable. Try again." },
    {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

