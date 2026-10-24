import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSeller, getAllOrders, getSellerLedger, getLedgerFeed, deleteSellerPayment } from '../api';
import { ChevronLeft, Wallet, MapPin, TrendingUp, TrendingDown, Trash2, Pencil, BookOpen, FileDown } from 'lucide-react';
import { fmtCurrency, fmtDisplay, fmtSignedCurrency } from '../utils/formatters';
import { pctLabel } from '../utils/profit';
import { downloadLedgerPdf } from '../utils/ledgerPdf';
import toast from 'react-hot-toast';
import ConfirmModal from '../common/ConfirmModal';
import AddPaymentModal from '../components/AddPaymentModal';
import ReportRangeModal from '../components/ReportRangeModal';
import LedgerView, { LedgerSummary } from '../components/LedgerView';

export default function SellerLedgerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [seller, setSeller] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hasEntries, setHasEntries] = useState(false);

  // Seller totals (full history) for the summary strip; entries are paged by LedgerView.
  const loadSeller = useCallback(async () => {
    try {
      setSeller(await getSeller(id));
    } catch {
      toast.error('Failed to load ledger');
    }
  }, [id]);

  useEffect(() => { loadSeller(); }, [loadSeller]);

  // Balances shift after any payment change → refresh totals + entries from page 1
  const reloadAll = () => { loadSeller(); setReloadKey(k => k + 1); };

  const handleDeletePayment = (item) => {
    setConfirm({
      message: `Delete this payment of ${fmtCurrency(item.amount)}?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteSellerPayment(item.id);
          toast.success('Payment deleted');
          reloadAll();
        } catch { toast.error('Failed to delete payment'); }
      }
    });
  };

  // PDF needs ALL items, not just what's currently paginated on screen — and
  // the full history even when a date range is picked, since entries before
  // the range roll up into the report's opening balance.
  const handleDownloadPdf = async (range) => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const [orders, payments] = await Promise.all([
        getAllOrders({ seller_id: id }),
        getSellerLedger(id),
      ]);
      const mappedOrders = orders.map(o => ({
        id: o._id, type: 'ORDER',
        date: new Date(o.order_date),
        description: `${o.model_ordered}${o.quantity > 1 ? ` ×${o.quantity}` : ''}${o.card_id?.holder_id ? ` · Booked by ${o.card_id.holder_id.name}` : ''}`,
        amount: o.return_amount, raw: o,
      }));
      const mappedPayments = payments.map(p => ({
        id: p._id, type: 'PAYMENT',
        date: new Date(p.payment_date),
        description: p.notes || 'Payment Received',
        amount: p.amount, raw: p,
      }));
      const merged = [...mappedOrders, ...mappedPayments].sort((a, b) => a.date - b.date);
      let running = 0;
      const allItems = merged.map(it => {
        const isCancelled = it.type === 'ORDER' && it.raw.delivery_status === 'Cancelled';
        const isPending = it.type === 'ORDER' && it.raw.delivery_status !== 'Delivered';
        if (!isCancelled) {
          if (it.type === 'ORDER' && !isPending) running += it.amount;
          if (it.type === 'PAYMENT') running -= it.amount;
        }
        return { ...it, runningBalance: running, isCancelled, isPending };
      });
      const res = downloadLedgerPdf(seller, allItems, range);
      if (!res.ok) toast.error('Failed to generate report');
      else setShowReportModal(false);
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setPdfLoading(false);
    }
  };

  // Totals come from the seller aggregate (full history), not paginated items.
  const totalOrdered = seller?.total_amount_get || 0;
  const totalPaid = seller?.total_received || 0;
  const due = seller?.due_balance || 0;

  const describe = (item) => {
    const isOrder = item.type === 'ORDER';
    const raw = item.raw || {};
    const parts = [];
    if (isOrder) {
      if (item.booker) parts.push(`Booked by ${item.booker.relation === 'self' ? 'You' : item.booker.name}`);
      if (item.isCancelled) parts.push('Cancelled — not counted');
      else if (item.isPending) parts.push('Not delivered yet — not counted');
      else if (raw.delivered_date) parts.push(`Delivered ${fmtDisplay(raw.delivered_date.slice(0, 10))}`);
    } else {
      parts.push('Payment received');
    }
    return {
      key: `${item.type}-${item.id}`,
      date: item.date,
      direction: isOrder ? 'owed' : 'paid',
      label: isOrder ? 'Gave' : 'Got',
      title: item.description,
      subtitle: parts.join(' · '),
      counted: !item.isCancelled && !(isOrder && item.isPending),
      pending: isOrder && item.isPending && !item.isCancelled,
      extra: !isOrder && raw.receipt_url
        ? <a href={raw.receipt_url} target="_blank" rel="noreferrer"><img src={raw.receipt_url} alt="Receipt" className="khata-receipt" /></a>
        : null,
      actions: isOrder ? [] : [
        { icon: <Pencil size={14} />, title: 'Edit payment', onClick: () => { setEditPayment(raw); setShowPaymentModal(true); } },
        { icon: <Trash2 size={14} />, title: 'Delete payment', onClick: () => handleDeletePayment(item) },
      ],
    };
  };

  const balanceText = (bal) => `Bal ${fmtCurrency(Math.abs(bal))} ${bal > 0 ? 'Due' : bal < 0 ? 'Advance' : 'Clear'}`;

  return (
    <>
      {/* Page Hero Header */}
      <div className="page-hero ledger-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate('/sellers')} data-tooltip="Back to Buyers">
              <ChevronLeft size={22} />
            </button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">{seller ? seller.name : 'Loading…'}</h1>
              {seller && (
                <span className="page-hero-subtitle"><MapPin size={12} style={{ verticalAlign: '-1px' }} /> {seller.city} · Buyer ledger</span>
              )}
            </div>
          </div>

          {seller && (
            <div className="page-hero-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReportModal(true)} disabled={pdfLoading || !hasEntries}>
                <FileDown size={14} /> {pdfLoading ? 'Preparing…' : 'Download Report'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowPaymentModal(true)}>
                <Wallet size={14} /> Add Payment
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="page-content">
        {seller && (
          <LedgerSummary cells={[
            { icon: <TrendingDown size={13} />, label: 'Expected (delivered)', value: fmtCurrency(totalOrdered) },
            { icon: <TrendingUp size={13} />, label: 'Received', value: fmtCurrency(totalPaid) },
            { icon: <Wallet size={13} />, label: 'Balance', value: due > 0 ? `${fmtCurrency(due)} Due` : due < 0 ? `${fmtCurrency(-due)} Advance` : 'Clear', tone: due > 0 ? 'due' : due < 0 ? 'advance' : undefined },
            { icon: <TrendingUp size={13} />, label: 'Profit', value: <>{fmtSignedCurrency(seller.profit || 0)} <span className="profit-pct">{pctLabel(seller.profit || 0, seller.total_amount_ordered)}</span></> },
          ]} />
        )}

        <LedgerView
          reloadKey={`${id}-${reloadKey}`}
          fetchPage={(page, limit) => getLedgerFeed(id, { page, limit })}
          onLoaded={(res) => setHasEntries(res.items.length > 0)}
          describe={describe}
          balanceText={balanceText}
          empty={
            <div className="empty-state-card">
              <div className="empty-icon empty-icon-sellers"><BookOpen size={32} /></div>
              <div className="empty-title">No transactions yet</div>
              <div className="empty-sub">Add orders or record payments to build the ledger.</div>
              <div className="empty-cta">
                <button className="btn btn-primary" onClick={() => setShowPaymentModal(true)}><Wallet size={16} /> Add First Payment</button>
              </div>
            </div>
          }
        />
      </div>

      {showReportModal && seller && (
        <ReportRangeModal
          title="Download Ledger Report"
          subtitle={`Statement for ${seller.name}. Pick a period, or download the full history.`}
          loading={pdfLoading}
          onClose={() => setShowReportModal(false)}
          onGenerate={handleDownloadPdf}
        />
      )}
      {showPaymentModal && (seller || editPayment) && (
        <AddPaymentModal
          seller={seller}
          editPayment={editPayment || null}
          onClose={() => { setShowPaymentModal(false); setEditPayment(null); }}
          onSuccess={() => { setShowPaymentModal(false); setEditPayment(null); reloadAll(); }}
        />
      )}
      {confirm && (
        <ConfirmModal title="Delete Payment?" message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}

    </>
  );
}
