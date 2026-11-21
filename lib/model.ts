// The token-radar challenger's model: snapshot in, ranked board + evidence out.
//
// Two fitted models, both derived from the snapshot's own numbers and both
// tested held-out in lib/validate.ts before a single board row is priced:
//
//   VALUE  — what a token would be worth if the protocol launched one.
//            An ensemble of two k-nearest-neighbour regressors (k=5) over
//            the log market-cap/TVL ratios of the traded anchors. Learner A
//            sees winsorised 7-day momentum, log age, log size and chain
//            reach; learner B adds an Ethereum-presence flag. Neighbours are
//            found in standardised feature space, with a distance penalty
//            when the neighbour's category differs from the row's. The
//            prediction is the neighbours' median log-ratio, geometrically
//            averaged across the two learners.
//   ODDS   — the launch-odds model in lib/odds.ts: of the protocols that
//            look like this one, how many already record a token?
//
//   implied value = value if it launches x launch odds
//
// The value model is fitted on a DECLARED fit universe: traded anchors whose
// recorded market cap is positive, whose launch is material (cap >= $1M),
// and whose category carries at least three such anchors, so a category
// effect is estimable at all. Every validation number is also disclosed for
// all 128 fit-eligible anchors beside it — see lib/validate.ts.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const quantile = (xs: number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]; };
export const foldErr = (pred: number, actual: number) => Math.exp(Math.abs(Math.log(pred / actual)));
export const medFold = (pairs: [number, number][]) => med(pairs.map(([p, a]) => foldErr(p, a)));

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) throw new Error('snapshot: protocols/watchlist missing');
  return raw;
}

// ---------- universes & accounting ----------
export interface Accounting {
  scanned: number;
  tradedAnchors: number;
  fitEligible: number;
  fitUniverse: number;
  preToken: number;
  watchlist: number;
  offList: number;
  belowFloor: number;
  ranked: number;
  notRanked: number;
  parentRuleRanked: number;
  rankExcluded: { label: string; count: number }[];
  reasons: { label: string; count: number }[];
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const BAD_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const PRODUCT_CATS = BAD_CATS; // exactly the house's own product-category set, applied snapshot-wide
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The first house-rule reason a pre-token protocol at/above the floor is off the watchlist. */
export function offListReason(p: Protocol): string {
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped/staked name';
  if (p.category !== null && BAD_CATS.has(p.category)) return 'bridge/staking/CEX category';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange product';
  return 'parent protocol (house record; field not in snapshot)';
}

/**
 * Board eligibility: a pre-token protocol is ranked unless the snapshot
 * itself marks it as a product of another token or a non-issuer — a wrapped
 * or staked product of a token that already trades is not a launch that has
 * not happened yet (the snapshot's own warning). Returns the exclusion
 * reason, or null when the protocol is a rankable launch candidate. The
 * house's parent-protocol rule is NOT applied: that field is not in the
 * snapshot, so the 20 off-list protocols it alone excludes are ranked and
 * the fact is disclosed in the accounting.
 */
export function rankExclusion(p: Protocol): string | null {
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped/staked name';
  if (p.category !== null && PRODUCT_CATS.has(p.category)) return 'product category (bridge/staking/CEX)';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange product';
  return null;
}

export const isPreToken = (p: Protocol) => p.gecko_id === null && p.symbol === null;
export const tradedAnchors = (s: Snapshot) => s.protocols.filter((p) => p.mcap_usd !== null);
export const fitEligible = (s: Snapshot) => s.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);

/** Declared fit universe: fit-eligible anchors with a material cap in a category of >= 3 anchors. */
export function fitUniverse(s: Snapshot): Protocol[] {
  const elig = fitEligible(s);
  const counts = new Map<string, number>();
  for (const p of elig) counts.set(p.category ?? '', (counts.get(p.category ?? '') ?? 0) + 1);
  return elig.filter((p) => p.mcap_usd !== null && p.mcap_usd >= 1_000_000 && (counts.get(p.category ?? '') ?? 0) >= 3);
}

