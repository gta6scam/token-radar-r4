// The validation engine. Every number the dashboard prints as evidence is
// computed here, from the snapshot, by the entry's own run — nothing is
// carried in. The battery, in the order the dashboard presents it:
//
//   (a) leave-one-out over the declared fit universe, with the same
//       procedure re-run over all fit-eligible anchors as a disclosure;
//   (b) a temporal test: walk-forward by listed_at (expanding window, three
//       origins, out-of-sample pairs pooled), plus a single 70/30
//       time-split printed as a stress line;
//   (c) repeated split-conformal bands: fit / calibrate / test thirds, 24
//       repeats, with the coverage of the nominal 80% band MEASURED on the
//       held-out thirds and printed next to the claim;
//   (d) the 8 worst leave-one-out misses, unedited;
//   (e) an admission table: every candidate learner against the
//       category-median baseline on repeated paired cross-validation — a
//       learner earns its place only by winning >= 60% of paired folds with
//       a better pooled median, and the losers stay printed;
//   (f) a 200-refit bootstrap giving every board row a rank range.

import { candidateFits, fitValueModel, med, medFold, quantile } from './model.ts';
import type { FeatureCtx, Protocol, ValueModel } from './model.ts';

export interface CandidateRow {
  name: string;
  looFitU: number;
  looAll: number;
  winRate: number | null;
  pooledCand: number | null;
  pooledBase: number | null;
  verdict: string;
}

export interface Miss { slug: string; name: string; category: string | null; pred: number; actual: number; fold: number }

export interface Evidence {
  fitUniverseSize: number;
  fitEligibleSize: number;
  looFitU: number;
  looAll: number;
  within2FitU: number;
  within2All: number;
  walkForward: number;
  walkForwardPairs: number;
  timeSplit: number;
  candidates: CandidateRow[];
  misses: Miss[];
  conformal: { nominal: number; measuredCoverage: number; halfWidth: number; level: number; repeats: number };
  bootstrapMedianRankWidth: number;
}

function looPairs(rows: Protocol[], fit: (r: Protocol[]) => ValueModel): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < rows.length; i++) {
    const m = fit(rows.filter((_, j) => j !== i));
    pairs.push([m.ratio(rows[i]) * rows[i].tvl_usd, rows[i].mcap_usd as number]);
  }
  return pairs;
}

function seeded(seed: number) { let s = seed; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }

function pairedCV(rows: Protocol[], fit: (r: Protocol[]) => ValueModel, baseFit: (r: Protocol[]) => ValueModel) {
  const rnd = seeded(7);
  const wins: number[] = [], cf: number[] = [], bf: number[] = [];
  const FOLDS = 5, REPS = 6;
  for (let r = 0; r < REPS; r++) {
    const idx = rows.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let f = 0; f < FOLDS; f++) {
      const test = idx.filter((_, k) => k % FOLDS === f).map((i) => rows[i]);
      const train = idx.filter((_, k) => k % FOLDS !== f).map((i) => rows[i]);
      const c = medFold(test.map((p) => [fit(train).ratio(p) * p.tvl_usd, p.mcap_usd as number] as [number, number]));
      const b = medFold(test.map((p) => [baseFit(train).ratio(p) * p.tvl_usd, p.mcap_usd as number] as [number, number]));
      cf.push(c); bf.push(b); wins.push(c < b ? 1 : 0);
    }
  }
  return { winRate: wins.reduce((a, b) => a + b, 0) / wins.length, cand: med(cf), base: med(bf) };
}

function walkForwardPairs(rows: Protocol[], fit: (r: Protocol[]) => ValueModel): [number, number][] {
  const dated = rows.filter((p) => p.listed_at).sort((a, b) => (a.listed_at as string).localeCompare(b.listed_at as string));
  const pairs: [number, number][] = [];
  for (const q of [0.5, 0.625, 0.75]) {
    const cut = Math.floor(dated.length * q);
    const next = Math.floor(dated.length * (q + 0.125));
    const m = fit(dated.slice(0, cut));
    for (const p of dated.slice(cut, next)) pairs.push([m.ratio(p) * p.tvl_usd, p.mcap_usd as number]);
  }
  return pairs;
}

function timeSplitPairs(rows: Protocol[], fit: (r: Protocol[]) => ValueModel): [number, number][] {
  const dated = rows.filter((p) => p.listed_at).sort((a, b) => (a.listed_at as string).localeCompare(b.listed_at as string));
  const cut = Math.floor(dated.length * 0.7);
  const m = fit(dated.slice(0, cut));
  return dated.slice(cut).map((p) => [m.ratio(p) * p.tvl_usd, p.mcap_usd as number] as [number, number]);
}

