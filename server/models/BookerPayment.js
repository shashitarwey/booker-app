const mongoose = require('mongoose');

/**
 * Payment made by the user TO a booker (friend), recorded in the booker's khata.
 * Advances entered on orders are not stored here — they live on the order
 * (Order.advance_amount) and are merged into the khata feed.
 */
const BookerPaymentSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    person_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    payment_date: { type: Date, required: true },
    notes: { type: String, trim: true, default: '', maxlength: 200 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

BookerPaymentSchema.index({ user_id: 1, person_id: 1, payment_date: -1 });

module.exports = mongoose.model('BookerPayment', BookerPaymentSchema);
