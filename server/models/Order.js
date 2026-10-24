const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    card_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
    order_date: { type: Date, required: true },
    delivered_date: { type: Date },
    order_amount: { type: Number, required: true },
    return_amount: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    cashback: { type: Number, default: 0 },
    // Extra cashback from an e-comm coupon/offer (not the card's cashback, so it
    // doesn't use up the card's cashback limit). coupon_in_profit decides
    // whether it counts towards profit — see utils/profit.js.
    coupon_cashback: { type: Number, default: 0, min: 0 },
    coupon_in_profit: { type: Boolean, default: true },
    // Total amount paid to the friend whose card was used. Set only for
    // friend-card orders (null otherwise) — see utils/profit.js.
    friend_amount: { type: Number, default: null, min: 0 },
    // Advance already paid to the friend against friend_amount (friend orders
    // only; null/0 = no advance). Pending dues = friend_amount − advance_amount.
    advance_amount: { type: Number, default: null, min: 0 },
    // Free text; options come from Variant.DEFAULT_VARIANTS + user's custom variants
    variant: { type: String, trim: true, maxlength: 30, default: 'NA' },
    model_ordered: { type: String, required: true },
    id_used: { type: String, required: true },

    delivery_status: {
        type: String,
        enum: ['Delivered', 'Pending', 'Cancelled'],
        default: 'Pending',
        required: true
    },
    ecomm_site: {
        type: String,
        trim: true,
        required: true
    },
    seller_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    is_cleared: { type: Boolean, default: false },
    remark: { type: String, default: '', trim: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Orders list / reports / AI: user scope, newest first
OrderSchema.index({ user_id: 1, order_date: -1 });
// Seller + analytics stats ({ user_id, delivery_status: 'Delivered' }, optionally
// + seller_id). Neither index below has delivery_status right after user_id,
// so they can't bound those matches — keep this one.
OrderSchema.index({ user_id: 1, delivery_status: 1, seller_id: 1 });
// Card-scoped views (transactions merged view, people/booker khata, reports)
OrderSchema.index({ user_id: 1, card_id: 1, delivery_status: 1 });
// Seller ledger / orders filtered by buyer, newest first
OrderSchema.index({ user_id: 1, seller_id: 1, order_date: -1 });
// Summary (matches on card_id without user_id)
OrderSchema.index({ card_id: 1, order_date: -1 });

module.exports = mongoose.model('Order', OrderSchema);
