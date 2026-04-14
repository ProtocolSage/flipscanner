// ============================================================================
// FlipScanner schema
// ============================================================================
// Two modes:
//   - "sourcing":  user supplied an asking price → app emits BUY/PASS/MAYBE
//   - "inventory": no asking price → app emits listing-ready output, no verdict
// ============================================================================

export type ScanMode = 'sourcing' | 'inventory';
export type VerdictAction = 'BUY' | 'PASS' | 'MAYBE';
export type ListingStrategy = 'aggressive' | 'balanced' | 'quick';
export type ListingFormat = 'auction' | 'buy_it_now' | 'bin_with_offers';
export type CompType = 'sold' | 'asking' | 'reference';

export type EbayCondition =
  | 'New'
  | 'New with tags'
  | 'New without tags'
  | 'New with defects'
  | 'Open box'
  | 'Used'
  | 'Pre-owned'
  | 'Very Good'
  | 'Good'
  | 'Acceptable'
  | 'For parts or not working';

// ---------- Analysis pieces -------------------------------------------------

export interface Identification {
  name: string;
  year: string;
  maker: string;
  variant: string;
  confidence: number;
}

export interface MarketData {
  avgSold: number;
  median: number;
  low: number;
  high: number;
  sampleSize: number;
  soldCount: number;
  askingCount: number;
  timeframe: string;
}

export interface ConditionAssessment {
  observed: string;
  notes: string[];
  valueImpact: string;
}

export interface Comp {
  title: string;
  price: number;
  source: string;
  type: CompType;
  date?: string;
  url?: string;
}

// ---------- eBay listing ----------------------------------------------------

export interface EbayListingPricing {
  aggressive: number;
  balanced: number;
  quick: number;
  recommended: number;
  recommendedStrategy: ListingStrategy;
}

export interface EbayListingFormatRecommendation {
  type: ListingFormat;
  reasoning: string;
  duration: string;
  acceptOffers: boolean;
  startingBid?: number;
}

export interface EbayItemSpecific {
  name: string;
  value: string;
}

export interface EbayShipping {
  weightOz: number;
  suggestedService: string;
  estimatedCost: number;
  notes: string;
}

export interface EbayListing {
  title: string;
  categoryPath: string;
  categoryLeaf: string;
  pricing: EbayListingPricing;
  format: EbayListingFormatRecommendation;
  condition: {
    ebayGrade: EbayCondition;
    description: string;
  };
  itemSpecifics: EbayItemSpecific[];
  description: string;
  shipping: EbayShipping;
}

// ---------- Verdict (sourcing only) -----------------------------------------

export interface Verdict {
  action: VerdictAction;
  targetBuyPrice: number;
  expectedProfit: number;
  reasoning: string;
  risks: string[];
}

// ---------- Full result -----------------------------------------------------

export interface GrokAnalysis {
  identification: Identification;
  market: MarketData;
  condition: ConditionAssessment;
  comps: Comp[];
  verdict: Verdict | null;
  listing: EbayListing;
  tips: string[];
}

export interface AnalyzeResponse extends GrokAnalysis {
  id: number;
  timestamp: string;
  mode: ScanMode;
  askingPrice: number | null;
  citations: string[];
  model: string;
  enhancedImages: string[];
}

export interface ScanResult extends AnalyzeResponse {
  thumbnails: string[];
}

// ---------- Request shapes --------------------------------------------------

export interface AnalyzeRequestImage {
  data: string;
  mediaType: string;
}

export interface AnalyzeRequest {
  images: AnalyzeRequestImage[];
  askingPrice: string;
  categoryHint: string;
  conditionHint: string;
  enableBackgroundEnhancer?: boolean;
  backgroundSuggestion?: string;
}

// ---------- Client-only -----------------------------------------------------

export interface ImageSlot {
  id: string;
  data: string;
  mediaType: string;
  preview: string;
}
