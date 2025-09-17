// app/api/cards/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type Card = {
  imageUrl: string;
  commonName: string;
  scientificName: string;
  license: string;
  source: string;
  attributions: string[];
};

function licenseLabel(code?: string | null): string {
  if (!code) return 'All rights reserved / unknown';
  const c = code.toLowerCase();
  if (c === 'cc0') return 'CC0';
  if (c === 'cc-by') return 'CC BY';
  if (c === 'cc-by-sa') return 'CC BY-SA';
  if (c === 'cc-by-nc') return 'CC BY-NC';
  if (c === 'cc-by-nd') return 'CC BY-ND';
  if (c === 'cc-by-nc-sa') return 'CC BY-NC-SA';
  if (c === 'cc-by-nc-nd') return 'CC BY-NC-ND';
  return code.toUpperCase();
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ---------------- GBIF PRIMARY ----------------
   Pull a random window of animal occurrences with still images.
   Docs: https://www.gbif.org/developer/occurrence#search
   Params:
     - kingdomKey=1  => Animalia
     - mediaType=StillImage
     - hasCoordinate=true (helps quality)
   We randomize the offset heuristically.
------------------------------------------------ */
async function fetchGBIFBatch(count: number): Promise<Card[]> {
  // GBIF offset cap is large; we pick a broad random offset window.
  const offset = Math.floor(Math.random() * 200000); // heuristic
  const limit = Math.min(Math.max(count * 3, 60), 120);
  const url =
    'https://api.gbif.org/v1/occurrence/search' +
    '?kingdomKey=1' +
    '&mediaType=StillImage' +
    '&hasCoordinate=true' +
    '&limit=' + String(limit) +
    '&offset=' + String(offset);

  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) return [];

  const json: any = await res.json().catch(() => null);
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const cards: Card[] = [];

  for (const r of results) {
    // media can contain multiple; pick first still image
    const media = Array.isArray(r.media) ? r.media : [];
    const m = media.find((x: any) => {
      const type = (x?.type || '').toLowerCase();
      return type === 'stillimage' || type === 'image' || !!x?.identifier;
    });
    if (!m) continue;
    const imageUrl: string | null = (m.identifier as string) || null;
    if (!imageUrl) continue;

    const vernacular = r.vernacularName as string | undefined;
    const commonName = vernacular && vernacular.trim().length > 0 ? vernacular : (r.species || r.scientificName || 'Unknown');

    const scientific = r.scientificName || r.species || 'Unknown';
    // GBIF media license is often in m.license (full URI). Map basic labels when possible.
    let license = 'Unknown';
    const lic = (m.license as string) || (r.license as string) || '';
    if (lic) {
      const low = lic.toLowerCase();
      if (low.includes('cc0')) license = 'CC0';
      else if (low.includes('by-nc-nd')) license = 'CC BY-NC-ND';
      else if (low.includes('by-nc-sa')) license = 'CC BY-NC-SA';
      else if (low.includes('by-nc')) license = 'CC BY-NC';
      else if (low.includes('by-nd')) license = 'CC BY-ND';
      else if (low.includes('by-sa')) license = 'CC BY-SA';
      else if (low.includes('by')) license = 'CC BY';
      else license = lic;
    }

    const source = r.references || 'https://www.gbif.org';
    const attributions: string[] = [];
    if (r.recordedBy) attributions.push('Recorded by: ' + r.recordedBy);
    if (r.basisOfRecord) attributions.push('Basis: ' + r.basisOfRecord);
    attributions.push('GBIF');

    cards.push({
      imageUrl,
      commonName,
      scientificName: scientific,
      license,
      source,
      attributions,
    });
  }

  // Dedup by URL, shuffle, keep asked count
  const seen = new Set<string>();
  const dedup: Card[] = [];
  for (const c of cards) {
    if (!c.imageUrl) continue;
    if (seen.has(c.imageUrl)) continue;
    seen.add(c.imageUrl);
    dedup.push(c);
  }
  shuffle(dedup);
  return dedup.slice(0, count);
}

