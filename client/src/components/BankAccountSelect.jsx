import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import SearchableDropdown from '../common/SearchableDropdown';
import BankAccountModal from './BankAccountModal';
import { bankLabel } from '../utils/bankAccounts';

/**
 * Pick a bank account from the shared list, with "+ New" to add one inline.
 * The parent owns the list (`accounts`) so several selects share one fetch;
 * `onAccountAdded` lets it append the new account.
 */
export default function BankAccountSelect({ accounts, value, onChange, onAccountAdded, defaultHolder = '', error = '', placeholder = 'Whose bank account?' }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="bank-select">
      <div className="bank-select-row">
        <div className="bank-select-input">
          <SearchableDropdown
            options={accounts.map(bankLabel)}
            value={bankLabel(accounts.find(a => a._id === value))}
            onChange={val => onChange(accounts.find(a => bankLabel(a) === val)?._id || '')}
            placeholder={placeholder}
            error={error}
          />
        </div>
        <button type="button" className="btn btn-secondary btn-sm bank-select-add" onClick={() => setAdding(true)} title="Add a bank account">
          <Plus size={14} /> New
        </button>
      </div>
      {/* Portal: this select usually sits inside another modal's <form> */}
      {adding && createPortal(
        <BankAccountModal
          defaultHolder={defaultHolder}
          holders={[...new Set(accounts.map(a => a.holder_name))]}
          onClose={() => setAdding(false)}
          onSaved={acc => { onAccountAdded(acc); onChange(acc._id); }}
        />,
        document.body,
      )}
    </div>
  );
}
