/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'static.inaturalist.org' },
      { protocol: 'https', hostname: 'inaturalist-open-data.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'api.inaturalist.org' },
      { protocol: 'https', hostname: 'www.inaturalist.org' }
    ],
  },
};
export default nextConfig;

