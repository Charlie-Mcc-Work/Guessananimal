// lib/sources.ts
import type { Card } from "./types";

/** Random int inclusive. */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Try iNaturalist observations first (research grade, with English common name). */
export async function fetchFromINat(signal?: AbortSignal): Promise<Card | null> {
  // Randomize iconic taxa for variety.
  const ICONIC = ["Mammalia","Aves","Reptilia","Amphibia","Actinopterygii","Arachnida","Insecta","Mollusca"];
  // Try several attempts to find a good, EN-named photo.
  for (let attempt = 0; attempt < 5; attempt++) {
    const page = randInt(1, 2000); // broaden page range to reduce repeats
    const iconic = ICONIC[randInt(0, ICONIC.length - 1)];
    const url = new URL("https://api.inaturalist.org/v1/observations");
    url.searchParams.set("photos", "true");
    url.searchParams.set("quality_grade", "research");
    url.searchParams.set("per_page", "1");
    url.searchParams.set("order", "desc");
    url.searchParams.set("order_by", "created_at");
    url.searchParams.set("page", String(page));
    url.searchParams.set("locale", "en");
    url.searchParams.set("iconic_taxa", iconic);

    const res = await fetch(url, { signal, cache: "no-store", headers: { "Accept-Language": "en" } });
    if (!res.ok) continue;
    const data = await res.json();
    const obs = data?.results?.[0];
    const photo = obs?.photos?.[0];
    const taxon = obs?.taxon;
    if (!obs || !photo || !taxon) continue;

    const common = taxon?.preferred_common_name || taxon?.english_common_name || "";
    if (!common) continue;

    const scientific = taxon?.name || "";
    const large = typeof photo?.url === "string" ? photo.url.replace("square", "large") : null;
    const license = photo?.license_code || "check source";
    const source = obs?.uri || "https://www.inaturalist.org";
    const photographer = photo?.attribution || (obs?.user?.name ? `© ${obs.user.name}` : "");

    const card: Card = {
      imageUrl: large || photo?.url,
      commonName: common,
      scientificName: scientific,
      license: String(license || ""),
      source,
      attributions: photographer ? [photographer] : []
    };

    if (card.imageUrl && card.commonName) return card;
  }
  return null;
}

/** Wikimedia fallback with well-known English names. */
const FALLBACK_TERMS = [
  "pangolin","axolotl","okapi","quokka","kakapo","fossa","saiga","maned wolf","shoebill",
  "markhor","tarsier","dugong","leafy seadragon","aye-aye","pink fairy armadillo","dhole",
  "spectacled bear","gelada","harpy eagle","glass frog","sarcastic fringehead","quoll","red panda"
];

export async function fetchFromWikimedia(signal?: AbortSignal) {
  const term = FALLBACK_TERMS[randInt(0, FALLBACK_TERMS.length - 1)];
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(term)}&limit=1`,
    { signal, cache: "no-store", headers: { "Accept-Language": "en" } }
  );
  if (!searchRes.ok) return null;
  const search = await searchRes.json();
  const page = search?.pages?.[0];
  if (!page) return null;

  const summaryRes = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`,
    { signal, cache: "no-store", headers: { "Accept-Language": "en" } }
  );
  if (!summaryRes.ok) return null;
  const summary = await summaryRes.json();
  const thumb = summary?.thumbnail?.source as string | undefined;
  const original = summary?.originalimage?.source as string | undefined;
  const imageUrl = original || thumb;
  if (!imageUrl) return null;

  const commonName = page?.title || term;

  const card: Card = {
    imageUrl,
    commonName,
    scientificName: summary?.titles?.normalized || commonName,
    license: "See Wikimedia page for license (usually CC BY-SA/PD)",
    source: summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    attributions: ["Wikimedia / Wikipedia contributors"]
  };
  return card;
}

/** Fetch a single Card with fallback + retry. */
export async function fetchCard(): Promise<Card> {
  const nat = await fetchFromINat().catch(() => null);
  if (nat) return nat;
  const wik = await fetchFromWikimedia().catch(() => null);
  if (wik) return wik;
  // Last-resort static fallback
  return {
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6e/Okapia_johnstoni_-Marwell_Wildlife%2C_UK-8a.jpg",
    commonName: "Okapi",
    scientificName: "Okapia johnstoni",
    license: "CC BY-SA via Wikimedia Commons",
    source: "https://en.wikipedia.org/wiki/Okapi",
    attributions: ["Wikimedia contributors"]
  };
}

