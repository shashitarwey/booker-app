const mongoose = require('mongoose');

/**
 * One IPO applied through one applicant.
 * profit (once sold) = sell_price − lot_price; the applicant gets
 * profit_share_percent of it, the user keeps the rest (see utils/ipo.js).
 */
const IpoApplicationSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    applicant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'IpoApplicant', required: true },
    // Whose bank account the application money is blocked from (shared BankAccount list)
    bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    ipo_name: { type: String, required: true, trim: true, maxlength: 120 },
    lot_price: { type: Number, required: true, min: 0 },
    profit_share_percent: { type: Number, required: true, min: 0, max: 100 },
    allotted: { type: Boolean, default: false },
    // Total received for the lot when sold; only meaningful when allotted
    sell_price: { type: Number, default: null, min: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

IpoApplicationSchema.index({ user_id: 1, applicant_id: 1, created_at: -1 });
IpoApplicationSchema.index({ user_id: 1, ipo_name: 1 });

module.exports = mongoose.model('IpoApplication', IpoApplicationSchema);
