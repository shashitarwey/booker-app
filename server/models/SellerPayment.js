const mongoose = require('mongoose');

const sellerPaymentSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    amount: { type: Number, required: true },
    payment_date: { type: Date, required: true },
    notes: { type: String, default: '' },
    receipt_url: { type: String, default: '' },
    // Which of the user's bank accounts the money was received in. Required for
    // new payments (routes/sellers.js); payments from before this field have null.
    bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

sellerPaymentSchema.index({ user_id: 1, seller_id: 1, payment_date: -1 });
sellerPaymentSchema.index({ user_id: 1, bank_account_id: 1, payment_date: -1 });

module.exports = mongoose.model('SellerPayment', sellerPaymentSchema);
