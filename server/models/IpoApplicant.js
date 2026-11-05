const mongoose = require('mongoose');

// A person whose demat / PAN is used to apply for IPOs. Separate from Person
// so IPO applicants never show up as bookers or family.
const IpoApplicantSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    broker: { type: String, trim: true, default: '', maxlength: 60 }, // Zerodha, Groww, …
    // Pre-fills the bank dropdown when applying an IPO for this person
    default_bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    notes: { type: String, trim: true, default: '', maxlength: 500 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

IpoApplicantSchema.index({ user_id: 1, name: 1 });

module.exports = mongoose.model('IpoApplicant', IpoApplicantSchema);
