import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { ArrowUpRight, ArrowDownLeft, Wallet, Pencil, Trash2, FileDown, HandCoins } from 'lucide-react';
import { getBookerKhata, deleteBookerPayment } from '../api';
import { fmtCurrency } from '../utils/formatters';
import { downloadLedgerPdf } from '../utils/ledgerPdf';
import BookerPaymentModal from './BookerPaymentModal';
import ReportRangeModal from './ReportRangeModal';
import ConfirmModal from '../common/ConfirmModal';
import LedgerView, { LedgerSummary } from './LedgerView';

const EMPTY_TOTALS = { total_due: 0, total_advance: 0, total_payments: 0, total_paid: 0, pending_dues: 0 };

const balanceText = (bal, name) =>
  bal > 0 ? `You'll give ${fmtCurrency(bal)}` : bal < 0 ? `${name} has ${fmtCurrency(-bal)} advance` : 'Settled';

/**
 * Booker khata: what you owe a friend (Return to Friend on delivered orders)
 * against what you've paid them (order advances + payments recorded here).
 */
export default function BookerKhata({ person, onChanged }) {
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [hasEntries, setHasEntries] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState(null); // { payment? }
  const [confirm, setConfirm] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const refreshAll = () => { setReloadKey(k => k + 1); onChanged?.(); };

  const handleDelete = (item) => setConfirm({
    message: `Delete payment of ${fmtCurrency(item.amount)} to ${person.name}?`,
    onConfirm: async () => {
      setConfirm(null);
      try {
        await deleteBookerPayment(item.id);
        toast.success('Payment deleted');
        refreshAll();
      } catch {
        toast.error('Failed to delete payment');
      }
    },
  });

  const handlePdf = async (range) => {
    try {
      const res = await getBookerKhata(person._id, { all: true });
      // PDF builder expects oldest → newest with Date objects; it already
      // skips pending/cancelled orders.
      // PDF is shared with the booker: show the item only, not the buyer
      const itemLabel = (o) => `${o.model_ordered}${o.quantity > 1 ? ` ×${o.quantity}` : ''}`;
      const orderLabels = new Map(res.items.filter(it => it.type === 'ORDER').map(it => [String(it.id), itemLabel(it.raw)]));
      const pdfItems = [...res.items].reverse()
        .filter(it => !(it.type === 'PAYMENT' && it.isCancelled)) // advances on cancelled orders
        .map(it => ({
          ...it,
          date: new Date(it.date),
          description: it.type === 'ORDER'
            ? itemLabel(it.raw)
            : it.subtype === 'advance'
              ? `Advance · ${orderLabels.get(String(it.order_id)) || 'order'}`
              : it.description,
        }));
      const out = downloadLedgerPdf({ name: person.name }, pdfItems, range, {
        brandSubtitle: 'Booker Khata',
        debitLabel: `Owed to ${person.name}`,
        creditLabel: 'Paid (advances + payments)',
        debitHeader: 'Owed(+)',
        creditHeader: 'Paid(-)',
        balanceLine: (net) => (net > 0 ? `You will give ${person.name}` : net < 0 ? `${person.name} has advance` : 'Settled'),
      });
      if (out && out.ok === false) toast.error(out.error || 'Could not open print dialog');
    } catch {
      toast.error('Failed to build report');
    }
  };

  const balance = totals.pending_dues;

  const describe = (it) => {
    const isOrder = it.type === 'ORDER';
    const isAdvance = it.subtype === 'advance';
    return {
      key: it.id,
      date: it.date,
      direction: isOrder ? 'owed' : 'paid',
      label: isOrder ? 'Owed' : isAdvance ? 'Advance' : 'Paid',
      title: it.description,
      subtitle: isOrder
        ? (it.isCancelled ? 'Cancelled — not counted' : it.isPending ? 'Not delivered yet — not counted' : 'Return to friend (delivered)')
        : isAdvance
          ? (it.isCancelled ? 'Advance on cancelled order — not counted' : 'Advance on order · edit from the order')
          : 'Payment made',
      counted: !it.isCancelled && !(isOrder && it.isPending),
      pending: isOrder && it.isPending && !it.isCancelled,
      actions: it.subtype === 'payment' ? [
        { icon: <Pencil size={14} />, title: 'Edit payment', onClick: () => setModal({ payment: it.raw }) },
        { icon: <Trash2 size={14} />, title: 'Delete payment', onClick: () => handleDelete(it) },
      ] : [],
    };
  };

  return (
    <div className="khata">
      <LedgerSummary cells={[
        { icon: <ArrowUpRight size={13} />, label: 'Owed (delivered)', value: fmtCurrency(totals.total_due) },
        { icon: <HandCoins size={13} />, label: 'Advances', value: fmtCurrency(totals.total_advance) },
        { icon: <ArrowDownLeft size={13} />, label: 'Payments', value: fmtCurrency(totals.total_payments) },
        { icon: <Wallet size={13} />, label: 'Balance', value: balanceText(balance, person.name), tone: balance > 0 ? 'due' : balance < 0 ? 'advance' : undefined },
      ]} />

      <div className="khata-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => setShowReport(true)} disabled={!hasEntries}>
          <FileDown size={14} /> Download Report
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>
          <ArrowDownLeft size={14} /> Pay {person.name}
        </button>
      </div>

      <LedgerView
        reloadKey={`${person._id}-${reloadKey}`}
        fetchPage={(page, limit) => getBookerKhata(person._id, { page, limit })}
        onLoaded={(res) => { setTotals(res.totals || EMPTY_TOTALS); setHasEntries(res.items.length > 0); }}
        describe={describe}
        balanceText={(bal) => `Bal ${fmtCurrency(bal)}`}
        endLabel="— End of khata —"
        empty={
          <div className="dash-empty">
            <div className="dash-empty-title">No entries yet</div>
            <div className="dash-empty-sub">Delivered orders on {person.name}'s cards, advances and payments will show up here.</div>
          </div>
        }
      />

      {modal && (
        <BookerPaymentModal
          person={person}
          editPayment={modal.payment}
          balance={balance}
          onClose={() => setModal(null)}
          onSuccess={refreshAll}
        />
      )}
      {showReport && (
        <ReportRangeModal
          title="Download Khata Report"
          subtitle={`Khata for ${person.name}. Pick a period, or download the full history.`}
          onClose={() => setShowReport(false)}
          onGenerate={(range) => { setShowReport(false); handlePdf(range); }}
        />
      )}
      {confirm && (
        <ConfirmModal
          title="Delete Payment"
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
