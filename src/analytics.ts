import type { ChartData } from './ibkr'

/** Portfolio metrics derived from an already-built ChartData (no network). */

export type TickerStats = {
  sym: string
  invested: number
  value: number
  earn: number
  /** earn / invested, fraction (0.12 = +12%). */
  returnPct: number | null
  /** Money-weighted annualised return; null when the history is too short. */
  xirr: number | null
  dividends: number
  /** Share of current share-holdings value (excluding idle cash), 0..1. */
  weight: number
  /** Share of total P&L this ticker produced (can exceed 1 or be negative). */
  contribution: number | null
  /** Gain needed from here to get back to cost (only when under water). */
  breakEvenGain: number | null
}

export type PortfolioStats = {
  asOf: string
  firstBuy: string
  days: number
  buysCount: number
  invested: number
  value: number
  cash: number
  /** Net deposits from the statement, when known. */
  deposited: number | null
  earn: number
  returnPct: number | null
  xirr: number | null
  /** Highest TOTAL P&L ever reached, in EUR, and the day it happened. */
  maxProfit: number
  maxProfitDate: string
  /** Worst peak-to-trough fall of TOTAL P&L, in EUR (≤ 0). */
  maxDrawdown: number
  /** Current distance of TOTAL P&L below its peak, in EUR (≤ 0). */
  drawdownNow: number
  /** Last ALL_VOO − TOTAL, if the benchmark exists. */
  vsBaseline: number | null
  baseline: string
  /** 1 / Σw² — how many equal-sized positions the mix behaves like. */
  effectiveHoldings: number
  largest: { sym: string; weight: number } | null
  avgBuy: number
  daysSinceLastBuy: number
  tickers: TickerStats[]
}

const DAY = 86400000
const MIN_XIRR_DAYS = 60

function dayMs(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getTime()
}

