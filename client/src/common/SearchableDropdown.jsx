import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  required = false,
  error = '',
  disabled = false,
  // Optional async (value) => void. When set, typing a value that isn't in
  // `options` offers "+ Add …" which calls onCreate, then selects the value.
  onCreate = null,
  createLabel = 'Add',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync internal query when external value changes
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideMenu = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        // If they typed something but didn't select, revert to the actual bound value
        if (query !== value) setQuery(value || '');
      }
    };
    if (open) document.addEventListener('mousedown', handleOutsideMenu);
    return () => document.removeEventListener('mousedown', handleOutsideMenu);
  }, [open, query, value]);

  // Filter options based on input.
  // If the query matches the selected value exactly, show all options so the user can pick a different one.
  const isExactMatch = value && query.toLowerCase() === value.toLowerCase();
  const filtered = isExactMatch 
    ? options 
    : options.filter(opt => opt.toLowerCase().includes(query.toLowerCase()));

  const trimmed = query.trim();
  const canCreate = Boolean(onCreate) && trimmed !== ''
    && !options.some(opt => opt.toLowerCase() === trimmed.toLowerCase());
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate(trimmed);
      handleSelect(trimmed);
    } catch {
      // caller reports the error; keep the menu open so the user can retry
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (opt) => {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    // If they delete everything, clear the actual value too
    if (!val) onChange('');
  };

  return (
    <div className="custom-dropdown" ref={containerRef}>
      <div className="custom-dropdown-input-wrapper">
        <input
          ref={inputRef}
          className={`form-input pr-32 ${error ? 'error' : ''}`}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            // Optional: select all text on focus to make replacing easy
            inputRef.current?.select();
          }}
          autoComplete="off"
        />
        <ChevronDown
          size={16}
          className={`custom-dropdown-icon ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={() => {
            if (disabled) return;
            setOpen(!open);
            if (!open) inputRef.current?.focus();
          }}
        />
      </div>

      {open && (
        <div className="custom-dropdown-menu">
          {canCreate && (
            <button
              type="button"
              className="custom-dropdown-item custom-dropdown-create"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Adding…' : `+ ${createLabel} "${trimmed}"`}
            </button>
          )}
          {filtered.length > 0 ? (
            filtered.map(opt => (
              <div
                key={opt}
                className={`custom-dropdown-item ${opt === value ? 'selected' : ''}`}
                onClick={() => handleSelect(opt)}
              >
                {opt}
              </div>
            ))
          ) : canCreate ? null : (
            <div className="custom-dropdown-empty">
              No results. You can still use "{query}"
              <br />
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-8"
                onClick={() => handleSelect(query)}
              >
                Use "{query}"
              </button>
            </div>
          )}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