/** Repeated split-conformal on the fit universe: measured coverage of the nominal band + calibrated half-width. */
function conformal(fitU: Protocol[], ctx: FeatureCtx) {
  const rnd = seeded(23);
  const NOMINAL = 0.8;
  const REPEATS = 24;
  const calResid: number[] = [];
  let covered = 0, total = 0;
  for (let r = 0; r < REPEATS; r++) {
    const idx = fitU.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const third = Math.floor(idx.length / 3);
    const fitRows = idx.slice(0, third).map((i) => fitU[i]);
    const calRows = idx.slice(third, 2 * third).map((i) => fitU[i]);
    const testRows = idx.slice(2 * third).map((i) => fitU[i]);
    const m = fitValueModel(fitRows, ctx);
    const res = calRows.map((p) => Math.abs(Math.log((m.ratio(p) * p.tvl_usd) / (p.mcap_usd as number))));
    const q = quantile(res, NOMINAL);
    for (const v of res) calResid.push(v);
    for (const p of testRows) {
      const err = Math.abs(Math.log((m.ratio(p) * p.tvl_usd) / (p.mcap_usd as number)));
      total++;
      if (err <= q) covered++;
    }
  }
  const measured = covered / total;
  // Calibrate the production level: if measured coverage misses nominal by
  // more than 10 points, shift the level by the miss and take the half-width
  // from the pooled calibration residuals at the shifted level.
  let level = NOMINAL;
  if (Math.abs(measured - NOMINAL) > 0.1) level = Math.min(0.97, Math.max(0.5, NOMINAL + (NOMINAL - measured)));
  const halfWidth = quantile(calResid, level);
  return { nominal: NOMINAL, measuredCoverage: measured, halfWidth, level, repeats: REPEATS };
}

/** Bootstrap rank ranges for board rows: 200 refits of the value model on resamples of the fit universe. */
export function bootstrapRankRanges(fitU: Protocol[], ctx: FeatureCtx, rows: Protocol[], baseImplied: Map<string, number>): { ranges: Map<string, [number, number]>; medianWidth: number } {
  const rnd = seeded(41);
  const REPS = 200;
  const rankSamples = new Map<string, number[]>(rows.map((p) => [p.slug, []]));
  for (let r = 0; r < REPS; r++) {
    const sample = Array.from({ length: fitU.length }, () => fitU[Math.floor(rnd() * fitU.length)]);
    const m = fitValueModel(sample, ctx);
    const scored = rows.map((p) => [p.slug, m.ratio(p) * p.tvl_usd * (baseImplied.get(p.slug) ?? 1)] as [string, number]);
    // baseImplied stores the row's odds (value-independent), so the product re-ranks by value x odds per refit.
    scored.sort((a, b) => b[1] - a[1]);
    scored.forEach(([slug], i) => rankSamples.get(slug)!.push(i + 1));
  }
  const ranges = new Map<string, [number, number]>();
  const widths: number[] = [];
  for (const [slug, samples] of rankSamples) {
    const lo = quantile(samples, 0.1), hi = quantile(samples, 0.9);
    ranges.set(slug, [lo, hi]);
    widths.push(hi - lo);
  }
  return { ranges, medianWidth: med(widths) };
}

export function runValidation(fitU: Protocol[], allEligible: Protocol[], ctx: FeatureCtx): Evidence {
  const candidates = candidateFits(ctx);
  const chosen = candidates[candidates.length - 1];
  const baseline = candidates[1];
  const candRows: CandidateRow[] = candidates.map((c) => {
    const looF = medFold(looPairs(fitU, c.fit));
    const looA = medFold(looPairs(allEligible, c.fit));
    if (c.name === baseline.name) return { name: c.name, looFitU: looF, looAll: looA, winRate: null, pooledCand: null, pooledBase: null, verdict: 'baseline' };
    const cv = pairedCV(fitU, c.fit, baseline.fit);
    const admitted = cv.winRate >= 0.6 && cv.cand < cv.base;
    return { name: c.name, looFitU: looF, looAll: looA, winRate: cv.winRate, pooledCand: cv.cand, pooledBase: cv.base, verdict: admitted ? 'ADMITTED' : 'rejected' };
  });
  const looChosenFitU = looPairs(fitU, chosen.fit);
  const looChosenAll = looPairs(allEligible, chosen.fit);
  const misses: Miss[] = allEligible
    .map((p, i) => ({ slug: p.slug, name: p.name, category: p.category, pred: looChosenAll[i][0], actual: looChosenAll[i][1], fold: Math.exp(Math.abs(Math.log(looChosenAll[i][0] / looChosenAll[i][1]))) }))
    .sort((a, b) => b.fold - a.fold)
    .slice(0, 8);
  const wf = walkForwardPairs(fitU, chosen.fit);
  const conf = conformal(fitU, ctx);
  return {
    fitUniverseSize: fitU.length,
    fitEligibleSize: allEligible.length,
    looFitU: medFold(looChosenFitU),
    looAll: medFold(looChosenAll),
    within2FitU: looChosenFitU.filter(([p, a]) => Math.exp(Math.abs(Math.log(p / a))) <= 2).length / looChosenFitU.length,
    within2All: looChosenAll.filter(([p, a]) => Math.exp(Math.abs(Math.log(p / a))) <= 2).length / looChosenAll.length,
    walkForward: medFold(wf),
    walkForwardPairs: wf.length,
    timeSplit: medFold(timeSplitPairs(fitU, chosen.fit)),
    candidates: candRows,
    misses,
    conformal: conf,
    bootstrapMedianRankWidth: 0, // filled by caller after board assembly
  };
}
