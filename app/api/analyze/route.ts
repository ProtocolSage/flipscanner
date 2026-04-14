import { NextResponse } from 'next/server';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  GrokAnalysis,
  ScanMode,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const XAI_ENDPOINT = 'https://api.x.ai/v1/responses';
const DEFAULT_MODEL = process.env.XAI_MODEL || 'grok-4-1-fast-reasoning';
const XAI_REQUEST_TIMEOUT_MS = 48_000;
const XAI_MAX_OUTPUT_TOKENS = 2200;

// ---------- prompt ----------------------------------------------------------

const CATEGORY_HINTS: Record<string, string> = {
  auto: 'no category hint — identify from the image',
  beanie: 'likely a Beanie Baby / plush collectible',
  vinyl: 'likely a vinyl record',
  cards: 'likely a trading card',
  toys: 'likely a vintage toy',
  books: 'likely a book or comic',
  electronics: 'likely vintage electronics',
  clothing: 'likely clothing / apparel',
  other: 'an unspecified collectible',
};

const CONDITION_HINTS: Record<string, string> = {
  auto: 'no condition hint — assess from the images',
  mint: 'user reports: Mint (perfect, unused)',
  'near-mint': 'user reports: Near Mint (minimal wear)',
  'very-good': 'user reports: Very Good (light wear)',
  good: 'user reports: Good (visible wear)',
  fair: 'user reports: Fair (heavy wear)',
  poor: 'user reports: Poor (damaged)',
};

