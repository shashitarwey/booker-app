import { MapPin, MessageSquare, CheckSquare, Square } from 'lucide-react';
import ActionMenu from '../../common/ActionMenu';
import { fmtCurrency, fmtSignedCurrency, cardLabel } from '../../utils/formatters';
import { orderProfit, isFriendOrder } from '../../utils/profit';

/** Phone layout of the order list: one card per order. */
export default function OrderCardList({ orders, selected, toggleSelect, openMenu, setOpenMenu, menuItems, onOpen, onToggleClear, showHolder, isGroup }) {
  return (
    <div className="order-cards">
      {orders.map(order => {
        const profit = orderProfit(order);
        const friendOrder = isFriendOrder(order);
        const isCancelled = order.delivery_status === 'Cancelled';
        const isDelivered = order.delivery_status === 'Delivered';
        const hasRemark = Boolean(order.remark && order.remark.trim());
        const holder = order.card_id?.holder_id;
        return (
          <article
            key={order._id}
            className={`order-card${isCancelled ? ' is-cancelled' : ''}${selected.has(order._id) ? ' is-selected' : ''}`}
            onClick={() => onOpen(order)}
          >
            <div className="order-card-top">
              <button className="order-card-check" onClick={e => { e.stopPropagation(); toggleSelect(order._id); }} aria-label="Select order">
                {selected.has(order._id)
                  ? <CheckSquare size={18} className="ot-checked" />
                  : <Square size={18} className="ot-unchecked" />}
              </button>
              <div className="order-card-title">
                <div className="order-card-item">
                  {order.model_ordered}
                  {order.quantity > 1 && <span className="order-card-qty">×{order.quantity}</span>}
                  {hasRemark && <MessageSquare size={13} className="ot-remark-icon" />}
                </div>
                <div className="order-card-sub">
                  {order.variant !== 'NA' ? `${order.variant} · ` : ''}{order.ecomm_site} · {new Date(order.order_date).toLocaleDateString('en-GB')}
                </div>
              </div>
              <span className={`badge ${isDelivered ? 'badge-success' : isCancelled ? 'badge-danger' : 'badge-surface'}`}>
                {order.delivery_status}
              </span>
              <div onClick={e => e.stopPropagation()}>
                <ActionMenu id={`m-${order._id}`} openId={openMenu} onToggle={setOpenMenu} items={menuItems(order, hasRemark)} />
              </div>
            </div>

            <div className="order-card-meta">
              <span><MapPin size={11} /> {order.seller_id?.name || '—'}</span>
              {showHolder && holder && <span>{isGroup ? 'Member' : 'Booker'}: <strong>{holder.relation === 'self' ? 'You' : holder.name}</strong></span>}
              {order.card_id && <span>{cardLabel(order.card_id)}</span>}
            </div>

            <div className="order-card-amounts">
              <div><span>Ordered</span><strong>{fmtCurrency(order.order_amount)}</strong></div>
              <div><span>Return</span><strong className="text-accent">{fmtCurrency(order.return_amount)}</strong></div>
              {friendOrder
                ? <div><span>To Friend</span><strong>{fmtCurrency(order.friend_amount)}</strong></div>
                : <div><span>Cashback</span><strong className="text-success">{fmtCurrency((order.cashback || 0) + (order.coupon_in_profit === false ? 0 : (order.coupon_cashback || 0)))}</strong></div>}
              <div>
                <span>Profit</span>
                <strong className={isCancelled ? 'text-muted' : profit >= 0 ? 'text-success' : 'text-danger'}>
                  {isCancelled ? '—' : fmtSignedCurrency(profit)}
                </strong>
              </div>
            </div>

            <div className="order-card-foot" onClick={e => e.stopPropagation()}>
              <span className={`order-card-foot-note${order.advance_amount > 0 ? ' has-advance' : ''}`}>
                {friendOrder && (order.advance_amount > 0 ? `Advance ${fmtCurrency(order.advance_amount)}` : 'No advance')}
                {order.delivered_date && `${friendOrder ? ' · ' : ''}Delivered ${new Date(order.delivered_date).toLocaleDateString('en-GB')}`}
              </span>
              <label className="order-card-clear">
                Cleared
                <button
                  className={`toggle-btn ${order.is_cleared ? 'toggle-on' : 'toggle-off'}`}
                  onClick={() => onToggleClear(order)}
                />
              </label>
            </div>
          </article>
        );
      })}
    </div>
  );
}
