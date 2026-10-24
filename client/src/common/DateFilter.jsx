import { getToday } from '../constants';
import { CalendarRange } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { fmtDate } from '../utils/formatters';

const today    = () => getToday();
const fyBounds = (offset = 0) => {
  const now = new Date();
  const yr  = now.getMonth() >= 3 ? now.getFullYear() + offset : now.getFullYear() - 1 + offset;
  return { from_date: `${yr}-04-01`, to_date: `${yr + 1}-03-31`, label: `FY ${yr}-${String(yr+1).slice(2)}` };
};

const buildPresets = () => {
  const now = new Date();
  const [y, m] = [now.getFullYear(), now.getMonth()];
  const qm = Math.floor(m / 3) * 3;
  const fy0 = fyBounds(0), fy1 = fyBounds(-1);
  return [
    { label: 'This Month',   from_date: fmtDate(new Date(y, m, 1)),  to_date: today() },
    { label: 'Last Month',   from_date: fmtDate(new Date(y, m-1, 1)), to_date: fmtDate(new Date(y, m, 0)) },
    { label: 'This Quarter', from_date: fmtDate(new Date(y, qm, 1)), to_date: today() },
    { label: fy0.label, from_date: fy0.from_date, to_date: fy0.to_date > today() ? today() : fy0.to_date, isFY: true },
    { label: fy1.label, from_date: fy1.from_date, to_date: fy1.to_date, isFY: true },
  ];
};

export default function DateFilter({ dateFrom, dateTo, activePreset, onChange }) {
  const presets = buildPresets();

  const applyPreset = (p) => onChange(p.from_date, p.to_date, p.label);

  const handleFrom = (val) => {
    if (dateTo && val > dateTo) onChange(val, val, '');
    else onChange(val, dateTo, '');
  };

  const handleTo = (val) => {
    const max = dateFrom
      ? fmtDate(new Date(new Date(dateFrom).setFullYear(new Date(dateFrom).getFullYear() + 1)))
      : null;
    if (max && val > max) { toast.error('Range cannot exceed 1 year'); return; }
    onChange(dateFrom, val, '');
  };

  const customMode = !presets.find(p => p.label === activePreset);

  return (
    <div className="filter-bar">
      <div className="filter-presets">
        {presets.map(p => (
          <button key={p.label}
            className={`period-pill ${activePreset === p.label ? 'active' : ''} ${p.isFY ? 'pill-fy' : ''}`}
            onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
        <button
          className={`period-pill ${customMode ? 'active' : ''}`}
          onClick={() => onChange(dateFrom, dateTo, '')}>
          <CalendarRange size={12} />Custom
        </button>
      </div>

      {customMode && (
        <div className="filter-custom-range">
          <div className="date-range-field">
            <span className="date-range-label">From</span>
            <input type="date" className="form-input date-range-input"
              value={dateFrom} max={today()} onChange={e => handleFrom(e.target.value)} />
          </div>
          <span className="date-range-sep">→</span>
          <div className="date-range-field">
            <span className="date-range-label">To</span>
            <input type="date" className="form-input date-range-input"
              value={dateTo} min={dateFrom} max={today()} onChange={e => handleTo(e.target.value)} />
          </div>
        </div>
      )}

      <span className="filter-range-label">
        {dateFrom} → {dateTo}
      </span>
    </div>
  );
}
