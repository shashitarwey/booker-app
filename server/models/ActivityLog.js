const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
        type: String,
        enum: ['created', 'updated', 'deleted'],
        required: true
    },
    entity: {
        type: String,
        enum: ['order', 'seller', 'seller_payment', 'transaction', 'card', 'customer', 'customer_entry', 'person', 'booker_payment'],
        required: true
    },
    entity_id: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    changed_fields: { type: [String], default: [] }
}, { timestamps: { createdAt: 'created_at' } });

ActivityLogSchema.index({ user_id: 1, created_at: -1 });
ActivityLogSchema.index({ user_id: 1, entity_id: 1 });
ActivityLogSchema.index({ created_at: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }); // TTL: auto-delete after 365 days (1 year)

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
