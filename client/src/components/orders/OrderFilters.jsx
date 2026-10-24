import { Filter, X as XIcon } from 'lucide-react';
import { STATUS_FILTER_OPTIONS } from '../../constants';
import DateRangeDropdown from '../../common/DateRangeDropdown';
import SearchableDropdown from '../../common/SearchableDropdown';

/** Filter panel for the order tracker. State lives in OrdersPage. */
export default function OrderFilters({
  filters, setFilters, embedded, cards,
  sellerOptions, cardOptions, personOptions, sourceOptions,
  orderDatePreset, setOrderDatePreset, deliveryDatePreset, setDeliveryDatePreset,
  onClose, onClear, onApply,
}) {
  return (
    <div className="filter-panel filter-panel-compact">
      <div className="filter-panel-header">
        <span className="filter-panel-title">
          <Filter size={14} /> Filters
        </span>
        <button className="modal-close" onClick={onClose}><XIcon size={16} /></button>
      </div>

      <div className="filter-grid-compact">
        <div className="filter-cell">
          <label className="filter-cell-label">Order Date</label>
          <DateRangeDropdown
            dateFrom={filters.order_date_from}
            dateTo={filters.order_date_to}
            activePreset={orderDatePreset}
            onChange={(from, to, preset) => {
              setFilters(f => ({ ...f, order_date_from: from, order_date_to: to }));
              setOrderDatePreset(preset || '');
            }}
          />
        </div>
        <div className="filter-cell">
          <label className="filter-cell-label">Delivery Date</label>
          <DateRangeDropdown
            dateFrom={filters.delivery_date_from}
            dateTo={filters.delivery_date_to}
            activePreset={deliveryDatePreset}
            onChange={(from, to, preset) => {
              setFilters(f => ({ ...f, delivery_date_from: from, delivery_date_to: to }));
              setDeliveryDatePreset(preset || '');
            }}
          />
        </div>
        <div className="filter-cell">
          <label className="filter-cell-label">Buyer</label>
          <SearchableDropdown
            options={['All Buyers', ...sellerOptions.map(o => o.label)]}
            value={filters.seller_id ? (sellerOptions.find(o => o.value === filters.seller_id)?.label || '') : ''}
            onChange={val => {
              const opt = sellerOptions.find(o => o.label === val);
              setFilters(f => ({ ...f, seller_id: opt ? opt.value : '' }));
            }}
            placeholder="All Buyers"
          />
        </div>
        {!embedded && (
          <div className="filter-cell">
            <label className="filter-cell-label">Booker</label>
            <SearchableDropdown
              options={['All Bookers', ...personOptions.map(o => o.label)]}
              value={filters.person_id ? (personOptions.find(o => o.value === filters.person_id)?.label || '') : ''}
              onChange={val => {
                const opt = personOptions.find(o => o.label === val);
                // Changing booker clears a card that no longer belongs to the selection
                setFilters(f => {
                  const pid = opt ? opt.value : '';
                  const card = cards.find(c => c._id === f.card_id);
                  const keepCard = !pid || (card && String(card.holder_id?._id || card.holder_id) === pid);
                  return { ...f, person_id: pid, card_id: keepCard ? f.card_id : '' };
                });
              }}
              placeholder="All Bookers"
            />
          </div>
        )}
        <div className="filter-cell">
          <label className="filter-cell-label">Card</label>
          <SearchableDropdown
            options={['All Cards', ...cardOptions.map(o => o.label)]}
            value={filters.card_id ? (cardOptions.find(o => o.value === filters.card_id)?.label || '') : ''}
            onChange={val => {
              const opt = cardOptions.find(o => o.label === val);
              setFilters(f => ({ ...f, card_id: opt ? opt.value : '' }));
            }}
            placeholder="All Cards"
          />
        </div>
        <div className="filter-cell">
          <label className="filter-cell-label">Source</label>
          <SearchableDropdown
            options={sourceOptions}
            value={filters.ecomm_site || ''}
            onChange={val => setFilters(f => ({ ...f, ecomm_site: val === 'All' ? '' : val }))}
            placeholder="All Sources"
          />
        </div>
        <div className="filter-cell">
          <label className="filter-cell-label">Status</label>
          <SearchableDropdown
            options={STATUS_FILTER_OPTIONS}
            value={filters.delivery_status || ''}
            onChange={val => {
              const dbVal = val === 'All' ? '' : val;
              setFilters(f => ({ ...f, delivery_status: dbVal }));
            }}
            placeholder="All Statuses"
          />
        </div>
        <div className="filter-cell">
          <label className="filter-cell-label">Cleared</label>
          <SearchableDropdown
            options={['All', 'Cleared', 'Uncleared']}
            value={{ true: 'Cleared', false: 'Uncleared' }[filters.is_cleared] || ''}
            onChange={val => {
              const dbVal = val === 'Cleared' ? 'true' : val === 'Uncleared' ? 'false' : '';
              setFilters(f => ({ ...f, is_cleared: dbVal }));
            }}
            placeholder="All"
          />
        </div>
      </div>

      <div className="filter-panel-footer">
        <button className="btn btn-secondary btn-sm" onClick={onClear}>Clear All</button>
        <button className="btn btn-primary btn-sm" onClick={onApply}>Apply Filters</button>
      </div>
    </div>
  );
}
