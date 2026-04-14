'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  X,
  TrendingUp,
  History,
  Sparkles,
  DollarSign,
  Check,
  AlertTriangle,
  Target,
  Package,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Eye,
  Search,
  Award,
  XCircle,
  HelpCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Clock,
  Link as LinkIcon,
  Copy,
  Tag,
  Truck,
  FileText,
  Gavel,
  ShoppingBag,
  Zap,
  Share2,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import type {
  ImageSlot,
  ScanResult,
  VerdictAction,
  ListingStrategy,
  ListingFormat,
  EbayListing,
} from '@/lib/types';
import { saveScan, loadHistory, deleteScan, clearHistory } from '@/lib/storage';

// =============================================================================
// Constants
// =============================================================================

const CATEGORIES = [
  { id: 'auto', label: 'Auto-detect', icon: '✨' },
  { id: 'beanie', label: 'Beanie Babies', icon: '🧸' },
  { id: 'vinyl', label: 'Vinyl', icon: '💿' },
  { id: 'cards', label: 'Cards', icon: '🃏' },
  { id: 'toys', label: 'Toys', icon: '🎮' },
  { id: 'books', label: 'Books', icon: '📚' },
  { id: 'electronics', label: 'Electronics', icon: '📻' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
  { id: 'other', label: 'Other', icon: '📦' },
];

const CONDITIONS = [
  { id: 'auto', label: 'Let AI decide' },
  { id: 'mint', label: 'Mint' },
  { id: 'near-mint', label: 'Near Mint' },
  { id: 'very-good', label: 'Very Good' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
  { id: 'poor', label: 'Poor' },
];

const LOADING_STAGES = [
  { icon: Eye, text: 'Examining photos' },
  { icon: Search, text: 'Identifying the item' },
  { icon: TrendingUp, text: 'Searching sold comps' },
  { icon: FileText, text: 'Building your listing' },
];

type Screen = 'landing' | 'preview' | 'processing' | 'report' | 'history';

// =============================================================================
// Image pipeline
// =============================================================================

async function resizeImage(
  file: File | Blob,
  maxDim = 1600,
  quality = 0.85
): Promise<ImageSlot> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context failed');
    ctx.drawImage(bitmap, 0, 0, w, h);
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context failed');
    ctx.drawImage(bitmap, 0, 0, w, h);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      )
    );
  }
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.split(',')[1];

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    data: base64,
    mediaType: 'image/jpeg',
    preview: dataUrl,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function money(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

function verdictStyle(action: VerdictAction | undefined | null) {
  switch (action) {
    case 'BUY':
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-50',
        soft: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        Icon: Check,
      };
    case 'PASS':
      return {
        bg: 'bg-rose-500',
        text: 'text-rose-50',
        soft: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        Icon: XCircle,
      };
    default:
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-50',
        soft: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        Icon: HelpCircle,
      };
  }
}