/** Annualised IRR for dated flows (negative = money in, last = value out). */
export function xirr(flows: { t: number; amt: number }[]): number | null {
  if (flows.length < 2) return null
  const hasPos = flows.some((f) => f.amt > 0)
  const hasNeg = flows.some((f) => f.amt < 0)
  if (!hasPos || !hasNeg) return null
  const t0 = Math.min(...flows.map((f) => f.t))
  const npv = (r: number) =>
    flows.reduce(
      (s, f) => s + f.amt / Math.pow(1 + r, (f.t - t0) / (365 * DAY)),
      0,
    )
  let lo = -0.9999
  let hi = 100
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
    return null
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (fLo * fMid <= 0) {
      hi = mid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}

function sumBuys(data: ChartData, sym?: string) {
  let s = 0
  for (const b of data.buys) if (!sym || b.sym === sym) s += b.eur
  return s
}

/**
 * @param invested  per-key “in” as shown on the chart (see investedBySeries).
 */
export function computeStats(
  data: ChartData,
  invested: Record<string, number>,
): PortfolioStats | null {
  const n = data.dates.length
  const total = data.series.TOTAL
  if (!n || !total || !data.buys.length) return null

  const asOf = data.dates[n - 1]!
  const endMs = dayMs(asOf)
  const tickers = data.tickers.filter((t) => data.series[t])
  const dividendsEur = data.dividendsEur ?? {}

  // Flows per key. Legacy charts scale buys to funding so Σ flows = “in”.
  const flowsFor = (sym?: string) => {
    const raw = sumBuys(data, sym)
    const key = sym ?? 'TOTAL'
    const scale = raw > 0 && invested[key] ? invested[key]! / raw : 1
    return data.buys
      .filter((b) => !sym || b.sym === sym)
      .map((b) => ({ t: dayMs(b.date), amt: -b.eur * scale }))
  }

  const firstBuy = data.buys.map((b) => b.date).sort()[0]!
  const lastBuy = data.buys.map((b) => b.date).sort().at(-1)!
  const days = Math.max(0, Math.round((endMs - dayMs(firstBuy)) / DAY))

  const xirrOf = (sym: string | undefined, value: number) => {
    const flows = flowsFor(sym)
    if (!flows.length) return null
    const first = Math.min(...flows.map((f) => f.t))
    if ((endMs - first) / DAY < MIN_XIRR_DAYS) return null
    return xirr([...flows, { t: endMs, amt: value }])
  }

  const earnEnd = total[n - 1]!
  const inTotal = invested.TOTAL ?? sumBuys(data)
  // earn = market value − in + dividends, so in + earn overstates the shares
  // by the dividends received. Strip them to get the real market value.
  const divTotal = dividendsEur.TOTAL ?? 0
  const valueTotal = inTotal + earnEnd - divTotal

  // --- Drawdown of TOTAL P&L ---
  let peak = -Infinity
  let peakDate = data.dates[0]!
  let maxDd = 0
  for (let i = 0; i < n; i++) {
    const e = total[i]!
    if (e > peak) {
      peak = e
      peakDate = data.dates[i]!
    }
    maxDd = Math.min(maxDd, e - peak)
  }
  const drawdownNow = earnEnd - peak

  // --- Per-ticker ---
  const values = tickers.map(
    (t) => (invested[t] ?? 0) + data.series[t]![n - 1]! - (dividendsEur[t] ?? 0),
  )
  const sumValues = values.reduce((s, v) => s + Math.max(v, 0), 0)
  const rows: TickerStats[] = tickers.map((sym, i) => {
    const inn = invested[sym] ?? 0
    const earn = data.series[sym]![n - 1]!
    const value = values[i]!
    const returnPct = inn > 0 ? earn / inn : null
    return {
      sym,
      invested: inn,
      value,
      earn,
      returnPct,
      xirr: xirrOf(sym, value + (dividendsEur[sym] ?? 0)),
      dividends: dividendsEur[sym] ?? 0,
      weight: sumValues > 0 ? Math.max(value, 0) / sumValues : 0,
      contribution: Math.abs(earnEnd) >= 1 ? earn / earnEnd : null,
      breakEvenGain:
        returnPct != null && returnPct < 0 ? -returnPct / (1 + returnPct) : null,
    }
  })
  rows.sort((a, b) => b.value - a.value)

  const hhi = rows.reduce((s, r) => s + r.weight * r.weight, 0)
  const largest = rows[0] ? { sym: rows[0].sym, weight: rows[0].weight } : null

  const baseline = data.baseline ?? 'VOO'
  const allBase = data.series.ALL_VOO
  const vsBaseline = allBase ? allBase[n - 1]! - earnEnd : null

  return {
    asOf,
    firstBuy,
    days,
    buysCount: data.buys.length,
    invested: inTotal,
    /** Shares only; add `cash` for the full account value. */
    value: valueTotal,
    cash: data.cashEur ?? 0,
    deposited: data.fundingEur ?? null,
    earn: earnEnd,
    returnPct: inTotal > 0 ? earnEnd / inTotal : null,
    xirr: xirrOf(undefined, valueTotal + divTotal),
    maxProfit: peak,
    maxProfitDate: peakDate,
    maxDrawdown: maxDd,
    drawdownNow,
    vsBaseline,
    baseline,
    effectiveHoldings: hhi > 0 ? 1 / hhi : 0,
    largest,
    avgBuy: sumBuys(data) / data.buys.length,
    daysSinceLastBuy: Math.max(0, Math.round((endMs - dayMs(lastBuy)) / DAY)),
    tickers: rows,
  }
}

/**
 * The chart as it stood on `dates[idx]`: later days, buys and dividends are
 * dropped. Idle cash and net deposits aren’t tracked per day, so they are
 * omitted for past dates (“in” is then purely the cost of shares bought).
 */
export function truncateChart(data: ChartData, idx: number): ChartData {
  const n = data.dates.length
  if (idx >= n - 1) return data
  const cut = data.dates[Math.max(idx, 0)]!
  const series: Record<string, number[]> = {}
  for (const [k, v] of Object.entries(data.series)) series[k] = v.slice(0, idx + 1)
  const divs = (data.divs ?? []).filter((d) => d.date <= cut)
  const dividendsEur: Record<string, number> = {}
  let divTotal = 0
  for (const t of data.tickers) {
    const later = (data.divs ?? [])
      .filter((d) => d.sym === t && d.date > cut)
      .reduce((s, d) => s + d.eur, 0)
    const v = Math.round(((data.dividendsEur?.[t] ?? 0) - later) * 100) / 100
    dividendsEur[t] = v
    divTotal += v
  }
  dividendsEur.TOTAL = Math.round(divTotal * 100) / 100
  return {
    ...data,
    asOf: cut,
    dates: data.dates.slice(0, idx + 1),
    series,
    buys: data.buys.filter((b) => b.date <= cut),
    divs,
    dividendsEur,
    fundingEur: undefined,
    cashEur: 0,
    deltaAllVoo: undefined,
  }
}