/* ---------------- iNaturalist FALLBACK ---------------- */
function bestINatPhotoUrl(photo: any): string | null {
  if (photo?.original_url) return photo.original_url as string;
  if (photo?.large_url) return photo.large_url as string;
  if (photo?.url) return (photo.url as string).replace('square', 'large');
  return null;
}
function toINatCard(obs: any): Card | null {
  const photo = Array.isArray(obs.photos) && obs.photos.length > 0 ? obs.photos[0] : null;
  const imageUrl = bestINatPhotoUrl(photo);
  if (!imageUrl) return null;

  const common =
    obs?.taxon?.preferred_common_name ||
    obs?.taxon?.english_common_name ||
    obs?.taxon?.name ||
    'Unknown';

  const scientific = obs?.taxon?.name || 'Unknown';
  const license = licenseLabel(photo?.license_code || obs?.license_code);
  const source = obs?.uri || 'https://www.inaturalist.org';
  const attributions: string[] = [];
  if (photo?.attribution) attributions.push(photo.attribution);
  if (obs?.user?.name || obs?.user?.login) {
    attributions.push('Observer: ' + (obs.user.name || obs.user.login));
  }
  attributions.push('iNaturalist');

  return { imageUrl, commonName: common, scientificName: scientific, license, source, attributions };
}
async function fetchINatBatch(count: number): Promise<Card[]> {
  const perPage = Math.min(Math.max(count * 3, 60), 100);
  const params = new URLSearchParams();
  params.set('per_page', String(perPage));
  params.append('has[]', 'photos');
  params.set('quality_grade', 'research');
  params.set('photo_license', 'cc0,cc-by,cc-by-sa,cc-by-nc');
  params.set('order_by', 'random');
  params.set('order', 'desc');
  params.set('locale', 'en');
  params.set('preferred_place_id', '1');

  const url = 'https://api.inaturalist.org/v1/observations?' + params.toString();
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) return [];

  const json: any = await res.json().catch(() => null);
  const results = Array.isArray(json?.results) ? json.results : [];
  const cards = results.map(toINatCard).filter(Boolean) as Card[];

  const seen = new Set<string>();
  const dedup: Card[] = [];
  for (const c of cards) {
    if (!seen.has(c.imageUrl)) {
      seen.add(c.imageUrl);
      dedup.push(c);
    }
  }
  shuffle(dedup);
  return dedup.slice(0, count);
}

/* ---------------- FINAL FALLBACK SAMPLE ---------------- */
const SAMPLE: Card[] = [
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/73/Lion_waiting_in_Namibia.jpg',
    commonName: 'Lion',
    scientificName: 'Panthera leo',
    license: 'CC BY-SA',
    source: 'https://commons.wikimedia.org',
    attributions: ['Wikimedia Commons'],
  },
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg',
    commonName: 'Domestic cat',
    scientificName: 'Felis catus',
    license: 'CC BY-SA',
    source: 'https://commons.wikimedia.org',
    attributions: ['Wikimedia Commons'],
  },
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/16/2012_Vulpes_vulpes_01.jpg',
    commonName: 'Red fox',
    scientificName: 'Vulpes vulpes',
    license: 'CC BY-SA',
    source: 'https://commons.wikimedia.org',
    attributions: ['Wikimedia Commons'],
  },
];

export async function GET() {
  // Try GBIF first
  try {
    const gbif = await fetchGBIFBatch(24);
    if (gbif.length > 0) {
      return NextResponse.json(
        { items: gbif },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
      );
    }
  } catch { /* ignore */ }

  // Fallback: iNaturalist
  try {
    const inat = await fetchINatBatch(24);
    if (inat.length > 0) {
      return NextResponse.json(
        { items: inat },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
      );
    }
  } catch { /* ignore */ }

  // Last resort: tiny sample
  return NextResponse.json(
    { items: SAMPLE },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  );
}

