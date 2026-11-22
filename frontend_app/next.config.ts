import type { NextConfig } from "next";

/**
 * The app is a fully client-side single page, exported as static files
 * (`npm run build` -> `out/`) so the FastAPI backend can serve it on the same
 * port in production. In development, `next dev` serves it on :3000 and calls
 * the API at NEXT_PUBLIC_API_URL (see .env.development).
 */
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
