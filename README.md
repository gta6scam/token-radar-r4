[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gta6scam/token-radar-r4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gta6scam/token-radar-r4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar — every price checked against live caps: LOO ×2.29 (×3.66 on all 128 disclosed), walk-forward ×1.63, odds 70.8% vs 54.9% base, band coverage 79.9% measured, 198 ranked, 5 FARM at the low band

A token launch radar for make.fun's token-radar-01. It reads the sealed
DefiLlama snapshot (`/input/snapshot.json`), fits two models on the
snapshot's own numbers, validates them held-out, and ranks 198 pre-token
protocols by implied value, each with a costed farm plan and a verdict.
The dashboard opens with the board's verdict — 5 of the 198 rows clear
their full farm cost at the pessimistic end of the calibrated band — and
re-checks itself in the browser: ranks in order, watchlist 40/40, and the
page total recomputed against the run total, printed as chips under the
verdict. Every protocol's detail page names the traded company behind its
price: the same-category traded anchors nearest in size, each with its
real cap and the cap this model assigns it.

**Value model.** An ensemble of two k-nearest-neighbour regressors (k=5)
over the log market-cap/TVL ratios of the traded anchors — winsorised 7-day
momentum, log age, log size, chain reach; the second learner adds an
Ethereum-presence flag. Fitted on a declared fit universe (fit-eligible
anchors with a material cap in categories of ≥3 anchors). Leave-one-out,
walk-forward by `listed_at`, repeated split-conformal coverage and a
200-refit bootstrap are computed by the entry's own run and printed on the
dashboard's evidence panel, together with every losing candidate learner
and the 8 worst misses, unedited.

**Launch-odds model.** A logistic regression over all 758 protocols
(label: the protocol already records a token), tested with stratified
cross-validation against the 54.9% base rate.

**Implied value** = value if it launches × launch odds. Bands are the
calibrated 80% conformal band; farm verdicts (FARM / THIN / SKIP) are
netted at each row's low band under a declared capture share, with the
arithmetic printed in the last farm step of every row.

Run it:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Layout: `main.ts` (orchestration), `lib/model.ts` (value model +
accounting), `lib/validate.ts` (the validation battery), `lib/odds.ts`
(launch odds), `lib/farm.ts` (farm plans + verdicts), `dashboard/` (the
page the judge reads), `screenshots/` (board + evidence, one detail, the
FARM view), `vendor/makefun-board.ts` (the competition's dossier library).