function buildPrompt(
  mode: ScanMode,
  imageCount: number,
  askingPrice: string,
  categoryHint: string,
  conditionHint: string
): string {
  const categoryLine = CATEGORY_HINTS[categoryHint] || CATEGORY_HINTS.auto;
  const conditionLine = CONDITION_HINTS[conditionHint] || CONDITION_HINTS.auto;
  const priceLine =
    mode === 'sourcing'
      ? `Seller's asking price: $${askingPrice}`
      : 'No asking price — this is inventory the user already owns and wants to list.';

  const modeInstructions =
    mode === 'sourcing'
      ? `This is a SOURCING scan. The user is standing in front of an item they might buy.
Your primary output is a BUY / PASS / MAYBE verdict. Populate the "verdict" field.
Target buy price = roughly 35-45% of the average sold price, adjusted for condition and rarity, leaving room for ~15% eBay fees, shipping, and ~30% profit margin.
Expected profit = recommended list price minus target buy price minus ~15% fees minus shipping.`
      : `This is an INVENTORY scan. The user already owns the item and wants to list it on eBay.
Set "verdict" to null. Do NOT return a verdict object.
Your primary output is a polished, ready-to-paste eBay listing. Spend your effort on:
  • A keyword-optimized 80-character title
  • A thoughtful pricing strategy (aggressive/balanced/quick sale values)
  • Accurate item specifics relevant to the category
  • A well-written multi-paragraph description`;

  return `You are FlipScanner, an expert collectibles appraiser and eBay listing copywriter helping a reseller.

=== CONTEXT ===
Mode: ${mode.toUpperCase()}
Images provided: ${imageCount}
Category hint: ${categoryLine}
Condition hint: ${conditionLine}
${priceLine}

=== MODE INSTRUCTIONS ===
${modeInstructions}

=== REQUIRED STEPS ===
1. IDENTIFY the item precisely from the images. Read any tags, labels, matrix numbers, or markings you can see. Return maker, year/era, variant/edition, and an honest confidence score (0-100).

2. USE LIVE WEB SEARCH to gather market data. Run 1-2 targeted searches. Prioritize queries that surface SOLD listings specifically — not active asking prices. Examples:
   • "[exact item name] sold ebay 2026"
   • "[item] completed listing price"
   • "[item] worthpoint sold price"
   Also look at other collector marketplaces (Mercari, Discogs for vinyl, TCGPlayer for cards, Heritage Auctions, etc.) when relevant.

3. LABEL EACH COMP with its type: "sold" (actual completed sale), "asking" (active listing price), or "reference" (price guide or aggregator estimate). Aim for 3-6 comps total, weighted heavily toward sold.

4. COMPUTE market stats from the comps:
   • avgSold = weighted average of *sold* comps only (if no sold comps, use 0 and note it)
   • median = median of all comps
   • low / high = range
   • soldCount, askingCount, sampleSize

5. ASSESS CONDITION from the images. Note specific observations — damage, wear, fading, staining, completeness, original packaging, tags, seals, etc.

6. BUILD A FULL EBAY LISTING (always, both modes):

   TITLE: Maximum 80 characters. Keyword order that eBay search rewards:
   [Brand] [Model/Name] [Year] [Variant] [Key attribute] [Condition keyword]
   Example: "Ty Beanie Baby Princess Diana Bear 1997 PVC Pellets No Tag Errors"
   Never exceed 80 chars. Count them.

   CATEGORY: Give the full eBay category path (e.g. "Collectibles > Animals > Ty Beanie Babies > Current") and just the leaf name separately.

   PRICING: Return THREE price points:
     • aggressive = high end of sold comps (testing the ceiling, slower sale)
     • balanced = near sold median or slightly above (default recommendation)
     • quick = ~15% below sold median (fast turn)
   Also set "recommended" = the price you'd actually recommend for this specific item, and "recommendedStrategy" = which of the three it matches.

   FORMAT: Recommend PER ITEM whether to use "auction", "buy_it_now", or "bin_with_offers". Your reasoning should cite characteristics of THIS item — rarity, demand predictability, price range, competition. Include duration ("7 days", "GTC") and acceptOffers. If auction, include startingBid.
   Rule of thumb but NOT a blanket rule: highly rare / collector-frenzy items → auction; predictable midrange → BIN with offers; commodity items → flat BIN.

   CONDITION: Pick EXACTLY ONE from eBay's official vocabulary: "New", "New with tags", "New without tags", "New with defects", "Open box", "Used", "Pre-owned", "Very Good", "Good", "Acceptable", "For parts or not working". Write a 1-2 sentence condition description for the listing body.

   ITEM SPECIFICS: 5-10 structured key/value pairs relevant to the category. Examples:
     • Beanie Baby: Brand, Character, Year Manufactured, Tag Condition, Tush Tag, Country/Region of Manufacture, Features
     • Vinyl: Artist, Record Label, Release Year, Genre, Speed, Record Size, Style
     • Trading card: Manufacturer, Year, Card Number, Player/Character, Set, Grade, Finish
   Make every value specific, never "N/A" or "Unknown" unless genuinely unreadable.

   DESCRIPTION: Multi-paragraph markdown body. 150-300 words. Structure:
     1. Opening hook describing the item and its appeal
     2. Condition paragraph — specific observations, honest about flaws
     3. Details paragraph — measurements, markings, provenance if known
     4. Shipping / handling note

   SHIPPING: Estimate weight in ounces, suggest a specific service (e.g. "USPS Ground Advantage", "USPS First Class Package", "USPS Priority Mail"), estimate cost in USD, and include a brief note about packing.

7. TIPS: 2-4 concise selling tips specific to this item and category.

=== OUTPUT ===
Return ONLY a single valid JSON object with this EXACT schema. No preamble, no markdown fences, no closing text. Just JSON.

{
  "identification": {
    "name": "string",
    "year": "string",
    "maker": "string",
    "variant": "string",
    "confidence": 0
  },
  "market": {
    "avgSold": 0,
    "median": 0,
    "low": 0,
    "high": 0,
    "sampleSize": 0,
    "soldCount": 0,
    "askingCount": 0,
    "timeframe": "last 90 days"
  },
  "condition": {
    "observed": "string",
    "notes": ["string"],
    "valueImpact": "string"
  },
  "comps": [
    { "title": "string", "price": 0, "source": "string", "type": "sold|asking|reference", "date": "optional string", "url": "optional string" }
  ],
  "verdict": ${mode === 'sourcing' ? `{
    "action": "BUY|PASS|MAYBE",
    "targetBuyPrice": 0,
    "expectedProfit": 0,
    "reasoning": "string",
    "risks": ["string"]
  }` : 'null'},
  "listing": {
    "title": "string (<=80 chars)",
    "categoryPath": "string",
    "categoryLeaf": "string",
    "pricing": {
      "aggressive": 0,
      "balanced": 0,
      "quick": 0,
      "recommended": 0,
      "recommendedStrategy": "aggressive|balanced|quick"
    },
    "format": {
      "type": "auction|buy_it_now|bin_with_offers",
      "reasoning": "string",
      "duration": "string",
      "acceptOffers": true,
      "startingBid": 0
    },
    "condition": {
      "ebayGrade": "one of the eBay condition strings",
      "description": "string"
    },
    "itemSpecifics": [
      { "name": "string", "value": "string" }
    ],
    "description": "markdown string with \\n\\n between paragraphs",
    "shipping": {
      "weightOz": 0,
      "suggestedService": "string",
      "estimatedCost": 0,
      "notes": "string"
    }
  },
  "tips": ["string"]
}

RULES:
- All prices in USD, numeric (no symbols, no strings).
- Return valid JSON. No trailing commas. No comments.
- If identification fails (can't tell what the item is), set confidence low, set verdict.action to "PASS" (sourcing mode) or still return a best-guess listing (inventory mode), and populate risks accordingly.
- Do NOT pad numbers with zeros. Real numbers from real comps.
- Title MUST be <= 80 characters.`;
}

// ---------- Grok call types (Responses API) ---------------------------------

interface GrokContentBlock {
  type: 'input_text' | 'input_image';
  text?: string;       // for input_text
  image_url?: string;  // for input_image — flat string, not nested object
}

// Responses API output items — each entry in `output[]` has a `type`.
// For message items, `content[]` holds text blocks with a `text` field.
// Other types ("reasoning", "web_search_call", etc.) are ignored here.
interface GrokOutputContent {
  type?: string;
  text?: string;
}

