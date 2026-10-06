/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/studio/media": ["./vendor/media-runtime/**"],
    "/api/studio/media/jobs": ["./vendor/media-runtime/**"],
    "/api/studio/media/worker": ["./vendor/media-runtime/**"],
    "/api/studio/starter-asset": ["./assets/originals/*.png"],
  },
  // These routes only serve private Storage objects and packaged native codecs.
  // Prevent dynamic filesystem tracing from duplicating unrelated starter artwork.
  outputFileTracingExcludes: {
    "/api/studio/media": ["./public/**", "./assets/**"],
    "/api/studio/media/jobs": ["./public/**", "./assets/**"],
    "/api/studio/media/worker": ["./public/**", "./assets/**"],
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
