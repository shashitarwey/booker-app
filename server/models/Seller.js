const mongoose = require('mongoose');

const SellerSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    city: { type: String, required: true },
    phone: { type: String, trim: true, default: '' },
    // Buyer stats (total_amount_ordered / total_amount_get / profit) are not
    // stored — routes/sellers.js computes them live from Order. Older docs may
    // still carry those fields; they're never read and get overwritten in
    // every response, so they're harmless.
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

SellerSchema.index({ user_id: 1, name: 1 });

module.exports = mongoose.model('Seller', SellerSchema);