interface GrokOutputItem {
  id?: string;
  type: string;
  role?: string;
  status?: string;
  content?: GrokOutputContent[];
}

interface GrokResponse {
  id?: string;
  output?: GrokOutputItem[];
  citations?: string[];
  usage?: Record<string, number>;
  error?: { message?: string; type?: string };
}

// ---------- helpers ---------------------------------------------------------

function tryParseJson(raw: string): GrokAnalysis | null {
  const attempts = [
    () => JSON.parse(raw),
    () => {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (!m) throw new Error('no fence');
      return JSON.parse(m[1]);
    },
    () => {
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first === -1 || last <= first) throw new Error('no braces');
      return JSON.parse(raw.slice(first, last + 1));
    },
  ];
  for (const attempt of attempts) {
    try {
      return attempt() as GrokAnalysis;
    } catch {
      // try next
    }
  }
  return null;
}

function truncateTitle(title: string | undefined, max = 80): string {
  if (!title) return '';
  if (title.length <= max) return title;
  return title.slice(0, max).trimEnd();
}

// ---------- POST ------------------------------------------------------------

export async function POST(req: Request) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'XAI_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const images = body.images;
  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json(
      { error: 'At least one image required' },
      { status: 400 }
    );
  }
  if (images.length > 4) {
    return NextResponse.json(
      { error: 'Maximum 4 images per scan' },
      { status: 400 }
    );
  }

  const askingPriceStr = (body.askingPrice || '').trim();
  const askingPriceNum = askingPriceStr ? parseFloat(askingPriceStr) : null;
  const mode: ScanMode =
    askingPriceNum != null && !isNaN(askingPriceNum) ? 'sourcing' : 'inventory';

  const categoryHint = body.categoryHint || 'auto';
  const conditionHint = body.conditionHint || 'auto';
  const prompt = buildPrompt(
    mode,
    images.length,
    askingPriceStr,
    categoryHint,
    conditionHint
  );

  const content: GrokContentBlock[] = [
    ...images.map<GrokContentBlock>((img) => ({
      type: 'input_image',
      image_url: `data:${img.mediaType};base64,${img.data}`,
    })),
    { type: 'input_text', text: prompt },
  ];

  const grokBody = {
    model: DEFAULT_MODEL,
    input: [{ role: 'user', content }],
    temperature: 0.3,
    max_output_tokens: XAI_MAX_OUTPUT_TOKENS,
    tools: [{ type: 'web_search' }],
  };

  let grokRes: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), XAI_REQUEST_TIMEOUT_MS);
  try {
    grokRes = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify(grokBody),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      console.error(`[xAI] API timeout after ${XAI_REQUEST_TIMEOUT_MS}ms`);
      return NextResponse.json(
        {
          error:
            'Analysis took too long. Try again with fewer photos or a more specific item/category hint.',
        },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: `Network error calling xAI: ${(e as Error).message}` },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!grokRes.ok) {
    const errText = await grokRes.text().catch(() => '');
    // Log the full error body server-side for debugging deserialization hints
    console.error('[xAI] API error', grokRes.status, errText);
    return NextResponse.json(
      { error: `xAI API ${grokRes.status}: ${errText.slice(0, 400)}` },
      { status: 502 }
    );
  }

  let data: GrokResponse;
  try {
    data = (await grokRes.json()) as GrokResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to parse xAI response: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Responses API returns an `output` array. Message items have role "assistant"
  // and contain text blocks inside `content[]`. There may also be reasoning items
  // and tool-call items we don't care about here.
  const messageItems =
    data.output?.filter((item) => item.type === 'message') || [];
  const rawContent = messageItems
    .flatMap((item) => item.content || [])
    .map((c) => c.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!rawContent) {
    return NextResponse.json(
      {
        error: data.error?.message
          ? `Grok error: ${data.error.message}`
          : 'Empty response from Grok',
        raw: JSON.stringify(data).slice(0, 600),
      },
      { status: 502 }
    );
  }

  const parsed = tryParseJson(rawContent);
  if (!parsed) {
    return NextResponse.json(
      {
        error: 'Grok returned non-JSON content',
        raw: rawContent.slice(0, 600),
      },
      { status: 502 }
    );
  }

  // Defensive normalization — Grok usually gets it right, but we enforce
  // shape invariants so the client can trust the response.
  if (parsed.listing?.title) {
    parsed.listing.title = truncateTitle(parsed.listing.title);
  }
  if (mode === 'inventory') {
    parsed.verdict = null;
  }

  const response: AnalyzeResponse = {
    ...parsed,
    id: Date.now(),
    timestamp: new Date().toISOString(),
    mode,
    askingPrice: askingPriceNum,
    citations: data.citations || [],
    model: DEFAULT_MODEL,
    enhancedImages: [],
  };

  return NextResponse.json(response);
}
