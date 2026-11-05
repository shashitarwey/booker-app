import { Landmark } from 'lucide-react';
import { fmtCurrency } from '../../utils/formatters';
import { bankLabelShort } from '../../utils/bankAccounts';

/**
 * Shown on orders where the credit card was paid in advance from a bank
 * account: amount, which account, and whether it has gone back yet.
 */
export default function CardAdvanceChip({ order }) {
  if (!(order.card_advance_amount > 0)) return null;
  const bank = typeof order.card_advance_bank_id === 'object' ? bankLabelShort(order.card_advance_bank_id) : '';
  const returned = order.card_advance_returned === true;
  return (
    <span className={`card-adv-chip ${returned ? 'is-returned' : 'is-pending'}`} title={`Card paid in advance${bank ? ` from ${bank}` : ''}`}>
      <Landmark size={11} />
      Card adv {fmtCurrency(order.card_advance_amount)}{bank ? ` · ${bank}` : ''} · {returned ? 'returned' : 'to return'}
    </span>
  );
}
