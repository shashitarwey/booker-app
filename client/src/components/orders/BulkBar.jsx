import { Truck, CheckCircle, X as XIcon } from 'lucide-react';

/** Floating action bar shown while orders are selected. */
export default function BulkBar({ count, onStatus, onClear, onClose }) {
  return (
    <div className="bulk-bar">
      <div className="bulk-bar-inner">
        <span className="bulk-bar-count">{count} selected</span>
        <div className="bulk-bar-actions">
          <button className="btn btn-sm bulk-btn-delivered" onClick={() => onStatus('Delivered')}>
            <Truck size={14} /> Delivered
          </button>
          <button className="btn btn-sm bulk-btn-cancelled" onClick={() => onStatus('Cancelled')}>
            Cancelled
          </button>
          <span className="bulk-bar-sep" />
          <button className="btn btn-sm bulk-btn-clear" onClick={onClear}>
            <CheckCircle size={14} /> Mark Cleared
          </button>
        </div>
        <button className="bulk-bar-close" onClick={onClose} aria-label="Clear selection">
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
