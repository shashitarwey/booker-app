const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Card holder (self / family member / friend)
        holder_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Person',
            required: [true, 'Card holder is required'],
        },
        card_type: { type: String, enum: ['primary', 'addon'], default: 'primary' },
        // For add-on cards: the primary card it hangs off (may belong to another holder)
        primary_card_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', default: null },
        bank_name: {
            type: String,
            required: [true, 'Bank name is required'],
            trim: true,
        },
        card_network: {
            type: String,
            required: [true, 'Card network is required'],
            enum: ['Visa', 'Mastercard', 'AmEx', 'RuPay'],
        },
        last_four_digit: {
            type: String,
            required: [true, 'Last 4 digits are required'],
            match: [/^\d{4}$/, 'last_four_digit must be exactly 4 digits'],
        },
        name_on_card: {
            type: String,
            required: [true, 'Name on card is required'],
            trim: true,
        },
        cashback_enabled: { type: Boolean, default: false },
        cashback_percent: { type: Number, default: 0, min: 0, max: 100 },
        cashback_limit: { type: Number, default: 0, min: 0 },
        cashback_period: { type: String, enum: ['monthly', 'quarterly', 'half-yearly', 'yearly'], default: 'monthly' },
        cashback_reset_day: { type: Number, min: 1, max: 31, default: 1 }, // Day of month when cashback cycle resets
        cashback_cycle_start_month: { type: Number, min: 1, max: 12, default: 1 }, // Month when first cycle begins (1=Jan, 12=Dec)
        // Restrict cashback to specific e-comm sites (e.g. "Amazon ICICI" → ['Amazon']).
        // Empty array means cashback applies to all sites.
        cashback_sites: { type: [String], default: [] },
        // Billing cycle reminder fields
        billing_date: { type: Number, min: 1, max: 31, default: null }, // Day statement is generated
        due_date:     { type: Number, min: 1, max: 31, default: null }, // Day payment is due
    },
    { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

cardSchema.index({ user_id: 1, bank_name: 1 });
cardSchema.index({ user_id: 1, holder_id: 1 });

module.exports = mongoose.model('Card', cardSchema);
