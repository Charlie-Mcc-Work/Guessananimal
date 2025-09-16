/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // keep optimizer ON globally; we bypass only the main image via `unoptimized`
    remotePatterns: [
      { protocol: "https", hostname: "static.inaturalist.org" },
      { protocol: "https", hostname: "inaturalist-open-data.s3.amazonaws.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikimedia.org" },
      { protocol: "https", hostname: "*.wikidata.org" },
    ],
  },
};
export default nextConfig;

