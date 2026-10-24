import { useState, useRef, useEffect } from 'react';
import usePopoverPlacement from './usePopoverPlacement';
import { DayPicker } from 'react-day-picker';
import { subMonths, startOfMonth, endOfMonth, startOfQuarter, parseISO, differenceInDays } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import 'react-day-picker/style.css';

import { fmtDate, fmtDisplay } from '../utils/formatters';

const today = () => new Date();

const fyBounds = (offset = 0) => {
  const now = new Date();
  const yr = now.getMonth() >= 3 ? now.getFullYear() + offset : now.getFullYear() - 1 + offset;
  return { from_date: `${yr}-04-01`, to_date: `${yr + 1}-03-31`, label: `FY ${yr}-${String(yr + 1).slice(2)}` };
};

const getPresets = () => {
  const now = today();
  const fy0 = fyBounds(0);
  const fy1 = fyBounds(-1);
  return [
    { label: 'This Month', from_date: startOfMonth(now), to_date: now },
    { label: 'Last Month', from_date: startOfMonth(subMonths(now, 1)), to_date: endOfMonth(subMonths(now, 1)) },
    { label: 'This Quarter', from_date: startOfQuarter(now), to_date: now },
    { label: fy0.label, from_date: parseISO(fy0.from_date), to_date: parseISO(fy0.to_date) > now ? now : parseISO(fy0.to_date) },
    { label: fy1.label, from_date: parseISO(fy1.from_date), to_date: parseISO(fy1.to_date) },
    { label: 'Custom Range', from_date: null, to_date: null }
  ];
};

export default function DateRangeDropdown({ dateFrom, dateTo, activePreset, onChange, showRangeBelow = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  // Stays on-screen: flips left/up or caps height as needed (CSS centres it on phones)
  const popoverStyle = usePopoverPlacement(open, triggerRef, popoverRef);

  const presets = getPresets();

  const [tempRange, setTempRange] = useState({
    from_date: dateFrom ? parseISO(dateFrom) : undefined,
    to_date: dateTo ? parseISO(dateTo) : undefined
  });
  const [tempPreset, setTempPreset] = useState(activePreset);

  // Sync state if props change (or when opened)
  useEffect(() => {
    if (open) {
      setTempRange({
        from_date: dateFrom ? parseISO(dateFrom) : undefined,
        to_date: dateTo ? parseISO(dateTo) : undefined
      });
      setTempPreset(activePreset);
    }
  }, [open, dateFrom, dateTo, activePreset]);

  // Handle click outside to close
  useEffect(() => {
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // Lock body scroll when picker is open
  useEffect(() => {
    if (open) {
      document.body.classList.add('picker-open');
    } else {
      document.body.classList.remove('picker-open');
    }
    return () => document.body.classList.remove('picker-open');
  }, [open]);

  const handleSelect = (range) => {
    setTempPreset('Custom Range');
    if (!range) {
      setTempRange({ from_date: undefined, to_date: undefined });
      return;
    }
    if (range.from && range.to) {
      if (Math.abs(differenceInDays(range.to, range.from)) > 180) {
        toast.error('Maximum 180 days allowed for custom range.');
        setTempRange({ from_date: range.from, to_date: undefined });
        return;
      }
    }
    // Mapping react-day-picker 'from/to' to our 'from_date/to_date'
    setTempRange({ from_date: range.from, to_date: range.to });
  };

  const handlePreset = (preset) => {
    if (preset.label === 'Custom Range') {
      setTempPreset('Custom Range');
    } else {
      setTempPreset(preset.label);
      setTempRange({ from_date: preset.from_date, to_date: preset.to_date });
      // Apply instantly for presets
      onChange(fmtDate(preset.from_date), fmtDate(preset.to_date), preset.label);
      setOpen(false);
    }
  };

  const handleApply = () => {
    const fromStr = tempRange.from_date ? fmtDate(tempRange.from_date) : '';
    let toStr = tempRange.to_date ? fmtDate(tempRange.to_date) : '';
    if (tempRange.from_date && !tempRange.to_date) toStr = fromStr; // copy from to 'to' if unset
    
    onChange(fromStr, toStr, tempPreset || 'Custom Range');
    setOpen(false);
  };

  const hasRange = Boolean(dateFrom && dateTo);
  const rangeText = hasRange ? `${fmtDisplay(dateFrom)} → ${fmtDisplay(dateTo)}` : '';
  const namedPreset = activePreset && activePreset !== 'Custom Range' ? activePreset : '';

  return (
    <div className="date-range-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        title={rangeText || 'Any date'}
        className={`date-range-trigger ${hasRange ? 'has-value' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <CalendarIcon size={14} className="date-icon" />
        <span className="date-trigger-text">
          {namedPreset ? (
            <>
              <span className="date-trigger-preset">{namedPreset}</span>
              {rangeText && !showRangeBelow && <span className="date-trigger-range">{rangeText}</span>}
            </>
          ) : hasRange ? (
            <span className="date-trigger-preset">{rangeText}</span>
          ) : (
            <span className="date-trigger-placeholder">Any date</span>
          )}
        </span>
        <ChevronDown size={14} className={`date-chevron ${open ? 'open' : ''}`} />
      </button>
      {showRangeBelow && namedPreset && rangeText && (
        <div className="date-range-subtitle">{rangeText}</div>
      )}

      {open && (
        <div className="date-range-popover fade-in" ref={popoverRef} style={popoverStyle}>
          <div className="date-range-sidebar">
            <div className="date-presets-title">Presets</div>
            {presets.map(p => (
              <button 
                key={p.label}
                className={`date-preset-btn ${tempPreset === p.label ? 'active' : ''}`}
                onClick={() => handlePreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
          
          <div className="date-range-calendar">
            <DayPicker
              mode="range"
              selected={{ from: tempRange.from_date, to: tempRange.to_date }}
              onSelect={handleSelect}
              max={today()} // don't allow future dates
              showOutsideDays
              className="custom-calendar-style"
            />
            <div className="date-range-footer">
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleApply}
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
