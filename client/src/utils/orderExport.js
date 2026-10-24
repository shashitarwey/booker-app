import { fmtDisplay } from './formatters';
import { toCSV, downloadCSV } from './csv';
import { orderProfit, isFriendOrder, friendEarning } from './profit';

const fmtCSVDate = (iso) => iso ? fmtDisplay(iso.slice(0, 10)) : '';

const cardLabelCSV = (card) =>
    card ? `${card.bank_name} - ${card.last_four_digit}` : '';

// Column spec shared between OrdersPage and SellerLedgerPage exports.
// Dates use dd-MM-yyyy so Excel doesn't auto-convert them to date serials
// and collapse the column to ########.
const orderColumns = [
    { header: 'Order Date', value: o => fmtCSVDate(o.order_date) },
    { header: 'Model', value: o => o.model_ordered },
    { header: 'Variant', value: o => o.variant },
    { header: 'Quantity', value: o => o.quantity },
    { header: 'Order Amount', value: o => o.order_amount },
    { header: 'Return Amount', value: o => o.return_amount },
    { header: 'Cashback', value: o => o.cashback || 0 },
    { header: 'Coupon Cashback', value: o => o.coupon_cashback || 0 },
    { header: 'Coupon in Profit', value: o => (o.coupon_cashback > 0 ? (o.coupon_in_profit === false ? 'No' : 'Yes') : '') },
    { header: 'Return to Friend', value: o => isFriendOrder(o) ? o.friend_amount : '' },
    { header: 'Advance to Friend', value: o => isFriendOrder(o) ? (o.advance_amount || 0) : '' },
    { header: 'Friend Earning', value: o => isFriendOrder(o) ? friendEarning(o) : '' },
    { header: 'Profit', value: o => orderProfit(o) },
    { header: 'Delivery Status', value: o => o.delivery_status },
    { header: 'Delivered Date', value: o => fmtCSVDate(o.delivered_date) },
    { header: 'Buyer', value: o => o.seller_id?.name || '' },
    { header: 'Location', value: o => o.seller_id?.city || '' },
    { header: 'E-comm Site', value: o => o.ecomm_site },
    { header: 'Card', value: o => cardLabelCSV(o.card_id) },
    { header: 'Card Holder', value: o => o.card_id?.holder_id?.name || '' },
    { header: 'ID Used', value: o => o.id_used },
    { header: 'Cleared', value: o => o.is_cleared ? 'Yes' : 'No' },
    { header: 'Remark', value: o => o.remark || '' },
];

export const exportOrdersCSV = (orders, filename) => {
    const csv = toCSV(orders, orderColumns);
    downloadCSV(filename, csv);
};