function formatLabel(type: ListingFormat): {
  label: string;
  Icon: typeof Gavel;
} {
  switch (type) {
    case 'auction':
      return { label: 'Auction', Icon: Gavel };
    case 'bin_with_offers':
      return { label: 'Buy It Now + Best Offer', Icon: ShoppingBag };
    default:
      return { label: 'Buy It Now', Icon: ShoppingBag };
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildListingMarkdown(listing: EbayListing): string {
  const lines: string[] = [];
  lines.push(`# ${listing.title}`);
  lines.push('');
  lines.push(`**Category:** ${listing.categoryPath}`);
  lines.push(
    `**Price:** ${money(listing.pricing.recommended)} (${listing.pricing.recommendedStrategy})`
  );
  lines.push(`**Format:** ${formatLabel(listing.format.type).label} · ${listing.format.duration}`);
  if (listing.format.type === 'auction' && listing.format.startingBid != null) {
    lines.push(`**Starting bid:** ${money(listing.format.startingBid)}`);
  }
  lines.push(`**Condition:** ${listing.condition.ebayGrade}`);
  lines.push('');
  lines.push('## Item Specifics');
  for (const spec of listing.itemSpecifics) {
    lines.push(`- **${spec.name}:** ${spec.value}`);
  }
  lines.push('');
  lines.push('## Description');
  lines.push(listing.description);
  lines.push('');
  lines.push('## Shipping');
  lines.push(`${listing.shipping.suggestedService} — ~${money(listing.shipping.estimatedCost)}`);
  lines.push(`Weight: ${listing.shipping.weightOz} oz`);
  if (listing.shipping.notes) lines.push(listing.shipping.notes);
  return lines.join('\n');
}

// =============================================================================
// Main page
// =============================================================================

export default function FlipScannerPage() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [askingPrice, setAskingPrice] = useState('');
  const [askingPriceExpanded, setAskingPriceExpanded] = useState(false);
  const [adjustExpanded, setAdjustExpanded] = useState(false);
  const [category, setCategory] = useState('auto');
  const [condition, setCondition] = useState('auto');
  const [stageIdx, setStageIdx] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistoryState] = useState<ScanResult[]>([]);
  const [processingImage, setProcessingImage] = useState(false);
  const [xaiStatus] = useState<'ok' | 'unknown'>('ok');
  const [useForceFlash, setUseForceFlash] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [enableBackgroundEnhancer, setEnableBackgroundEnhancer] = useState(true);
  const [backgroundSuggestion, setBackgroundSuggestion] = useState('');
  const [showSuggestionInput, setShowSuggestionInput] = useState(false);
  const [isEnhancingBackgrounds, setIsEnhancingBackgrounds] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  // Load history on mount
  useEffect(() => {
    loadHistory().then(setHistoryState);
  }, []);

  // Rotate loading stages during processing
  useEffect(() => {
    if (screen !== 'processing') return;
    const t = setInterval(() => {
      setStageIdx((i) => (i + 1) % LOADING_STAGES.length);
    }, 2200);
    return () => clearInterval(t);
  }, [screen]);

  // ---------- Image handling ----------

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slots = 4 - images.length;
    if (slots <= 0) return;
    setProcessingImage(true);
    setError(null);
    try {
      const picked = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, slots);
      const loaded = await Promise.all(picked.map((f) => resizeImage(f)));
      setImages((prev) => {
        const next = [...prev, ...loaded];
        return next;
      });
      // If we were on landing and just got our first photo, move to preview
      setScreen((s) => (s === 'landing' ? 'preview' : s));
    } catch (e) {
      setError(`Image processing failed: ${(e as Error).message}`);
    } finally {
      setProcessingImage(false);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const next = prev.filter((i) => i.id !== id);
      // If that was the last one, bounce back to landing
      if (next.length === 0) setScreen('landing');
      return next;
    });
  };

  const triggerCapture = async () => {
    if (useForceFlash) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1600 }, height: { ideal: 1600 } },
        });
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
          } catch {
            // torch not supported on this device — continue without it
          }
        }
      } catch (err) {
        setToastMessage('Camera flash is unavailable on this device. Using normal capture.');
        setUseForceFlash(false);
        captureInputRef.current?.click();
      }
    } else {
      captureInputRef.current?.click();
    }
  };
  const triggerUpload = () => uploadInputRef.current?.click();

  // Stop camera stream when it's no longer needed
  useEffect(() => {
    if (!cameraStream) return;
    return () => {
      cameraStream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream]);

  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  };

  const takePhotoFromStream = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const slot = await resizeImage(blob);
        setImages((prev) => {
          const next = [...prev, slot].slice(0, 4);
          return next;
        });
        stopCameraStream();
      },
      'image/jpeg',
      0.85
    );
  };

  // ---------- Analyze ----------

  const analyze = async () => {
    if (images.length === 0) {
      setError('Add at least one photo first.');
      return;
    }
    setScreen('processing');
    setError(null);
    setResult(null);
    setStageIdx(0);
    setIsEnhancingBackgrounds(false);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map((i) => ({ data: i.data, mediaType: i.mediaType })),
          askingPrice: askingPrice.trim(),
          categoryHint: category,
          conditionHint: condition,
          enableBackgroundEnhancer,
          backgroundSuggestion: backgroundSuggestion.trim(),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
          error?: string;
        };
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const serverResult = (await res.json()) as Omit<ScanResult, 'thumbnails'>;
      let enhancedImages = serverResult.enhancedImages || [];

      if (enableBackgroundEnhancer) {
        setIsEnhancingBackgrounds(true);
        await new Promise((resolve) => setTimeout(resolve, 800));

        try {
          const enhanceRes = await fetch('/api/enhance-backgrounds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: {
                data: images[0].data,
                mediaType: images[0].mediaType,
              },
              itemName: serverResult.identification?.name,
              backgroundSuggestion: backgroundSuggestion.trim(),
            }),
          });

          if (enhanceRes.ok) {
            const enhanceData = (await enhanceRes.json()) as {
              enhancedImages?: string[];
            };
            enhancedImages = enhanceData.enhancedImages || [];
          } else {
            console.error('Background enhancer request failed');
          }
        } catch (err) {
          console.error('Background enhancer request error:', err);
        }
      }

      const full: ScanResult = {
        ...serverResult,
        enhancedImages,
        thumbnails: images.map((i) => i.preview),
      };

      setResult(full);
      await saveScan(full);
      setHistoryState((prev) => [full, ...prev].slice(0, 50));
      setScreen('report');
    } catch (e) {
      setError(`Analysis failed: ${(e as Error).message}`);
      setScreen('preview');
    } finally {
      setIsEnhancingBackgrounds(false);
    }
  };

  const resetAll = () => {
    setImages([]);
    setAskingPrice('');
    setAskingPriceExpanded(false);
    setAdjustExpanded(false);
    setCategory('auto');
    setCondition('auto');
    setResult(null);
    setError(null);
    setScreen('landing');
  };

  const handleDeleteScan = async (id: number) => {
    await deleteScan(id);
    setHistoryState((prev) => prev.filter((h) => h.id !== id));
  };

  const handleClearHistory = async () => {
    setShowClearHistoryConfirm(false);
    await clearHistory();
    setHistoryState([]);
    setToastMessage('Scan history cleared.');
  };

  // =============================================================================
  // Renders
  // =============================================================================

  // Shared hidden inputs
  const hiddenInputs = (
    <>
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );

  // ---------- LANDING ----------
  if (screen === 'landing') {
    return (
      <div className="min-h-dvh flex flex-col bg-neutral-950">
        {hiddenInputs}

        <header className="flex items-center justify-between px-4 pt-safe pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">FlipScanner</h1>
          </div>

          {/* xAI status indicator */}
          <a
            href="https://status.x.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-neutral-900 border border-neutral-700 hover:border-neutral-500 transition"
          >
            <div className={`w-2 h-2 rounded-full ${xaiStatus === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-neutral-400">Grok</span>
            <span className={xaiStatus === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
              {xaiStatus === 'ok' ? '✓ online' : 'checking...'}
            </span>
          </a>

          <button
            onClick={() => setScreen('history')}
            className="relative p-2 -mr-2 text-neutral-400 active:text-white transition"
            aria-label="History"
          >
            <History className="w-5 h-5" />
            {history.length > 0 && (
              <span className="absolute top-1 right-1 bg-blue-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {history.length > 99 ? '99+' : history.length}
              </span>
            )}
          </button>
        </header>

        {error && (
          <div className="mx-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-safe">
          <button
            onClick={triggerCapture}
            disabled={processingImage}
            className="group w-full max-w-sm aspect-square rounded-[2rem] bg-gradient-to-br from-blue-500 to-violet-600 shadow-2xl shadow-blue-500/30 flex flex-col items-center justify-center gap-4 active:scale-[0.98] transition disabled:opacity-60"
          >
            <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <Camera className="w-12 h-12 text-white" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">Scan Item</div>
              <div className="text-sm text-white/80 mt-0.5">
                Tap to open camera
              </div>
            </div>
          </button>

          <button
            onClick={triggerUpload}
            disabled={processingImage}
            className="mt-6 text-sm text-neutral-400 active:text-white transition flex items-center gap-1.5 py-2 px-3"
          >
            <Upload className="w-4 h-4" />
            Upload from library
          </button>

          {processingImage && (
            <div className="mt-4 text-xs text-neutral-500">Processing...</div>
          )}
        </div>

        <div className="pb-safe-plus px-6 text-center">
          <div className="text-[11px] text-neutral-600">
            Powered by Grok · Live comps
          </div>
        </div>
        <Toast message={toastMessage} />
      </div>
    );
  }

  // ---------- PREVIEW ----------
  if (screen === 'preview') {
    return (
      <div className="min-h-dvh flex flex-col bg-neutral-950">
        {hiddenInputs}

        <header className="flex items-center justify-between px-4 pt-safe pt-4 pb-2">
          <button
            onClick={resetAll}
            className="p-2 -ml-2 text-neutral-400 active:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-sm font-semibold text-neutral-300">
            {images.length} {images.length === 1 ? 'photo' : 'photos'}
          </div>
          <div className="w-9" />
        </header>

        {error && (
          <div className="mx-4 mb-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 px-4 space-y-4 overflow-y-auto pb-4">

          {/* Flash toggle */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-500">Camera flash</div>
            <div className="flex rounded-full overflow-hidden border border-neutral-800 text-xs font-semibold">
              <button
                onClick={() => { setUseForceFlash(false); stopCameraStream(); }}
                className={`px-3 py-1.5 transition ${
                  !useForceFlash ? 'bg-neutral-700 text-white' : 'text-neutral-500 active:bg-neutral-800'
                }`}
              >
                Auto/Off
              </button>
              <button
                onClick={() => setUseForceFlash(true)}
                className={`px-3 py-1.5 transition ${
                  useForceFlash ? 'bg-yellow-500 text-black' : 'text-neutral-500 active:bg-neutral-800'
                }`}
              >
                ⚡ On
              </button>
            </div>
          </div>

          {/* Live camera preview when force flash is active */}
          {useForceFlash && cameraStream && (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <button
                onClick={takePhotoFromStream}
                className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white text-black px-8 py-3 rounded-full font-bold text-sm shadow-lg active:scale-95 transition"
              >
                📸 Take Photo
              </button>
              <button
                onClick={stopCameraStream}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="Close camera"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Photo grid */}
          <div className="grid grid-cols-2 gap-2">
            {images.map((img, i) => (
              <div
                key={img.id}
                className="aspect-square rounded-xl overflow-hidden relative bg-neutral-900 border border-neutral-800"
              >
                <img
                  src={img.preview}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center"
                  aria-label="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {images.length < 4 && (
              <button
                onClick={triggerCapture}
                disabled={processingImage}
                className="aspect-square rounded-xl border-2 border-dashed border-neutral-800 text-neutral-600 flex flex-col items-center justify-center gap-1 active:bg-neutral-900 transition disabled:opacity-40"
              >
                <Plus className="w-6 h-6" />
                <div className="text-xs font-medium">Add photo</div>
              </button>
            )}
          </div>

          {/* Asking price (collapsible) */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            <button
              onClick={() => setAskingPriceExpanded((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-neutral-500" />
                <div>
                  <div className="text-sm font-medium text-neutral-200">
                    {askingPrice
                      ? `Asking price: $${askingPrice}`
                      : 'Add asking price'}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {askingPrice
                      ? "I'll tell you if it's worth it"
                      : 'Optional — for sourcing at yard sales'}
                  </div>
                </div>
              </div>
              {askingPriceExpanded ? (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-500" />
              )}
            </button>
            {askingPriceExpanded && (
              <div className="px-4 pb-3">
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                  <input
                    type="number"
                    inputMode="decimal"
                    value={askingPrice}
                    onChange={(e) => setAskingPrice(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
                {askingPrice && (
                  <button
                    onClick={() => {
                      setAskingPrice('');
                      setAskingPriceExpanded(false);
                    }}
                    className="mt-2 text-[11px] text-neutral-500 active:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Advanced options (collapsible) */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            <button
              onClick={() => setAdjustExpanded((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-neutral-500" />
                <div className="text-sm font-medium text-neutral-200">
                  Advanced
                </div>
              </div>
              {adjustExpanded ? (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-500" />
              )}
            </button>
            {adjustExpanded && (
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                    Category hint
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategory(c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                          category === c.id
                            ? 'bg-blue-500 border-blue-400 text-white'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        <span className="mr-1">{c.icon}</span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                    Condition hint
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CONDITIONS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCondition(c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                          condition === c.id
                            ? 'bg-blue-500 border-blue-400 text-white'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Background Enhancer - Polished Design */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-base text-white">AI Background Enhancer</div>
                <div className="text-xs text-neutral-500 mt-0.5">Grok Imagine · Makes items pop on eBay</div>
              </div>
              <button
                onClick={() => setEnableBackgroundEnhancer((v) => !v)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  enableBackgroundEnhancer
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {enableBackgroundEnhancer ? '✓ Enabled' : 'Disabled'}
              </button>
            </div>

            {enableBackgroundEnhancer && (
              <div className="mt-4">
                <button
                  onClick={() => setShowSuggestionInput((v) => !v)}
                  className="flex items-center gap-1 text-sm text-blue-400 active:text-blue-300 transition"
                >
                  {showSuggestionInput ? '− Hide suggestion' : '+ Add custom background idea'}
                </button>

                {showSuggestionInput && (
                  <textarea
                    value={backgroundSuggestion}
                    onChange={(e) => setBackgroundSuggestion(e.target.value)}
                    placeholder="Examples: rustic wood table, pastel shelf, clean white studio, beach vibe..."
                    className="mt-3 w-full h-24 bg-neutral-950 border border-neutral-700 rounded-2xl p-4 text-sm text-white placeholder-neutral-500 resize-y focus:outline-none focus:border-blue-500 transition"
                  />
                )}

                <p className="text-[10px] text-neutral-500 mt-3">
                  Will generate 2 enhanced versions · Adds ~3–7¢ per scan
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom analyze button */}
        <div className="px-4 pb-safe-plus pt-2 bg-gradient-to-t from-neutral-950 via-neutral-950 to-transparent">
          <button
            onClick={analyze}
            disabled={images.length === 0 || processingImage}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold text-base shadow-lg shadow-blue-500/30 active:scale-[0.98] disabled:opacity-40 transition flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Analyze
          </button>
        </div>
        <Toast message={toastMessage} />
      </div>
    );
  }

  // ---------- PROCESSING ----------
  if (screen === 'processing') {
    const Stage = LOADING_STAGES[stageIdx].icon;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-neutral-950 px-6">
        <div className="relative">
          <div className="w-28 h-28 rounded-full border-4 border-neutral-800" />
          <div className="absolute inset-0 w-28 h-28 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Stage className="w-10 h-10 text-blue-400" strokeWidth={1.5} />
          </div>
        </div>
        <div className="mt-8 text-center">
          <div className="text-lg font-semibold text-white">
            {isEnhancingBackgrounds ? 'Polishing photos...' : LOADING_STAGES[stageIdx].text}
          </div>
          <div className="text-xs text-neutral-500 mt-1.5">
            Typically 20–40 seconds
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          {LOADING_STAGES.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-10 rounded-full transition ${
                i <= stageIdx ? 'bg-blue-500' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>

        {isEnhancingBackgrounds && (
          <div className="mt-8">
            <div className="inline-flex items-center gap-3 bg-neutral-900 border border-neutral-700 rounded-2xl px-6 py-3">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              <div>
                <div className="text-sm font-medium text-white">Enhancing backgrounds...</div>
                <div className="text-xs text-neutral-500">Grok Imagine is creating 2 nice versions</div>
              </div>
            </div>
          </div>
        )}
        <Toast message={toastMessage} />
      </div>
    );
  }

  // ---------- REPORT ----------
  if (screen === 'report' && result) {
    return (
      <ReportView
        result={result}
        onNewScan={resetAll}
        onBack={() => setScreen('preview')}
        onAdjustBackground={() => {
          setShowSuggestionInput(true);
          setScreen('preview');
        }}
      />
    );
  }

  // ---------- HISTORY ----------
  if (screen === 'history') {
    return (
      <div className="min-h-dvh flex flex-col bg-neutral-950">
        <header className="flex items-center justify-between px-4 pt-safe pt-4 pb-2">
          <button
            onClick={() => setScreen('landing')}
            className="p-2 -ml-2 text-neutral-400 active:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-sm font-semibold text-neutral-300">History</div>
          <button
            onClick={() => setShowClearHistoryConfirm(true)}
            disabled={history.length === 0}
            className="text-xs text-neutral-500 active:text-rose-400 disabled:opacity-30 px-2"
          >
            Clear
          </button>
        </header>

        <div className="flex-1 px-4 py-2 space-y-2 overflow-y-auto">
          {history.length === 0 ? (
            <div className="py-20 text-center text-neutral-600">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No scans yet</p>
            </div>
          ) : (
            history.map((h) => {
              const vs = verdictStyle(h.verdict?.action);
              const Icon = vs.Icon;
              return (
                <div
                  key={h.id}
                  className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-3"
                >
                  <button
                    onClick={() => {
                      setResult(h);
                      setScreen('report');
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    {h.thumbnails?.[0] && (
                      <img
                        src={h.thumbnails[0]}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {h.identification?.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        {money(h.listing?.pricing?.recommended || h.market?.avgSold)} · {new Date(h.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    {h.mode === 'sourcing' && h.verdict && (
                      <div
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border ${vs.soft} flex items-center gap-1`}
                      >
                        <Icon className="w-3 h-3" />
                        {h.verdict.action}
                      </div>
                    )}
                    {h.mode === 'inventory' && (
                      <div className="px-2 py-1 rounded-md text-[10px] font-bold border bg-blue-500/10 text-blue-300 border-blue-500/30">
                        LIST
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteScan(h.id)}
                    className="p-1.5 text-neutral-600 active:text-rose-400"
                    aria-label="Delete scan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
        <ConfirmSheet
          open={showClearHistoryConfirm}
          title="Clear scan history?"
          message="This removes all saved scans from this browser on this device."
          confirmLabel="Clear History"
          onCancel={() => setShowClearHistoryConfirm(false)}
          onConfirm={handleClearHistory}
        />
        <Toast message={toastMessage} />
      </div>
    );
  }

  return null;
}

