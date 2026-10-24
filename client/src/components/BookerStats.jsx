import { fmtCurrency, fmtSignedCurrency, profitColor } from '../utils/formatters';
import { profitPercent } from '../utils/profit';

/**
 * Booker stats from GET /api/people: order amount, pending dues (friends),
 * profit, profit %, delivered / pending counts.
 * variant="tiles" → big stat cards (person page); "grid" → compact (tiles/cards).
 */
export default function BookerStats({ person, variant = 'grid' }) {
  const isFriend = person.relation === 'friend';
  const pct = profitPercent(person);
  const full = variant === 'tiles';
  const firstName = (person.name || '').split(' ')[0];
  // "+₹2,150 (1.40%)" — amount with its margin in brackets on the right
  const withPct = (amount, p) => <>{fmtSignedCurrency(amount)} <span className="stat-pct">({p.toFixed(2)}%)</span></>;
  const theirPct = person.total_order_amount > 0 ? (person.friend_earning / person.total_order_amount) * 100 : 0;
  const counts = { label: full ? 'Delivered / Pending' : 'Del / Pend', value: `${person.delivered_count} / ${person.pending_count}`, color: 'var(--success)' };

  // Compact cards get short labels so nothing truncates. Friends (bookers)
  // also show what THEY earned from your orders on their cards.
  const items = isFriend ? [
    { label: full ? 'Total Order Amount' : 'Ordered', value: fmtCurrency(person.total_order_amount) },
    {
      label: `Due to ${firstName}`,
      value: fmtCurrency(person.pending_dues),
      color: person.pending_dues > 0 ? 'var(--amber)' : undefined,
      hint: 'Still to pay: return to friend on delivered orders − advances − payments',
    },
    {
      label: 'Paid',
      value: fmtCurrency(person.total_paid),
      // Paid = advances on orders + payments made in the khata
      sub: person.total_payments > 0
        ? `${fmtCurrency(person.total_advance)} advance + ${fmtCurrency(person.total_payments)} paid`
        : `${fmtCurrency(person.total_advance)} advance`,
      hint: 'Advances on orders + payments made in the khata',
    },
    { label: 'My Profit', value: withPct(person.my_profit, pct), color: profitColor(person.my_profit) },
    {
      label: full ? `${person.name.split(' ')[0]}'s Profit` : 'Their Profit',
      value: withPct(person.friend_earning, theirPct),
      color: profitColor(person.friend_earning),
      hint: 'What the booker earns: Return to friend − Order amount + Cashback',
    },
    counts,
  ] : [
    { label: full ? 'Total Order Amount' : 'Ordered', value: fmtCurrency(person.total_order_amount) },
    { label: 'Orders', value: person.order_count },
    { label: 'Cards', value: person.card_count },
    { label: 'Profit', value: withPct(person.my_profit, pct), color: profitColor(person.my_profit) },
    { label: 'Delivered', value: person.delivered_count, color: 'var(--success)' },
    { label: 'Pending', value: person.pending_count, color: person.pending_count > 0 ? 'var(--amber)' : undefined },
  ];

  return (
    <div className={`booker-stats${full ? ' booker-stats-tiles' : ''}${full && items.length % 3 === 0 && items.length > 6 ? ' booker-stats-3x3' : ''}`}>
      {items.map(it => (
        <div key={it.label} className="booker-stat" title={it.hint}>
          <div className="booker-stat-label">{it.label}</div>
          <div className="booker-stat-value" style={it.color ? { color: it.color } : undefined}>{it.value}</div>
          {it.sub && <div className="booker-stat-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
