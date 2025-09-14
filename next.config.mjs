/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // iNaturalist (two common hosts)
      { protocol: "https", hostname: "static.inaturalist.org" },
      { protocol: "https", hostname: "inaturalist-open-data.s3.amazonaws.com" },

      // Wikimedia / Wikipedia
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikimedia.org" },
      { protocol: "https", hostname: "*.wikidata.org" }
    ]
  },
};
export default nextConfig;
