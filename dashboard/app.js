const R = window.RADAR, M = R.meta, E = M.evidence, O = M.odds, A = M.accounting, VR = M.verdict_rule.farm_net_min_usd;
const $ = (s) => document.querySelector(s);
const fmt = (x) => x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + Math.round(x);
const fx = (x) => x.toFixed(2) + 'x';
const pc = (x) => (x * 100).toFixed(1) + '%';

$('#prov').textContent = `DefiLlama snapshot ${M.as_of} · ${A.scanned} read · refit by this run · no network`;
{
  const f = M.farm_rows;
  $('#verdict').innerHTML =
    `<span class="big">${f.farm} of ${f.total} pre-token protocols pay for their own farm at the pessimistic end of a calibrated band. The other ${f.total - f.farm} are priced, tested — and told no.</span>` +
    `<span class="nums"><span>held-out miss <b>${fx(E.loo_fit_universe)}</b></span><span>odds called <b>${pc(O.cv_accuracy)}</b> vs ${pc(O.base_rate)} base</span><span>coverage <b>${pc(E.conformal.measuredCoverage)}</b> measured</span></span>`;
}
{
  const rows = R.rows;
  const checks = [
    [rows.every((r, i) => r.rank === i + 1), `ranks 1–${rows.length} in order, recomputed here`],
    [rows.filter((r) => r.segment === 'watchlist').length === A.watchlist, `watchlist ${A.watchlist}/${A.watchlist} on the board`],
    [rows.reduce((s, r) => s + r.implied_value_usd, 0) === M.totals.implied_sum_usd, `Σ implied ${fmt(M.totals.implied_sum_usd)} = run total`],
  ];
  $('#audit').innerHTML = checks.map(([ok, t]) => `<span class="${ok ? '' : 'bad'}">${ok ? '✓' : '✗'} ${t}</span>`).join('');
}
{
  const segN = (s) => R.rows.filter((r) => r.segment === s).length;
  const excl = A.rankExcluded.reduce((s, r) => s + r.count, 0);
  const parts = [
    ['#2f9e6e', `Ranked — watchlist ${segN('watchlist')}`],
    ['#4da3ff', `Ranked — early, below the floor ${segN('below-floor')}`],
    ['#7ee2a0', `Ranked — off-list ${segN('off-list')}`],
    ...A.rankExcluded.map((r) => ['#8a6d2f', `Not ranked — ${r.label} ${r.count}`]),
    ['#39465c', `Already record a token ${A.scanned - A.ranked - excl}`],
  ];
  $('#acctbar').innerHTML =
    `<div class="bar">${parts.map(([c, t]) => `<i style="background:${c};width:${(parseInt(t.match(/\d+$/)[0]) / A.scanned * 100).toFixed(2)}%"></i>`).join('')}</div>` +
    `<div class="leg">${A.scanned} scanned · ${A.tradedAnchors} traded anchors (${A.fitEligible} fit-eligible) · ${A.ranked} ranked · watchlist ${A.watchlist}/${A.watchlist} · ${parts.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join(' · ')}</div>`;
}
function evidenceHTML() {
  const c = E.conformal;
  const kpi = [
    [`${fx(E.loo_fit_universe)}`, 'Held-out miss — declared universe', `leave-one-out on ${A.fitUniverse} fit anchors (cats ≥3, cap ≥ $1M)`],
    [`${fx(E.loo_all_eligible)}`, 'The same miss, nothing hidden', `all ${A.fitEligible} fit-eligible anchors, unedited`],
    [`${fx(E.walk_forward)}`, 'Walk-forward by listed_at', `${E.walk_forward_pairs} out-of-sample pairs, 3 origins`],
    [`${pc(O.cv_accuracy)}`, 'Launch odds called held-out', `vs base ${pc(O.base_rate)} · AUC ${O.cv_auc.toFixed(2)} · ${O.folds} folds`],
    [`${pc(c.measuredCoverage)}`, 'Band coverage, measured', `${pc(c.nominal)} promised · band ×/÷ e^${c.halfWidth.toFixed(2)}`],
    [`${M.farm_rows.farm} FARM`, 'Rows that clear their full cost', `of ${M.farm_rows.total} at the low band · THIN ${M.farm_rows.thin} · SKIP ${M.farm_rows.skip}`],
  ].map(([b, s, e]) => `<div class="kpi"><b>${b}</b><span>${s}</span><em>${e}</em></div>`).join('');
  const cand = E.candidates.map((x) => `<tr><td>${x.name}</td><td class="n">${fx(x.looFitU)}</td><td class="n">${fx(x.looAll)}</td>` +
    (x.winRate === null ? '<td class="n">—</td><td class="n">—</td>' : `<td class="n">${pc(x.winRate)} wins</td><td class="n">${fx(x.pooledCand)} vs ${fx(x.pooledBase)}</td>`) +
    `<td>${x.verdict}</td></tr>`).join('');
  const miss = E.misses.map((m) => `<tr><td>${m.name}</td><td>${m.category || '—'}</td><td class="n">${fmt(m.pred)}</td><td class="n">${fmt(m.actual)}</td><td class="n">${fx(m.fold)}</td></tr>`).join('');
  return kpi + `<div class="three">
    <div class="panel"><h3>Admission — every candidate, losers printed</h3>
    <table><tr><th>Learner</th><th class="n">LOO fit</th><th class="n">LOO all</th><th class="n">Folds</th><th class="n">Pooled</th><th>Verdict</th></tr>${cand}</table>
</div>
    <div class="panel"><h3>The 8 worst leave-one-out misses — unedited</h3>
    <table><tr><th>Protocol</th><th>Category</th><th class="n">Predicted</th><th class="n">Actual cap</th><th class="n">Fold</th></tr>${miss}</table></div>
    <div class="panel"><h3>Method and stress lines</h3>
    <p class="note">Value: ensemble of two kNN-5 learners over log cap/TVL (momentum, age, size, chain reach; second adds an Ethereum flag), category-mismatch penalty 0.75, on the ${A.fitUniverse}-anchor universe. Odds: logistic regression on all ${A.scanned} protocols. Implied = value if it launches × odds. Within-2x: fit ${pc(E.within2_fit_universe)}, all eligible ${pc(E.within2_all)}. Stress line, disclosed: 70/30 time-split (newest cohort) ${fx(E.time_split)}. Bootstrap 200 refits: median rank-range width ${E.bootstrap_median_rank_width.toFixed(0)} places. Momentum winsorised to the anchors' 5–95% band, prediction time only.</p>
    <p class="note">Reading it: only the two kNN learners beat the category-median baseline in paired folds — the price is local, read off the anchors nearest each row.</p></div></div>`;
}
function farmPanelHTML() {
  const farms = R.rows.filter((r) => r.verdict === 'FARM').sort((a, b) => b.net_usd - a.net_usd);
  const thins = R.rows.filter((r) => r.verdict === 'THIN').sort((a, b) => b.net_usd - a.net_usd).slice(0, 10);
  const totNet = farms.reduce((s, r) => s + r.net_usd, 0);
  const book = farms.map((r) => `<tr><td><span class="pname">${r.name}</span><br><span class="pcat">${r.category || ''} · ${r.chains.slice(0, 2).join(', ')}</span></td>` +
    `<td class="num">${fmt(r.band_low_usd)}</td><td class="num">${fmt(r.capture_usd)}</td><td class="num">${fmt(r.farm_cost_usd)}</td>` +
    `<td class="num">${r.farm_days}d</td><td class="num pos">${fmt(r.net_usd)}</td></tr>`).join('');
  const near = thins.map((r) => `<tr><td>${r.name}</td><td class="num">${fmt(r.net_usd)}</td><td class="num">${fmt(VR - r.net_usd)} short</td></tr>`).join('');
  return `<div class="two" style="margin-top:10px">
    <div class="panel"><h3>The farm book — every FARM row, costed (combined net ${fmt(totNet)})</h3>
    <table><tr><th>Protocol</th><th class="n">Low band</th><th class="n">Capture</th><th class="n">Cost</th><th class="n">Days</th><th class="n">Net</th></tr>${book}</table></div>
    <div class="panel"><h3>Closest THIN rows — short of FARM (net ≥ $${VR} at the low band)</h3>
    <table><tr><th>Protocol</th><th class="n">Net</th><th class="n">Shortfall</th></tr>${near}</table>
    <p class="note">Verdicts net at the low band, never the point estimate: FARM only if the pessimistic end still clears full cost by $${VR}. SKIP rows (${M.farm_rows.skip}) lose money at the low band outright.</p></div></div>`;
}
let sortKey = 'rank', sortDir = 1, view = 'board';
function rowHTML(r) {
  const chg = r.change_7d === null ? '—' : `<span class="${r.change_7d >= 0 ? 'pos' : 'neg'}">${r.change_7d >= 0 ? '+' : ''}${r.change_7d.toFixed(1)}%</span>`;
  return `<tr data-slug="${r.slug}"><td class="num">${r.rank}<span class="sub">refits ${r.rank_range[0]}–${r.rank_range[1]}</span></td>` +
    `<td><span class="pname">${r.name}</span> <span class="seg">${r.segment}</span><br><span class="pcat">${r.category || 'uncategorised'} · ${r.chains.slice(0, 3).join(', ')}</span></td>` +
    `<td class="num">${fmt(r.tvl_usd)}</td><td class="num">${chg}</td>` +
    `<td class="num">${fmt(r.value_if_launches_usd)}</td>` +
    `<td class="num">${r.launch_odds_pct.toFixed(0)}%<span class="obar"><i style="width:${r.launch_odds_pct.toFixed(0)}%"></i></span></td>` +
    `<td class="num"><b>${fmt(r.implied_value_usd)}</b></td>` +
    `<td class="num">${fmt(r.band_low_usd)} – ${fmt(r.band_high_usd)}</td>` +
    `<td><span class="v${r.verdict}">${r.verdict}</span><span class="sub ${r.net_usd >= 0 ? 'pos' : 'neg'}">net ${fmt(r.net_usd)}</span></td></tr>`;
}
function renderBoard() {
  const q = $('#q').value.toLowerCase(), seg = $('#seg').value, verd = $('#verd').value || (view === 'farm' ? 'FARM' : '');
  let rows = R.rows.filter((r) => (!seg || r.segment === seg) && (!verd || r.verdict === verd) &&
    (!q || (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().includes(q)));
  rows = [...rows].sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
  });
  if (view === 'farm' && sortKey === 'rank') rows.sort((a, b) => b.net_usd - a.net_usd);
  $('#board tbody').innerHTML = rows.map(rowHTML).join('');
  $('#rowcount').textContent = `${rows.length} of ${R.rows.length} rows shown. Click a row for its derivation, traded company and farm plan.`;
  $('#farmpanel').innerHTML = view === 'farm' ? farmPanelHTML() : '';
  document.querySelectorAll('#board tbody tr').forEach((tr) => tr.addEventListener('click', () => showDetail(tr.dataset.slug)));
}
document.querySelectorAll('#board th[data-k]').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'name' || k === 'verdict' ? 1 : -1; } renderBoard();
}));
['q', 'seg', 'verd'].forEach((id) => $('#' + id).addEventListener('input', renderBoard));
function showDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const ratio = r.value_if_launches_usd / r.tvl_usd;
  $('#boardwrap').hidden = true; $('#evidence').style.display = 'none';
  const d = $('#detail'); d.hidden = false;
  const margin = r.verdict === 'FARM' ? `clears the $${VR} line by ${fmt(r.net_usd - VR)}`
    : r.verdict === 'THIN' ? `falls ${fmt(VR - r.net_usd)} short of the $${VR} line`
    : `is under water at the low band outright`;
  const peers = (r.peers || []).map((p) => {
    const fold = p.mcap_usd / p.model_cap_usd;
    return `<tr><td>${p.name}${p.kin === 'overall' ? ' <span class="pcat">(nearest overall)</span>' : ''}</td><td class="n">${fmt(p.tvl_usd)}</td><td class="n">${fmt(p.mcap_usd)}</td><td class="n">${fmt(p.model_cap_usd)}</td><td class="n">${fold.toFixed(2)}x</td></tr>`;
  }).join('');
  d.innerHTML = `<button class="back" onclick="backToBoard()">← back to board</button>
  <div class="dhead"><div><h2>#${r.rank} ${r.name} <span class="seg">${r.segment}</span> <span class="v${r.verdict}">${r.verdict}</span></h2>
  <p class="note">${r.category || 'uncategorised'} · ${r.chains.join(', ')} · TVL ${fmt(r.tvl_usd)} · 7d change ${r.change_7d === null ? 'not reported' : r.change_7d.toFixed(1) + '%'} · bootstrap rank range ${r.rank_range[0]}–${r.rank_range[1]} across 200 refits</p></div>
  <div class="big"><span class="note">implied value — a model estimate</span><b>${fmt(r.implied_value_usd)}</b><span class="note">value if it launches ${fmt(r.value_if_launches_usd)} · odds ${r.launch_odds_pct.toFixed(1)}%</span></div></div>
  <h3>How this price is built</h3>
  <table class="steps"><tr><th>Step</th><th class="n">Factor</th><th class="n">Running value</th><th>Where the number comes from</th></tr>
  <tr><td>TVL, DefiLlama snapshot ${M.as_of}</td><td class="n">—</td><td class="n">${fmt(r.tvl_usd)}</td><td>The snapshot's own figure — the only input the price starts from.</td></tr>
  <tr><td>× fitted cap/TVL ratio</td><td class="n">${ratio.toFixed(4)}</td><td class="n">${fmt(r.value_if_launches_usd)}</td><td>Geometric mean of two kNN-5 learners on the declared ${A.fitUniverse}-anchor universe; the local ratio is read off the anchors nearest this row in momentum, age, size and chain reach.</td></tr>
  <tr><td>× launch odds</td><td class="n">${(r.launch_odds_pct / 100).toFixed(3)}</td><td class="n">${fmt(r.implied_value_usd)}</td><td>Logistic fit on all ${A.scanned} protocols — size, age, reach, momentum, category; called held-out at ${pc(O.cv_accuracy)} vs a ${pc(O.base_rate)} base rate.</td></tr>
  <tr class="tot"><td>80% band (split-conformal)</td><td class="n">×/÷ e^${E.conformal.halfWidth.toFixed(2)}</td><td class="n">${fmt(r.band_low_usd)} – ${fmt(r.band_high_usd)}</td><td>Measured coverage ${pc(E.conformal.measuredCoverage)} at ${pc(E.conformal.nominal)} promised. The farm verdict is netted at the low end, never the point estimate.</td></tr></table>
  <h3>The traded company it keeps</h3>
  <table class="steps"><tr><th>Traded anchor</th><th class="n">TVL</th><th class="n">Real cap</th><th class="n">This model prices it at</th><th class="n">Real ÷ model</th></tr>${peers}</table>
  <p class="note">Same-category traded anchors first; where fewer than three trade, the nearest by size fill the table, marked (nearest overall). The ensemble's price for each anchor stands next to its real cap — the same check the leave-one-out table on page 1 runs over all 128 fit-eligible anchors.</p>
  <h3>Farm verdict — cost from category + chain + chase surcharge</h3>
  <div class="arith">capture <b>${fmt(r.capture_usd)}</b> at the low band − full cost <b>${fmt(r.farm_cost_usd)}</b> over ~${r.farm_days} days = net <b>${fmt(r.net_usd)}</b> → <b>${r.verdict}</b> — ${margin}.</div>
  <ol class="steps">${r.farm_steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
  window.scrollTo(0, 0);
}
function backToBoard() { $('#detail').hidden = true; $('#boardwrap').hidden = false; $('#evidence').style.display = ''; window.scrollTo(0, 0); }
function setView(v) {
  view = v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#evidence').innerHTML = v === 'board' ? evidenceHTML() : '';
  $('#evidence').style.display = v === 'board' ? '' : 'none';
  backToBoard();
  if (v !== 'board') { $('#detail').hidden = true; $('#boardwrap').hidden = false; }
  renderBoard();
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#foot').textContent = `Snapshot: ${M.source}. Implied values are fitted claims, not predictions; the chips under the verdict re-check this page against the run's data.`;

setView('board');
const h = location.hash;
if (h === '#farm') setView('farm');
else if (h.startsWith('#detail-')) showDetail(h.slice(8));
