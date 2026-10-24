import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCustomer, getCustomerEntries, getCustomerEntriesFeed, deleteCustomerEntry } from '../api';
import { ChevronLeft, Phone, TrendingUp, TrendingDown, Wallet, Trash2, Pencil, BookOpen, ArrowUpRight, ArrowDownLeft, FileDown } from 'lucide-react';
import { fmtCurrency } from '../utils/formatters';
import { downloadKhataPdf } from '../utils/khataPdf';
import toast from 'react-hot-toast';
import ConfirmModal from '../common/ConfirmModal';
import AddKhataEntryModal from '../components/AddKhataEntryModal';
import ReportRangeModal from '../components/ReportRangeModal';
import LedgerView, { LedgerSummary } from '../components/LedgerView';

export default function KhataDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryType, setEntryType] = useState('gave');
  const [editEntry, setEditEntry] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hasEntries, setHasEntries] = useState(false);

  const loadCustomer = useCallback(async () => {
    try {
      setCustomer(await getCustomer(id));
    } catch {
      toast.error('Failed to load khata');
    }
  }, [id]);

  useEffect(() => { loadCustomer(); }, [loadCustomer]);

  // Balances shift after any edit → refresh totals + entries from page 1
  const reloadAll = () => { loadCustomer(); setReloadKey(k => k + 1); };

  const openAdd = (type) => {
    setEditEntry(null);
    setEntryType(type);
    setShowEntryModal(true);
  };

  const openEdit = (entry) => {
    setEditEntry(entry);
    setEntryType(entry.type);
    setShowEntryModal(true);
  };

  const handleDelete = (entry) => {
    setConfirm({
      message: `Delete this ${entry.type === 'gave' ? 'You Gave' : 'You Got'} entry of ${fmtCurrency(entry.amount)}?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteCustomerEntry(entry._id);
          toast.success('Entry deleted');
          reloadAll();
        } catch {
          toast.error('Failed to delete entry');
        }
      }
    });
  };

  // PDF needs ALL entries even when a date range is picked — entries before
  // the range roll up into the report's opening balance.
  const handleDownloadPdf = async (range) => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const all = await getCustomerEntries(id);
      const res = downloadKhataPdf(customer, all, range);
      if (!res.ok) toast.error('Failed to generate report');
      else setShowReportModal(false);
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setPdfLoading(false);
    }
  };

  const totalGave = customer?.total_gave || 0;
  const totalGot = customer?.total_got || 0;
  const balance = customer?.balance || 0;

  const describe = (entry) => ({
    key: entry._id,
    date: entry.entry_date,
    direction: entry.type === 'gave' ? 'owed' : 'paid',
    label: entry.type === 'gave' ? 'You gave' : 'You got',
    title: entry.notes || (entry.type === 'gave' ? 'Given' : 'Received'),
    subtitle: '',
    counted: true,
    actions: [
      { icon: <Pencil size={14} />, title: 'Edit entry', onClick: () => openEdit(entry) },
      { icon: <Trash2 size={14} />, title: 'Delete entry', onClick: () => handleDelete(entry) },
    ],
  });

  return (
    <>
      <div className="page-hero ledger-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate('/khata')} data-tooltip="Back to Khata">
              <ChevronLeft size={22} />
            </button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">{customer ? customer.name : 'Loading…'}</h1>
              {customer && (
                <span className="page-hero-subtitle">
                  {customer.phone ? <><Phone size={12} style={{ verticalAlign: '-1px' }} /> {customer.phone} · </> : null}Khata Book
                </span>
              )}
            </div>
          </div>

          {customer && (
            <div className="page-hero-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReportModal(true)} disabled={pdfLoading || !hasEntries}>
                <FileDown size={14} /> {pdfLoading ? 'Preparing…' : 'Download Report'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="page-content khata-page-content">
        {customer && (
          <LedgerSummary cells={[
            { icon: <TrendingDown size={13} />, label: 'You gave', value: fmtCurrency(totalGave) },
            { icon: <TrendingUp size={13} />, label: 'You got', value: fmtCurrency(totalGot) },
            { icon: <Wallet size={13} />, label: 'Balance', value: balance > 0 ? `You'll get ${fmtCurrency(balance)}` : balance < 0 ? `You'll give ${fmtCurrency(-balance)}` : 'Settled', tone: balance > 0 ? 'due' : balance < 0 ? 'advance' : undefined },
          ]} />
        )}

        <LedgerView
          reloadKey={`${id}-${reloadKey}`}
          fetchPage={(page, limit) => getCustomerEntriesFeed(id, { page, limit })}
          onLoaded={(res) => setHasEntries(res.items.length > 0)}
          describe={describe}
          balanceText={(bal) => `Bal ${fmtCurrency(Math.abs(bal))}`}
          endLabel="— End of khata —"
          empty={
            <div className="empty-state-card">
              <div className="empty-icon empty-icon-sellers"><BookOpen size={32} /></div>
              <div className="empty-title">No entries yet</div>
              <div className="empty-sub">Tap "You Gave" or "You Got" below to record the first entry.</div>
            </div>
          }
        />
      </div>

      {/* Sticky action bar at bottom with You Gave / You Got */}
      {customer && (
        <div className="khata-action-bar">
          <div className="khata-action-inner">
            <button
              className="btn khata-btn-gave"
              onClick={() => openAdd('gave')}
            >
              <ArrowUpRight size={16} /> You Gave
            </button>
            <button
              className="btn khata-btn-got"
              onClick={() => openAdd('got')}
            >
              <ArrowDownLeft size={16} /> You Got
            </button>
          </div>
        </div>
      )}

      {showReportModal && customer && (
        <ReportRangeModal
          title="Download Khata Report"
          subtitle={`Statement for ${customer.name}. Pick a period, or download the full history.`}
          loading={pdfLoading}
          onClose={() => setShowReportModal(false)}
          onGenerate={handleDownloadPdf}
        />
      )}

      {showEntryModal && customer && (
        <AddKhataEntryModal
          customer={customer}
          editEntry={editEntry}
          defaultType={entryType}
          onClose={() => { setShowEntryModal(false); setEditEntry(null); }}
          onSuccess={() => { setShowEntryModal(false); setEditEntry(null); reloadAll(); }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title="Delete Entry?"
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
