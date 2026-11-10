import { readFileSync } from 'fs'
import { buildChartFromIbkrCsv } from '../src/ibkr'

const cache = readFileSync('public/prices_cache.json', 'utf8')
const orig = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes('prices_cache.json')) {
    return new Response(cache, { status: 200 })
  }
  if (url.includes('frankfurter')) {
    return new Response('{}', { status: 500 })
  }
  return orig(input, init)
}) as typeof fetch

const csv = [
  'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
  // Bought at the cached close → only commission/FX separate the buy moment from 0.
  'Trades,Data,Order,Stocks,USD,VOO,"2026-06-08, 09:41:07",2,679.679993,679.679993,-1359.36,-1.0,1360.36,0,0,O',
].join('\n')
const chart = await buildChartFromIbkrCsv(csv, { endDate: '2026-10-14' })
const buy = chart.buys[0]
const out = {
  buy,
  firstVOO: chart.series.VOO[0],
  last: chart.series.VOO.at(-1),
  n: chart.dates.length,
}
console.log(out)
if (buy?.time !== '09:41') throw new Error('expected trade time 09:41')
if (!(buy.sessionFrac! > 0 && buy.sessionFrac! < 0.05)) {
  throw new Error('expected marker near the session open')
}
// Fill price == close, so buy moment and close differ only by rounding.
if (Math.abs(buy.y - chart.series.VOO[0]) > 0.05 || Math.abs(buy.y) > 2) {
  throw new Error('expected buy-moment earnings ≈ −commission')
}
