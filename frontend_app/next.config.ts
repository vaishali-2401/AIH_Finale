import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Optimize for performance
  experimental: {
    optimizePackageImports: ['@google/generative-ai']
  },
  
  // Compress images
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  
  // SWC minification is enabled by default in Next.js 15
  
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              'clipboard-read=(self "https://acrobatservices.adobe.com"), clipboard-write=(self "https://acrobatservices.adobe.com")',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
