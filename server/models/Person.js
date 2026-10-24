const mongoose = require('mongoose');

/**
 * Person — a card holder. Every card belongs to exactly one person.
 *
 *  self   – the account owner (auto-created, exactly one per user)
 *  family – family member; orders on their cards are 100% the user's profit
 *  friend – friend's network; orders on their cards record an
 *           "amount given to friend" and the user's profit is
 *           return_amount − friend_amount
 */
const RELATIONS = ['self', 'family', 'friend'];

const PersonSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    relation: { type: String, enum: RELATIONS, required: true },
    phone: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

PersonSchema.index({ user_id: 1, relation: 1, name: 1 });
// At most one "self" person per user
PersonSchema.index({ user_id: 1, relation: 1 }, { unique: true, partialFilterExpression: { relation: 'self' } });

PersonSchema.statics.RELATIONS = RELATIONS;

module.exports = mongoose.model('Person', PersonSchema);
