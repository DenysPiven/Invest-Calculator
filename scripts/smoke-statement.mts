// Usage: npx tsx scripts/smoke-statement.mts <activity-statement.csv> [endDate]
import { readFileSync } from 'fs'
import { buildChartFromIbkrCsv } from '../src/ibkr'

const cache = readFileSync('public/prices_cache.json', 'utf8')
globalThis.fetch = (async (input: RequestInfo | URL) => {
  if (String(input).includes('prices_cache.json')) return new Response(cache)
  return new Response('{}', { status: 500 })
}) as typeof fetch

const csv = readFileSync(process.argv[2]!, 'utf8')
const chart = await buildChartFromIbkrCsv(csv, { endDate: process.argv[3] })
const inv: Record<string, number> = {}
for (const b of chart.buys) inv[b.sym] = (inv[b.sym] ?? 0) + b.eur
const sumIn = Object.values(inv).reduce((a, b) => a + b, 0)
for (const t of chart.tickers) {
  const e = chart.series[t]!.at(-1)!
  console.log(t, 'in', inv[t]!.toFixed(2), 'earn', e.toFixed(2))
}
const total = chart.series.TOTAL!.at(-1)!
console.log('asOf', chart.asOf, 'funding', chart.fundingEur, 'cash', chart.cashEur)
console.log('stocks in', sumIn.toFixed(2), 'TOTAL earn', total.toFixed(2),
  'NAV', (chart.fundingEur! + total).toFixed(2))