// =============================================================================
// Report view
// =============================================================================

function ReportView({
  result,
  onNewScan,
  onBack,
  onAdjustBackground,
}: {
  result: ScanResult;
  onNewScan: () => void;
  onBack: () => void;
  onAdjustBackground: () => void;
}) {
  const isSourcing = result.mode === 'sourcing';
  const listing = result.listing;
  const ident = result.identification;
  const market = result.market;
  const comps = result.comps || [];
  const tips = result.tips || [];
  const verdict = result.verdict;
  const vs = verdictStyle(verdict?.action);
  const VerdictIcon = vs.Icon;
  const [selectedEnhancedIndex, setSelectedEnhancedIndex] = useState(0);

  return (
    <div className="min-h-dvh bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur border-b border-neutral-900">
        <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-3">
          <button
            onClick={onNewScan}
            className="flex items-center gap-1.5 text-sm text-neutral-400 active:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            New Scan
          </button>
          <div className="text-xs text-neutral-600">
            {new Date(result.timestamp).toLocaleDateString()}
          </div>
        </div>
      </header>

      <div className="px-4 py-4 pb-safe-plus space-y-4 max-w-xl mx-auto">
        {/* SOURCING MODE: Verdict hero */}
        {isSourcing && verdict && (
          <div
            className={`rounded-2xl p-5 ${vs.bg} shadow-xl shadow-black/30 relative overflow-hidden`}
          >
            <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <VerdictIcon className={`w-5 h-5 ${vs.text}`} />
                <div
                  className={`text-[10px] font-bold uppercase tracking-widest ${vs.text} opacity-90`}
                >
                  Verdict
                </div>
              </div>
              <div className={`text-5xl font-black ${vs.text} mb-2 tracking-tight`}>
                {verdict.action}
              </div>
              <div className={`text-sm ${vs.text} opacity-90 leading-snug`}>
                {verdict.reasoning}
              </div>
              {verdict.action !== 'PASS' && (
                <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-3 gap-2">
                  <div>
                    <div className={`text-[9px] uppercase ${vs.text} opacity-75`}>
                      Asking
                    </div>
                    <div className={`text-base font-bold ${vs.text}`}>
                      {money(result.askingPrice)}
                    </div>
                  </div>
                  <div>
                    <div className={`text-[9px] uppercase ${vs.text} opacity-75`}>
                      Target buy
                    </div>
                    <div className={`text-base font-bold ${vs.text}`}>
                      {money(verdict.targetBuyPrice)}
                    </div>
                  </div>
                  <div>
                    <div className={`text-[9px] uppercase ${vs.text} opacity-75`}>
                      Est. profit
                    </div>
                    <div className={`text-base font-bold ${vs.text}`}>
                      {money(verdict.expectedProfit)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* INVENTORY MODE: compact intel strip */}
        {!isSourcing && (
          <div className="rounded-2xl p-4 bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
                Listing ready
              </div>
              {ident.confidence != null && (
                <div className="ml-auto text-[10px] font-semibold text-neutral-400">
                  {ident.confidence}% confidence
                </div>
              )}
            </div>
            <div className="text-lg font-bold text-white leading-tight">
              {ident.name || 'Unknown item'}
            </div>
            <div className="text-xs text-neutral-400 mt-0.5">
              {[ident.maker, ident.year, ident.variant]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        )}

        {/* Market snapshot */}
        <section className="rounded-2xl p-4 bg-neutral-900 border border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              Market Snapshot
            </div>
            {market.timeframe && (
              <div className="ml-auto text-[10px] text-neutral-600">
                {market.timeframe}
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-3xl font-black text-emerald-400">
              {money(market.avgSold)}
            </div>
            <div className="text-xs text-neutral-500">avg sold price</div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="bg-neutral-950 rounded-lg py-2">
              <div className="text-[9px] text-neutral-500 uppercase">Low</div>
              <div className="text-sm font-bold text-neutral-300">
                {money(market.low)}
              </div>
            </div>
            <div className="bg-neutral-950 rounded-lg py-2">
              <div className="text-[9px] text-neutral-500 uppercase">Median</div>
              <div className="text-sm font-bold text-neutral-300">
                {money(market.median)}
              </div>
            </div>
            <div className="bg-neutral-950 rounded-lg py-2">
              <div className="text-[9px] text-neutral-500 uppercase">High</div>
              <div className="text-sm font-bold text-neutral-300">
                {money(market.high)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold">
              {market.soldCount} sold
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold">
              {market.askingCount} asking
            </span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 font-semibold">
              {market.sampleSize} total
            </span>
          </div>
        </section>

        {/* THE LISTING CARD — big in inventory, collapsed in sourcing */}
        {listing && (
          <ListingCard
            listing={listing}
            thumbnails={result.thumbnails}
            defaultOpen={!isSourcing}
            identificationName={ident.name}
          />
        )}

        {/* Condition (sourcing mode only — in inventory it's in the listing card) */}
        {isSourcing && result.condition && (
          <section className="rounded-2xl p-4 bg-neutral-900 border border-neutral-800">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-amber-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Condition
              </div>
              {result.condition.observed && (
                <div className="ml-auto text-[10px] font-semibold text-amber-300">
                  {result.condition.observed}
                </div>
              )}
            </div>
            {result.condition.notes?.length > 0 && (
              <ul className="space-y-1">
                {result.condition.notes.map((n, i) => (
                  <li key={i} className="text-xs text-neutral-400 flex gap-2">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-neutral-600 flex-shrink-0" />
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Comps */}
        {comps.length > 0 && (
          <CollapsibleSection
            icon={Search}
            iconColor="text-blue-400"
            title={`Comps (${comps.length})`}
            defaultOpen={false}
          >
            <div className="space-y-2 mt-2">
              {comps.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs border-b border-neutral-800 last:border-0 pb-2 last:pb-0"
                >
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      c.type === 'sold'
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : c.type === 'asking'
                          ? 'bg-amber-500/10 text-amber-300'
                          : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {c.type}
                  </span>
                  <div className="flex-1 min-w-0 truncate text-neutral-300">
                    {c.title}
                  </div>
                  <div className="text-white font-bold whitespace-nowrap">
                    {money(c.price)}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Verdict risks */}
        {isSourcing && verdict && verdict.risks?.length > 0 && (
          <section className="rounded-2xl p-4 bg-rose-500/5 border border-rose-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-rose-300">
                Risks
              </div>
            </div>
            <ul className="space-y-1.5">
              {verdict.risks.map((r, i) => (
                <li key={i} className="text-xs text-neutral-300 flex gap-2">
                  <AlertTriangle className="w-3 h-3 mt-0.5 text-rose-400 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tips */}
        {tips.length > 0 && (
          <section className="rounded-2xl p-4 bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                Selling Tips
              </div>
            </div>
            <ul className="space-y-1.5">
              {tips.map((t, i) => (
                <li key={i} className="text-xs text-neutral-300 flex gap-2">
                  <Check className="w-3 h-3 mt-0.5 text-emerald-400 flex-shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Citations */}
        {result.citations && result.citations.length > 0 && (
          <CollapsibleSection
            icon={LinkIcon}
            iconColor="text-blue-400"
            title={`Sources (${result.citations.length})`}
            defaultOpen={false}
          >
            <ul className="space-y-1 mt-2">
              {result.citations.slice(0, 15).map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-400 active:text-blue-300 truncate block"
                  >
                    {url.replace(/^https?:\/\//, '').slice(0, 70)}
                  </a>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Grok Imagine enhanced backgrounds */}
        {result.enhancedImages && result.enhancedImages.length > 0 && (
          <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-white">AI Background Variations</div>
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                Grok Imagine · {result.enhancedImages.length} versions
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {result.enhancedImages.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedEnhancedIndex(i)}
                  className={`flex-shrink-0 border-2 rounded-2xl overflow-hidden transition-all active:scale-95 ${
                    i === selectedEnhancedIndex
                      ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                      : 'border-neutral-700'
                  }`}
                >
                  <img
                    src={url}
                    alt={`Enhanced background ${i + 1}`}
                    className="w-40 h-40 object-contain bg-white"
                  />
                </button>
              ))}
            </div>

            <button
              onClick={onAdjustBackground}
              className="text-[11px] text-neutral-500 underline mt-3 block"
            >
              Suggest a different background &amp; rescan
            </button>
          </section>
        )}

        {/* Estimated cost pill */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs font-medium px-4 h-9 rounded-3xl">
            <DollarSign className="w-3 h-3" />
            Est. cost this scan:
            <span className="text-emerald-400 font-semibold">~4–6¢</span>
          </div>
        </div>

        <button
          onClick={onNewScan}
          className="w-full py-3.5 rounded-xl bg-neutral-900 border border-neutral-800 active:bg-neutral-800 text-neutral-300 font-semibold transition flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          New Scan
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Listing card — the hero of inventory mode
// =============================================================================

function ListingCard({
  listing,
  thumbnails,
  defaultOpen,
  identificationName,
}: {
  listing: EbayListing;
  thumbnails: string[];
  defaultOpen: boolean;
  identificationName: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [selectedStrategy, setSelectedStrategy] = useState<ListingStrategy>(
    listing.pricing.recommendedStrategy
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showOpenEbayConfirm, setShowOpenEbayConfirm] = useState(false);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const selectedPrice =
    selectedStrategy === 'aggressive'
      ? listing.pricing.aggressive
      : selectedStrategy === 'quick'
        ? listing.pricing.quick
        : listing.pricing.balanced;

  const handleCopy = async (field: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    }
  };

  const copyAll = () => handleCopy('all', buildListingMarkdown(listing));

  const openEbaySell = async () => {
    await handleCopy('all', buildListingMarkdown(listing));
    setShowOpenEbayConfirm(true);
  };

  const copyMobileFriendly = async () => {
    const mobileText = [
      listing.title,
      '',
      listing.description.replace(/\n\n+/g, '\n\n'),
      '',
      `Price: ${money(selectedPrice)}`,
      `Condition: ${listing.condition.ebayGrade}`,
      '',
      `${listing.shipping.suggestedService} — ~${money(listing.shipping.estimatedCost)}`,
    ].join('\n');
    const ok = await copyToClipboard(mobileText);
    if (ok) {
      setToastMessage('Mobile-friendly text copied. Paste it into the eBay app or mobile site.');
    }
  };

  const shareListing = async () => {
    const md = buildListingMarkdown(listing);
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: listing.title,
          text: md,
        });
      } catch {
        // user cancelled
      }
    } else {
      await handleCopy('all', md);
      setToastMessage('Markdown copied. Share is not available on this device.');
    }
  };

  const titleCharCount = listing.title.length;
  const titleOver = titleCharCount > 80;

  const formatInfo = formatLabel(listing.format.type);
  const FormatIcon = formatInfo.Icon;

  if (!open) {
    // Collapsed preview — sourcing mode
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl p-4 bg-neutral-900 border border-neutral-800 active:bg-neutral-800 transition text-left"
      >
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-blue-400" />
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            eBay Listing Preview
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-600 ml-auto" />
        </div>
        <div className="text-sm text-neutral-300 truncate">{listing.title}</div>
        <div className="text-xs text-neutral-500 mt-1">
          {money(listing.pricing.recommended)} · {formatInfo.label}
        </div>
      </button>
    );
  }

  return (
    <section className="rounded-2xl bg-white text-neutral-900 overflow-hidden shadow-xl shadow-black/40">
      {/* Preview banner */}
      <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-neutral-500" />
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            eBay Listing Preview
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] text-neutral-500 active:text-neutral-900 font-semibold"
        >
          Collapse
        </button>
      </div>

      {/* Hero image */}
      {thumbnails.length > 0 && (
        <div className="bg-neutral-50">
          <div className="aspect-square max-h-80 flex items-center justify-center p-3">
            <img
              src={thumbnails[heroIdx] || thumbnails[0]}
              alt={identificationName}
              className="max-h-full max-w-full object-contain rounded"
            />
          </div>
          {thumbnails.length > 1 && (
            <div className="flex gap-2 px-3 pb-3 no-scrollbar overflow-x-auto">
              {thumbnails.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIdx(i)}
                  className={`w-14 h-14 rounded border-2 overflow-hidden flex-shrink-0 ${
                    i === heroIdx ? 'border-blue-600' : 'border-neutral-200'
                  }`}
                >
                  <img src={t} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Title */}
        <div>
          <FieldLabel
            label="Title"
            onCopy={() => handleCopy('title', listing.title)}
            copied={copiedField === 'title'}
          />
          <div className="text-base font-semibold text-neutral-900 leading-snug">
            {listing.title}
          </div>
          <div
            className={`text-[10px] mt-1 ${titleOver ? 'text-rose-600 font-bold' : 'text-neutral-500'}`}
          >
            {titleCharCount} / 80 characters
            {titleOver && ' — OVER LIMIT'}
          </div>
        </div>

        {/* Category */}
        <div>
          <FieldLabel
            label="Category"
            onCopy={() => handleCopy('category', listing.categoryPath)}
            copied={copiedField === 'category'}
          />
          <div className="text-xs text-neutral-700 leading-snug">
            {listing.categoryPath}
          </div>
        </div>

        {/* Price with strategy toggle */}
        <div>
          <FieldLabel
            label="Price"
            onCopy={() => handleCopy('price', `$${selectedPrice}`)}
            copied={copiedField === 'price'}
          />
          <div className="flex items-baseline gap-2 mb-2">
            <div className="text-3xl font-black text-neutral-900">
              {money(selectedPrice)}
            </div>
            {selectedStrategy === listing.pricing.recommendedStrategy && (
              <div className="text-[9px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                Recommended
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-lg">
            <StrategyButton
              strategy="quick"
              label="Quick"
              price={listing.pricing.quick}
              selected={selectedStrategy === 'quick'}
              recommended={listing.pricing.recommendedStrategy === 'quick'}
              onClick={() => setSelectedStrategy('quick')}
            />
            <StrategyButton
              strategy="balanced"
              label="Balanced"
              price={listing.pricing.balanced}
              selected={selectedStrategy === 'balanced'}
              recommended={listing.pricing.recommendedStrategy === 'balanced'}
              onClick={() => setSelectedStrategy('balanced')}
            />
            <StrategyButton
              strategy="aggressive"
              label="Aggressive"
              price={listing.pricing.aggressive}
              selected={selectedStrategy === 'aggressive'}
              recommended={listing.pricing.recommendedStrategy === 'aggressive'}
              onClick={() => setSelectedStrategy('aggressive')}
            />
          </div>
        </div>

        {/* Format */}
        <div>
          <FieldLabel label="Format" />
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <FormatIcon className="w-4 h-4 text-blue-700" />
              <div className="text-sm font-bold text-blue-900">
                {formatInfo.label}
              </div>
              <div className="ml-auto text-[10px] text-blue-700 font-semibold">
                {listing.format.duration}
              </div>
            </div>
            <div className="text-[11px] text-blue-800/80 leading-snug">
              {listing.format.reasoning}
            </div>
            {listing.format.type === 'auction' &&
              listing.format.startingBid != null && (
                <div className="mt-2 text-[11px] text-blue-900 font-semibold">
                  Starting bid: {money(listing.format.startingBid)}
                </div>
              )}
          </div>
        </div>

        {/* Condition */}
        <div>
          <FieldLabel
            label="Condition"
            onCopy={() =>
              handleCopy(
                'condition',
                `${listing.condition.ebayGrade} — ${listing.condition.description}`
              )
            }
            copied={copiedField === 'condition'}
          />
          <div className="inline-block px-2 py-1 rounded bg-neutral-900 text-white text-xs font-bold mb-1">
            {listing.condition.ebayGrade}
          </div>
          <div className="text-xs text-neutral-700 leading-snug">
            {listing.condition.description}
          </div>
        </div>

        {/* Item specifics */}
        {listing.itemSpecifics?.length > 0 && (
          <div>
            <FieldLabel
              label="Item Specifics"
              onCopy={() =>
                handleCopy(
                  'specifics',
                  listing.itemSpecifics
                    .map((s) => `${s.name}: ${s.value}`)
                    .join('\n')
                )
              }
              copied={copiedField === 'specifics'}
            />
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              {listing.itemSpecifics.map((spec, i) => (
                <div
                  key={i}
                  className={`flex text-xs ${i % 2 === 0 ? 'bg-neutral-50' : 'bg-white'}`}
                >
                  <div className="w-1/2 px-3 py-2 text-neutral-600 font-semibold border-r border-neutral-200">
                    {spec.name}
                  </div>
                  <div className="w-1/2 px-3 py-2 text-neutral-900">
                    {spec.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <FieldLabel
            label="Description"
            onCopy={() => handleCopy('description', listing.description)}
            copied={copiedField === 'description'}
          />
          <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50 listing-prose">
            {listing.description.split(/\n\n+/).map((para, i) => (
              <p key={i} className="text-xs text-neutral-800 leading-relaxed">
                {para}
              </p>
            ))}
          </div>
        </div>

        {/* Shipping */}
        <div>
          <FieldLabel label="Shipping" />
          <div className="flex items-start gap-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <Truck className="w-4 h-4 text-neutral-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-neutral-900">
                {listing.shipping.suggestedService}
              </div>
              <div className="text-neutral-600">
                ~{money(listing.shipping.estimatedCost)} ·{' '}
                {listing.shipping.weightOz} oz
              </div>
              {listing.shipping.notes && (
                <div className="text-neutral-500 mt-1 leading-snug">
                  {listing.shipping.notes}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 space-y-3">
          <button
            onClick={openEbaySell}
            className="w-full py-3.5 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <ExternalLink className="w-4 h-4" />
            Copy All & Open eBay Sell
          </button>

          <button
            onClick={copyMobileFriendly}
            className="w-full py-3 rounded-2xl bg-neutral-800 active:bg-neutral-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
          >
            <Copy className="w-4 h-4" />
            Mobile-Friendly Copy (iPhone)
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyAll}
              className="py-2.5 rounded-lg bg-neutral-900 active:bg-neutral-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition"
            >
              {copiedField === 'all' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy markdown
                </>
              )}
            </button>
            <button
              onClick={shareListing}
              className="py-2.5 rounded-lg bg-neutral-100 active:bg-neutral-200 text-neutral-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
      </div>
      <ConfirmSheet
        open={showOpenEbayConfirm}
        title="Open eBay Sell?"
        message="Your listing text has been copied. This will open the eBay sell flow in a new tab or Safari."
        confirmLabel="Open eBay"
        onCancel={() => setShowOpenEbayConfirm(false)}
        onConfirm={() => {
          setShowOpenEbayConfirm(false);
          window.open('https://www.ebay.com/sl/sell', '_blank', 'noopener');
        }}
      />
      <Toast message={toastMessage} />
    </section>
  );
}

// ---------- Listing card sub-components ----------

function FieldLabel({
  label,
  onCopy,
  copied,
}: {
  label: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      {onCopy && (
        <button
          onClick={onCopy}
          className="text-[10px] text-neutral-500 active:text-neutral-900 flex items-center gap-1 font-semibold"
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span className="text-emerald-600">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      )}
    </div>
  );
}

function StrategyButton({
  strategy,
  label,
  price,
  selected,
  recommended,
  onClick,
}: {
  strategy: ListingStrategy;
  label: string;
  price: number;
  selected: boolean;
  recommended: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`py-2 px-1 rounded transition relative ${
        selected ? 'bg-white shadow' : 'active:bg-neutral-200'
      }`}
    >
      <div
        className={`text-[9px] uppercase font-bold ${selected ? 'text-neutral-900' : 'text-neutral-500'}`}
      >
        {label}
      </div>
      <div
        className={`text-sm font-bold ${selected ? 'text-neutral-900' : 'text-neutral-600'}`}
      >
        {money(price)}
      </div>
      {recommended && (
        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
      )}
    </button>
  );
}

// ---------- Collapsible helper ----------

function CollapsibleSection({
  icon: Icon,
  iconColor,
  title,
  defaultOpen,
  children,
}: {
  icon: typeof Search;
  iconColor: string;
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 flex-1">
          {title}
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-neutral-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-500" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none px-4 pb-safe-plus">
      <div className="mx-auto max-w-md rounded-2xl border border-neutral-700 bg-neutral-900/95 px-4 py-3 text-sm text-neutral-100 shadow-2xl shadow-black/40 backdrop-blur">
        {message}
      </div>
    </div>
  );
}

function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md mx-auto rounded-3xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl shadow-black/50">
        <div className="text-lg font-semibold text-white">{title}</div>
        <div className="mt-2 text-sm leading-relaxed text-neutral-400">{message}</div>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-semibold text-neutral-300 active:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              void onConfirm();
            }}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-blue-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
