import { AlertTriangle } from 'lucide-react';
import { fmtCurrency } from '../utils/formatters';
import { SFT_LIMIT } from '../utils/bankSpend';

/**
 * One bank's cards with a header: bank name + card count on the left, spend
 * in the period and the billed-vs-₹10L (SFT) meter on the right.
 */
export default function BankSection({ row, children }) {
  const pct = Math.min(100, (row.billed / SFT_LIMIT) * 100);
  const tone = row.billed >= SFT_LIMIT ? 'over' : pct >= 80 ? 'near' : 'ok';
  return (
    <section className="bank-group">
      <header className="bank-group-head">
        <div className="bank-group-title">
          <span className="bank-group-dot" />
          <span className="bank-group-name">{row.name}</span>
          <span className="bank-group-count">{row.cards.length} card{row.cards.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="bank-group-right">
          <div className="bank-group-spend"><span>Spend</span> {fmtCurrency(row.spend)}</div>
          <div className={`bank-group-sft is-${tone}`} title="Billed = primary cards + linked add-ons. Banks report ₹10 lakh+ per FY (SFT/AIS).">
            <div className="bank-group-track"><div className="bank-group-fill" style={{ width: `${pct}%` }} /></div>
            <span>
              {tone === 'over' && <AlertTriangle size={11} />}
              Billed {fmtCurrency(row.billed)} / ₹10L · {pct.toFixed(0)}%{tone === 'over' ? ' · SFT reportable' : ''}
            </span>
          </div>
        </div>
      </header>
      {row.billedElsewhere.map(e => (
        <div key={`${e.to}-${e.last4}`} className="bank-group-note">
          {fmtCurrency(e.amount)} on an add-on here is billed to {e.to} (••{e.last4})
        </div>
      ))}
      <div className="cards-grid">{children}</div>
    </section>
  );
}
