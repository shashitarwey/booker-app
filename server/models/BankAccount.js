const mongoose = require('mongoose');

/**
 * A bank account the user can pick across Booker (e.g. the account an IPO's
 * money is blocked from). Shared master data: any feature that references it
 * must be added to USAGE in routes/bankAccounts.js so deletes stay safe.
 */
const BankAccountSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    holder_name: { type: String, required: true, trim: true, maxlength: 80 },
    bank_name: { type: String, required: true, trim: true, maxlength: 80 },
    account_last4: { type: String, trim: true, default: '', match: [/^(\d{4})?$/, 'Last 4 digits must be 4 numbers'] },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

BankAccountSchema.index({ user_id: 1, holder_name: 1, bank_name: 1 });

module.exports = mongoose.model('BankAccount', BankAccountSchema);
