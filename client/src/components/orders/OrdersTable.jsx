import { MapPin, MessageSquare, CheckSquare, Square } from 'lucide-react';
import ActionMenu from '../../common/ActionMenu';
import { fmtCurrency, fmtSignedCurrency, cardLabel } from '../../utils/formatters';
import { orderProfit, isFriendOrder } from '../../utils/profit';

/** Desktop order table. */
export default function OrdersTable({
  orders, rowOffset, selected, toggleSelect, toggleSelectAll, openMenu, setOpenMenu, menuItems,
  onOpen, onToggleClear, showHolder, showFriendCol, isFriendScope,
}) {
  return (
    <div className="table-responsive-wrapper orders-table-wrap">
      <table className="data-table table-freeze-first">
        <thead>
          <tr>
            <th className="ot-check" onClick={toggleSelectAll}>
              {selected.size === orders.length && orders.length > 0
                ? <CheckSquare size={16} className="ot-checked" />
                : <Square size={16} className="ot-unchecked" />}
            </th>
            <th>#</th>
            <th>Order Date</th>
            <th>Delivery Date</th>
            <th>Item</th>
            <th>Source &amp; Account</th>
            <th>Buyer</th>
            <th>Card</th>
            <th>Ordered</th>
            <th>Returned</th>
            <th>Cashback</th>
            {showFriendCol && <th>Return to Friend</th>}
            <th>{isFriendScope ? 'My Profit (%)' : 'Profit (%)'}</th>
            <th>Status</th>
            <th>Clear</th>
            <th className="text-right col-action">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => {
            const profit      = orderProfit(order);
            const friendOrder = isFriendOrder(order);
            const isCancelled = order.delivery_status === 'Cancelled';
            const isDelivered = order.delivery_status === 'Delivered';

            const hasRemark = Boolean(order.remark && order.remark.trim());

            return (
              <tr
                key={order._id}
                className={`order-row-clickable${isCancelled ? ' is-cancelled' : ''}`}
                onClick={() => onOpen(order)}
              >
                <td className="ot-check" onClick={e => { e.stopPropagation(); toggleSelect(order._id); }}>
                  {selected.has(order._id)
                    ? <CheckSquare size={16} className="ot-checked" />
                    : <Square size={16} className="ot-unchecked" />}
                </td>
                <td className="ot-index">
                  <div className="ot-inline">
                    <span>{rowOffset + index + 1}</span>
                    {hasRemark && (
                      <MessageSquare
                        size={13}
                        className="ot-remark-icon"
                        aria-label="Has remark"
                      />
                    )}
                  </div>
                </td>
                <td className="nowrap">
                  <div className="font-medium">{new Date(order.order_date).toLocaleDateString('en-GB')}</div>
                </td>
                <td className="nowrap">
                  <div className="text-muted">{order.delivered_date ? new Date(order.delivered_date).toLocaleDateString('en-GB') : '—'}</div>
                </td>
                <td className="ot-item">
                  <div className="font-medium ot-item-name" title={order.model_ordered}>
                    <span className="truncate">
                      {order.model_ordered.length > 20 ? order.model_ordered.slice(0, 20) + '…' : order.model_ordered}
                    </span>
                    {order.quantity > 1 && <span className="qty-chip">×{order.quantity}</span>}
                  </div>
                  <div className="cell-sub">{order.variant !== 'NA' ? order.variant : ''}</div>
                </td>
                <td>
                  <div className="font-medium">{order.ecomm_site}</div>
                  <div className="cell-sub">{order.id_used}</div>
                </td>
                <td>
                  <div className="font-medium">{order.seller_id?.name || '—'}</div>
                  <div className="cell-sub ot-inline">
                    <MapPin size={11} /> {order.seller_id?.city || ''}
                  </div>
                </td>
                <td>
                  {order.card_id ? <span className="tx-card-pill">{cardLabel(order.card_id)}</span> : '—'}
                  {showHolder && order.card_id?.holder_id && (
                    <div className="cell-sub">
                      {order.card_id.holder_id.name}{order.card_id.card_type === 'addon' ? ' · Add-on' : ''}
                    </div>
                  )}
                </td>
                <td className="font-medium">{fmtCurrency(order.order_amount)}</td>
                <td className="font-medium text-accent">{fmtCurrency(order.return_amount)}</td>
                <td className="font-medium text-success">
                  {fmtCurrency(order.cashback)}
                  {order.coupon_cashback > 0 && (
                    <div className={`cell-sub${order.coupon_in_profit === false ? '' : ' text-success'}`}>
                      +{fmtCurrency(order.coupon_cashback)} coupon{order.coupon_in_profit === false ? ' (not in profit)' : ''}
                    </div>
                  )}
                </td>
                {showFriendCol && (
                  <td>
                    {friendOrder ? (
                      <>
                        <div className="font-medium">{fmtCurrency(order.friend_amount)}</div>
                        <div className={`cell-sub${order.advance_amount > 0 ? ' text-amber' : ''}`}>
                          {order.advance_amount > 0 ? `Adv ${fmtCurrency(order.advance_amount)}` : 'No advance'}
                        </div>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                )}
                <td className={`font-medium ${isCancelled ? 'text-muted' : profit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {isCancelled
                    ? '—'
                    : `${fmtSignedCurrency(profit)} (${order.order_amount > 0 ? ((profit / order.order_amount) * 100).toFixed(2) : '0.00'}%)`}
                </td>
                <td>
                  <span className={`badge ${isDelivered ? 'badge-success' : isCancelled ? 'badge-danger' : 'badge-surface'}`}>
                    {isDelivered ? 'Delivered' : isCancelled ? 'Cancelled' : 'Pending'}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button
                    className={`toggle-btn ${order.is_cleared ? 'toggle-on' : 'toggle-off'}`}
                    onClick={e => { e.stopPropagation(); onToggleClear(order); }}
                  />
                </td>
                <td className="text-right col-action" onClick={e => e.stopPropagation()}>
                  <ActionMenu
                    id={order._id}
                    openId={openMenu}
                    onToggle={setOpenMenu}
                    items={menuItems(order, hasRemark)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
