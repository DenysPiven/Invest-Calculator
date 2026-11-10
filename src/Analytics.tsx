import type { ChartData } from './ibkr'
import { computeStats } from './analytics'

const eur = (v: number) =>
  `${v < 0 ? '−' : ''}€${Math.abs(Math.round(v)).toLocaleString('en-US')}`
const signedEur = (v: number) => (v > 0 ? `+${eur(v)}` : eur(v))
const pct = (v: number | null, digits = 1) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`
const tone = (v: number | null) =>
  v == null ? '' : v > 0 ? ' pos' : v < 0 ? ' neg' : ''

type Props = {
  data: ChartData
  invested: Record<string, number>
  incognito: boolean
  nameOf: (sym: string) => string
  color: (sym: string) => string
}

export default function Analytics({
  data,
  invested,
  incognito,
  nameOf,
  color,
}: Props) {
  const s = computeStats(data, invested)
  if (!s) return null
  const money = (v: number, f = eur) => (incognito ? '•••' : f(v))
  const account = s.value + s.cash
  const share = (v: number) => (account > 0 ? (v / account) * 100 : 0)

  const cards: { label: string; value: string; sub?: string; cls?: string }[] =
    [
      {
        label: 'Portfolio value',
        value: money(s.value + s.cash),
        sub:
          s.cash >= 0.5
            ? `shares ${money(s.value)} + cash ${money(s.cash)}`
            : `in ${money(s.invested)}`,
      },
      {
        label: 'Total P&L',
        value: money(s.earn, signedEur),
        sub: pct(s.returnPct),
        cls: tone(s.earn),
      },
      {
        label: 'Annualised (XIRR)',
        value: pct(s.xirr),
        sub:
          s.xirr == null
            ? 'needs 2+ months of history'
            : 'weighted by when you bought',
        cls: tone(s.xirr),
      },
      {
        label: 'Time-weighted',
        value: pct(s.twr),
        sub: 'ignores timing of deposits',
        cls: tone(s.twr),
      },
      {
        label: 'Max drawdown',
        value: money(s.maxDrawdown),
        sub:
          s.drawdownNow < -0.5
            ? `now ${money(s.drawdownNow)} below peak`
            : 'at its peak now',
        cls: s.maxDrawdown < -0.5 ? ' neg' : '',
      },
    ]
  return (
    <section className="analytics" aria-label="Portfolio analytics">
      <div className="analytics-cards">
        {cards.map((c) => (
          <div key={c.label} className="a-card">
            <span className="a-label">{c.label}</span>
            <span className={`a-value${c.cls ?? ''}`}>{c.value}</span>
            {c.sub ? <span className="a-sub">{c.sub}</span> : null}
          </div>
        ))}
      </div>

      <div className="analytics-table-wrap">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Holding</th>
              <th>Weight</th>
              {!incognito && <th>Value</th>}
              {!incognito && <th>P&amp;L</th>}
              <th>Return</th>
              <th>XIRR</th>
              <th>Share of P&amp;L</th>
              <th>To break even</th>
            </tr>
          </thead>
          <tbody>
            {s.tickers.map((t) => (
              <tr key={t.sym}>
                <td>
                  <span
                    className="a-dot"
                    style={{ background: color(t.sym) }}
                    aria-hidden
                  />
                  {nameOf(t.sym)}
                </td>
                <td>
                  <span className="a-bar" aria-hidden>
                    <span
                      style={{
                        width: `${share(t.value)}%`,
                        background: color(t.sym),
                      }}
                    />
                  </span>
                  {share(t.value).toFixed(0)}%
                </td>
                {!incognito && <td>{eur(t.value)}</td>}
                {!incognito && (
                  <td className={tone(t.earn).trim()}>{signedEur(t.earn)}</td>
                )}
                <td className={tone(t.returnPct).trim()}>{pct(t.returnPct)}</td>
                <td className={tone(t.xirr).trim()}>{pct(t.xirr, 0)}</td>
                <td>
                  {t.contribution == null
                    ? '—'
                    : `${Math.round(t.contribution * 100)}%`}
                </td>
                <td>
                  {t.breakEvenGain == null ? '—' : pct(t.breakEvenGain)}
                </td>
              </tr>
            ))}
            {s.cash >= 0.5 ? (
              <tr>
                <td>
                  <span
                    className="a-dot"
                    style={{ background: 'var(--text-soft)' }}
                    aria-hidden
                  />
                  Cash
                </td>
                <td>
                  <span className="a-bar" aria-hidden>
                    <span
                      style={{
                        width: `${share(s.cash)}%`,
                        background: 'var(--text-soft)',
                      }}
                    />
                  </span>
                  {share(s.cash).toFixed(0)}%
                </td>
                {!incognito && <td>{eur(s.cash)}</td>}
                {!incognito && <td>—</td>}
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ul className="analytics-notes">
        {s.largest && s.largest.weight >= 0.5 ? (
          <li>
            {nameOf(s.largest.sym)} is {(s.largest.weight * 100).toFixed(0)}% of
            the portfolio — it behaves like{' '}
            {s.effectiveHoldings.toFixed(1)} equal positions.
          </li>
        ) : null}
        <li>
          {s.buysCount} buys over {s.days} days
          {incognito ? '' : `, avg ${eur(s.avgBuy)}`}; last one{' '}
          {s.daysSinceLastBuy} days ago.
        </li>
        <li>
          XIRR annualises short histories aggressively — read it as a trend,
          not a forecast.
        </li>
      </ul>
    </section>
  )
}
