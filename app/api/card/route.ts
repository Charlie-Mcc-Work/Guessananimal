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

function bestPhotoUrl(photo: any): string | null {
  if (photo?.original_url) return photo.original_url as string;
  if (photo?.large_url) return photo.large_url as string;
  if (photo?.url) return (photo.url as string).replace('square', 'large');
  return null;
}

function toCard(obs: any): Card | null {
  if (!obs || !obs.taxon) return null;
  const photo = Array.isArray(obs.photos) && obs.photos.length > 0 ? obs.photos[0] : null;
  const imageUrl = bestPhotoUrl(photo);
  if (!imageUrl) return null;

  const common =
    obs.taxon.preferred_common_name ||
    obs.taxon.english_common_name ||
    obs.taxon.name ||
    'Unknown';

  const scientific = obs.taxon.name || 'Unknown';
  const license = licenseLabel(photo?.license_code || obs.license_code);
  const source = obs.uri || 'https://www.inaturalist.org';
  const attributions: string[] = [];
  if (photo?.attribution) attributions.push(photo.attribution);
  if (obs?.user?.name || obs?.user?.login) {
    attributions.push('Observer: ' + (obs.user.name || obs.user.login));
  }
  attributions.push('iNaturalist');

  return {
    imageUrl,
    commonName: common,
    scientificName: scientific,
    license,
    source,
    attributions,
  };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

async function fetchBatchINat(count: number): Promise<Card[]> {
  // Fetch more than we need, then filter to good items
  const perPage = Math.min(Math.max(count * 3, 30), 100);
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

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) return [];

  const json = await res.json().catch(() => null) as any;
  const results = Array.isArray(json?.results) ? json.results : [];
  const cards = results.map(toCard).filter(Boolean) as Card[];

  // De-dup by imageUrl and shuffle, then keep only "count"
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

export async function GET() {
  // Try a couple of times to get a decent batch
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const items = await fetchBatchINat(24);
      if (items.length > 0) {
        return NextResponse.json(
          { items },
          {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
              'CDN-Cache-Control': 'no-store',
              'Vercel-CDN-Cache-Control': 'no-store',
            },
          }
        );
      }
    } catch {
      // try again
    }
  }

  return NextResponse.json(
    { items: [] },
    { status: 502, headers: { 'Cache-Control': 'no-store' } }
  );
}