export function accounting(s: Snapshot, rankedCount: number): Accounting {
  const wl = new Set(s.watchlist);
  const pre = s.protocols.filter(isPreToken);
  const off = pre.filter((p) => p.tvl_usd >= s.floor_usd && !wl.has(p.slug));
  const reasonCounts = new Map<string, number>();
  for (const p of off) reasonCounts.set(offListReason(p), (reasonCounts.get(offListReason(p)) ?? 0) + 1);
  const exclCounts = new Map<string, number>();
  for (const p of pre) {
    const r = rankExclusion(p);
    if (r !== null) exclCounts.set(r, (exclCounts.get(r) ?? 0) + 1);
  }
  return {
    scanned: s.protocols.length,
    tradedAnchors: tradedAnchors(s).length,
    fitEligible: fitEligible(s).length,
    fitUniverse: fitUniverse(s).length,
    preToken: pre.length,
    watchlist: s.watchlist.length,
    offList: off.length,
    belowFloor: pre.filter((p) => p.tvl_usd < s.floor_usd).length,
    ranked: rankedCount,
    notRanked: pre.length - rankedCount,
    parentRuleRanked: off.filter((p) => offListReason(p).startsWith('parent protocol') && rankExclusion(p) === null).length,
    rankExcluded: [...exclCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    reasons: [...reasonCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

// ---------- value model ----------
export interface ValueModel {
  /** Predicted mcap/TVL ratio for a protocol profile. */
  ratio: (p: Protocol) => number;
}

export interface FeatureCtx {
  winsorLo: number;
  winsorHi: number;
  ageMedianYears: number;
  asOfMs: number;
}

export function featureCtx(anchors: Protocol[], asOf: string): FeatureCtx {
  const chg = anchors.map((p) => p.change_7d).filter((x): x is number => x !== null);
  const asOfMs = new Date(asOf + 'T00:00:00Z').getTime();
  const ages = anchors.map((p) => ageYears(p, asOfMs)).filter((x): x is number => x !== null);
  return { winsorLo: quantile(chg, 0.05), winsorHi: quantile(chg, 0.95), ageMedianYears: med(ages), asOfMs };
}

export const ageYears = (p: Protocol, asOfMs: number): number | null =>
  p.listed_at ? Math.max(0, (asOfMs - new Date(p.listed_at + 'T00:00:00Z').getTime()) / 86_400_000 / 365.25) : null;

export const winsorise = (ctx: FeatureCtx, x: number | null) => (x === null ? 0 : Math.min(ctx.winsorHi, Math.max(ctx.winsorLo, x)));

const K = 5;
const CAT_PENALTY = 0.75;

function features(ctx: FeatureCtx, p: Protocol, withEth: boolean): number[] {
  const f = [
    winsorise(ctx, p.change_7d) / 100,
    Math.log1p(ageYears(p, ctx.asOfMs) ?? ctx.ageMedianYears),
    Math.log10(p.tvl_usd / 1e6),
    Math.log2(1 + p.chains.length),
  ];
  if (withEth) f.push(p.chains.includes('Ethereum') ? 1 : 0);
  return f;
}

function fitKnn(rows: Protocol[], ctx: FeatureCtx, withEth: boolean): ValueModel {
  const F = rows.map((p) => features(ctx, p, withEth));
  const dims = F[0].length;
  const mu = Array.from({ length: dims }, (_, j) => F.reduce((s, f) => s + f[j], 0) / F.length);
  const sd = Array.from({ length: dims }, (_, j) => Math.sqrt(F.reduce((s, f) => s + (f[j] - mu[j]) ** 2, 0) / F.length) || 1);
  const Z = F.map((f) => f.map((v, j) => (v - mu[j]) / sd[j]));
  const ly = rows.map((p) => Math.log((p.mcap_usd as number) / p.tvl_usd));
  const queryCache = new Map<string, number[]>();
  return {
    ratio: (p) => {
      let zp = queryCache.get(p.slug);
      if (zp === undefined) {
        zp = features(ctx, p, withEth).map((v, j) => (v - mu[j]) / sd[j]);
        queryCache.set(p.slug, zp);
      }
      const dists = Z.map((zi, i) => {
        let d = 0;
        for (let j = 0; j < dims; j++) d += (zi[j] - zp[j]) ** 2;
        return [Math.sqrt(d) + (rows[i].category === p.category ? 0 : CAT_PENALTY), i] as [number, number];
      });
      dists.sort((a, b) => a[0] - b[0]);
      return Math.exp(med(dists.slice(0, K).map(([, i]) => ly[i])));
    },
  };
}

/** The production value model: geometric mean of the two kNN learners. Fitted on the rows given. */
export function fitValueModel(rows: Protocol[], ctx: FeatureCtx): ValueModel {
  const a = fitKnn(rows, ctx, false);
  const b = fitKnn(rows, ctx, true);
  return { ratio: (p) => Math.sqrt(a.ratio(p) * b.ratio(p)) };
}

/** Candidate learners for the printed admission table. Each is a fit function over anchor rows. */
export function candidateFits(ctx: FeatureCtx): { name: string; fit: (rows: Protocol[]) => ValueModel }[] {
  const catBase = (rows: Protocol[]): ValueModel => {
    const g = med(rows.map((p) => Math.log((p.mcap_usd as number) / p.tvl_usd)));
    const by = new Map<string, number[]>();
    for (const p of rows) { if (!by.has(p.category ?? '')) by.set(p.category ?? '', []); by.get(p.category ?? '')!.push(Math.log((p.mcap_usd as number) / p.tvl_usd)); }
    const eff = new Map([...by].map(([c, rs]) => [c, (rs.length * med(rs) + 4 * g) / (rs.length + 4)]));
    return { ratio: (p) => Math.exp(eff.get(p.category ?? '') ?? g) };
  };
  const globalMed = (rows: Protocol[]): ValueModel => {
    const g = med(rows.map((p) => Math.log((p.mcap_usd as number) / p.tvl_usd)));
    return { ratio: () => Math.exp(g) };
  };
  return [
    { name: 'global median ratio (no features)', fit: globalMed },
    { name: 'category median, shrunk K=4 (baseline)', fit: catBase },
    { name: 'kNN-5, no Ethereum flag', fit: (rows) => fitKnn(rows, ctx, false) },
    { name: 'kNN-5, with Ethereum flag', fit: (rows) => fitKnn(rows, ctx, true) },
    { name: 'ensemble of both kNN learners (CHOSEN)', fit: (rows) => fitValueModel(rows, ctx) },
  ];
}
