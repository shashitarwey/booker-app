const mongoose = require('mongoose');

// Built-in device variants (RAM/Storage) every user sees. Users can add their
// own (e.g. "3/32") which are stored per-user in this collection.
const DEFAULT_VARIANTS = ['NA', '2/32', '3/32', '4/64', '4/128', '6/128', '8/128', '8/256', '12/256', '12/512', '12/1024'];

const VariantSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    // Lower-cased name for case-insensitive uniqueness
    key: { type: String, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

VariantSchema.index({ user_id: 1, key: 1 }, { unique: true });

VariantSchema.statics.DEFAULT_VARIANTS = DEFAULT_VARIANTS;

module.exports = mongoose.model('Variant', VariantSchema);
