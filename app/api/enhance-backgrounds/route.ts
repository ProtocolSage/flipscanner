import { NextResponse } from 'next/server';
import type { AnalyzeRequestImage } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const XAI_IMAGINE_ENDPOINT = 'https://api.x.ai/v1/images/edits';
const ENABLE_BACKGROUND_ENHANCER = true;

interface EnhanceBackgroundsRequest {
  image: AnalyzeRequestImage;
  itemName?: string;
  backgroundSuggestion?: string;
}

export async function POST(req: Request) {
  if (!ENABLE_BACKGROUND_ENHANCER) {
    return NextResponse.json({ enhancedImages: [] });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'XAI_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  let body: EnhanceBackgroundsRequest;
  try {
    body = (await req.json()) as EnhanceBackgroundsRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const image = body.image;
  if (!image?.data || !image?.mediaType) {
    return NextResponse.json({ error: 'A single source image is required' }, { status: 400 });
  }

  const itemName = (body.itemName || 'this collectible item').trim();
  const userSuggestion = (body.backgroundSuggestion || '').trim();
  const basePrompt =
    'Replace ONLY the background. Keep the item itself completely unchanged — ' +
    'exact appearance, lighting, shadows, angle, and details. ' +
    'Create a clean, professional, highly sellable eBay-style product photo with natural lighting.';

  const fullPrompt = userSuggestion
    ? `${basePrompt} User requested: ${userSuggestion}`
    : `${basePrompt} For a ${itemName}, use an appropriate subtle and attractive background ` +
      'such as light wood table, clean studio, soft neutral setting, or collector shelf. ' +
      'Prefer clean and light backgrounds unless the item strongly suggests otherwise. ' +
      'Photorealistic product photography.';

  const editBody = {
    model: 'grok-imagine-image',
    prompt: fullPrompt,
    image: {
      url: `data:${image.mediaType};base64,${image.data}`,
    },
    n: 2,
  };

  try {
    const imagineRes = await fetch(XAI_IMAGINE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(editBody),
    });

    if (!imagineRes.ok) {
      const errorBody = await imagineRes.text().catch(() => '');
      console.error('Grok Imagine edit failed:', errorBody);
      return NextResponse.json({ enhancedImages: [] });
    }

    const imagineData = await imagineRes.json();
    const enhancedImages = (
      (imagineData.data || []) as Array<{ url?: string; image_url?: string }>
    )
      .map((item) => item.url || item.image_url || '')
      .filter(Boolean);

    return NextResponse.json({ enhancedImages });
  } catch (err) {
    console.error('Grok Imagine background enhancer error:', err);
    return NextResponse.json({ enhancedImages: [] });
  }
}
