# Connecting the Dots — frontend

Next.js 16 / React 19 single-page app. PDFs are rendered with
[PDF.js](https://mozilla.github.io/pdf.js/) via `react-pdf`, so text selection
and highlights work directly on the page without screenshots.

## Run it

Requires Node.js 22.13 or newer. Start the backend first (see `../backend/README.md`), then:

```bash
npm install
npm run dev        # http://localhost:3000, calls the API at NEXT_PUBLIC_API_URL (.env.development)
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Static export to `out/`. The backend serves it when `FRONTEND_DIST` points there |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:e2e` | Playwright end-to-end tests against the real backend. Run `npm run build` first. Set `PW_CHANNEL=chrome` to use installed Chrome |

`predev` and `prebuild` copy the PDF.js worker, character maps and standard
fonts from the exact `pdfjs-dist` version react-pdf uses into `public/pdfjs/`
(git-ignored).

## How it fits together

```
src/
  app/                 layout (theme bootstrap), page, global styles + design tokens
  components/
    Workspace.tsx      three-panel shell: library · viewer · analysis; drag & drop upload
    AppHeader.tsx      backend/AI status, theme toggle, panel toggles on small screens
    library/           document list (indexing status, retry, delete) and outline
    viewer/PdfViewer   lazy page rendering, zoom, selection → "Find connections", highlights
    analysis/          connections, insights and podcast tabs
    ui/                Button, Tabs, Toast, EmptyState/Notice, Spinner/Skeleton
  hooks/               useDocuments, useAnalysis, useHealth, useTheme
  lib/                 api client, types (mirror backend/app/schemas.py), browser speech
```

- **Selection flow:** selecting text in the viewer shows a *Find connections*
  button. Results open in the right panel, and clicking a card opens the source
  document at the right page with the passage highlighted.
- **Podcast audio:** plays the Gemini-voiced WAV when the backend provides one,
  and otherwise reads the script with the browser's `speechSynthesis`.
- **Theming:** colours are semantic CSS variables in `globals.css` (light and
  dark). Components never use raw palette colours.
- **Responsive:** below 1024px the library becomes a drawer, and below 1280px
  so does the analysis panel.
