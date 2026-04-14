# FlipScanner

Collectibles resale copilot. Point a camera at a Beanie Baby, vinyl, card, or vintage find — get identification, live sold comps, and a BUY/PASS/MAYBE verdict with a target buy price. Powered by **xAI Grok** vision + live web search in a single round trip.

## Stack

- **Next.js 14** (App Router, TypeScript, strict)
- **Tailwind** for styling
- **lucide-react** icons
- **idb** for IndexedDB persistence (scan history)
- **xAI Grok API** — `grok-4-1-fast` for vision + agentic live search

## Architecture

```
┌─────────────────────┐          ┌──────────────────────┐         ┌────────────────┐
│  Client (app/page)  │          │  /api/analyze route  │         │    xAI Grok    │
│                     │          │                      │         │                │
│  • Camera/upload    │  POST    │  • Validates input   │  HTTPS  │  grok-4-1-fast │
│  • Resize to 1600px │ ───────▶ │  • Builds prompt     │ ──────▶ │  vision +      │
│  • Tailwind UI      │   JSON   │  • Calls xAI         │  Bearer │  live search   │
│  • IndexedDB (idb)  │          │  • Parses JSON       │         │  (web + X)     │
│                     │ ◀─────── │                      │ ◀────── │                │
└─────────────────────┘  result  └──────────────────────┘  JSON   └────────────────┘
```

The API key lives **only on the server** (`XAI_API_KEY`). The client never sees it.

## Setup

```bash
cd flipscanner
pnpm install          # or npm install / yarn
cp .env.example .env.local
# edit .env.local and paste your xAI key
pnpm dev
```

Open http://localhost:3000.

> **Camera note:** `getUserMedia` requires HTTPS on mobile. `localhost` works in desktop dev, but to test on a phone you'll need either an HTTPS tunnel (ngrok, cloudflared) or a real deployment.

## Deploy

### Vercel (recommended)

```bash
pnpm build            # sanity check
vercel                # follow prompts
vercel env add XAI_API_KEY production
```

Works on the Hobby tier. The `/api/analyze` route has `maxDuration = 60` for slow Grok searches.

### Cloudflare Pages / self-hosted

Standard Next.js output works. If you need Edge runtime, change `runtime = 'nodejs'` in `app/api/analyze/route.ts` — but Node runtime is preferred here for the longer timeout.

## How the engine works

Every scan sends 1-4 images + category/condition/price hints to the server route. The route builds a structured prompt instructing Grok to:

1. Identify the item precisely (maker, year, variant, edition)
2. Run 1-3 live web searches for **sold** comps (eBay + X)
3. Assess condition from the images
4. Return a strict JSON object with the verdict

`response_format: { type: "json_object" }` + a schema-in-prompt keeps output parseable. Fallback parsing handles edge cases (fenced blocks, preamble text).

### Cost per scan

Rough ballpark — confirm current rates at [x.ai/api](https://x.ai/api):

- Input tokens: ~2-6k depending on image detail
- Output tokens: ~500-1500
- Live search: **$0.025 per source retrieved**, capped at `max_search_results: 15` → max ~$0.38/scan in search, typically much less

Budget ~$0.05-$0.40 per scan total. The `max_search_results` cap in `app/api/analyze/route.ts` is your cost knob.

## Configuration

| Env var       | Default          | Description                             |
| ------------- | ---------------- | --------------------------------------- |
| `XAI_API_KEY` | *(required)*     | From https://console.x.ai               |
| `XAI_MODEL`   | `grok-4-1-fast`  | Override to `grok-4` for more precision |

## File map

```
app/
  layout.tsx              # root layout, metadata, viewport
  page.tsx                # main client UI (scan / results / history)
  globals.css             # tailwind + iOS tweaks
  api/analyze/route.ts    # THE ENGINE — xAI call + parsing
lib/
  types.ts                # ScanResult, AnalyzeRequest, ImageSlot
  storage.ts              # IndexedDB wrapper (idb)
```

## Known constraints

- **Image size**: client resizes to 1600px max / JPEG q=0.85 before upload. Up to 4 images per scan. `next.config.mjs` bumps body limit to 15mb.
- **Camera on iOS**: needs a user gesture to start; already handled.
- **History**: stored in IndexedDB, so per-browser, per-device. No cloud sync.
- **Grok JSON mode**: prompt explicitly says "JSON"; if a future model version rejects JSON mode with images, the fallback parser catches fenced/raw output.

## Extending

- **Barcode scan** → add `BarcodeDetector` API fallback to pre-fill identification
- **eBay Finding API** → deterministic comps instead of (or alongside) live search
- **Share sheet** → Web Share API for result screenshots
- **Bulk mode** → batch-analyze a yard sale in one go (queue + rate limit)
- **PWA** → add manifest + service worker for offline-capable install
