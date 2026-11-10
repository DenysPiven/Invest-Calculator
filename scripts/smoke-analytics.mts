import { readFileSync } from 'fs'
import { computeStats, xirr } from '../src/analytics'
import type { ChartData } from '../src/ibkr'

// XIRR sanity: -100 now, +110 one year later → 10%
const r = xirr([
  { t: Date.UTC(2025, 0, 1), amt: -100 },
  { t: Date.UTC(2026, 0, 1), amt: 110 },
])
if (r == null || Math.abs(r - 0.1) > 1e-6) throw new Error(`xirr ${r}`)

const d = JSON.parse(readFileSync('public/chart_data.json', 'utf8')) as ChartData
const inv: Record<string, number> = {}
for (const b of d.buys) inv[b.sym] = (inv[b.sym] ?? 0) + b.eur
inv.TOTAL = Object.values(inv).reduce((a, b) => a + b, 0)
const s = computeStats(d, inv)!
console.log({ ...s, tickers: s.tickers.map((t) => [t.sym, t.weight.toFixed(2), t.returnPct, t.xirr]) })
const wsum = s.tickers.reduce((a, t) => a + t.weight, 0)
if (Math.abs(wsum - 1) > 1e-9) throw new Error('weights')
if (Math.abs(s.value - (s.invested + s.earn)) > 1e-6) throw new Error('value')
