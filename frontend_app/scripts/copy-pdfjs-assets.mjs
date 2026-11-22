// Copies the PDF.js worker, character maps and standard fonts from the exact
// pdfjs-dist version react-pdf depends on into public/pdfjs/, so they are
// served as static files in both `next dev` and the static export.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const reactPdfDir = path.dirname(require.resolve("react-pdf/package.json"));
const pdfjsDir = path.dirname(
  createRequire(path.join(reactPdfDir, "package.json")).resolve("pdfjs-dist/package.json"),
);
const target = path.resolve("public/pdfjs");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(path.join(pdfjsDir, "build/pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
cpSync(path.join(pdfjsDir, "cmaps"), path.join(target, "cmaps"), { recursive: true });
cpSync(path.join(pdfjsDir, "standard_fonts"), path.join(target, "standard_fonts"), { recursive: true });
console.log(`Copied PDF.js assets from ${pdfjsDir} to public/pdfjs`);
