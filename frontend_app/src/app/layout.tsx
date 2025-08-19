import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "../styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Connecting the Dots - Adobe Hackathon",
  description: "An intelligent PDF reading experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Adobe PDF Embed API Script */}
        <Script src="https://acrobatservices.adobe.com/view-sdk/viewer.js" strategy="beforeInteractive" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}