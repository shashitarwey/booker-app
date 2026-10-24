const Person = require('../models/Person');
const User = require('../models/User');

/**
 * Return the user's "self" person, creating it on first use.
 * Upsert + the partial unique index make this safe under concurrent calls.
 */
async function ensureSelfPerson(userId, name) {
    const existing = await Person.findOne({ user_id: userId, relation: 'self' });
    if (existing) return existing;

    let displayName = name;
    if (!displayName) {
        const user = await User.findById(userId, 'name');
        displayName = user?.name || 'Me';
    }
    try {
        return await Person.findOneAndUpdate(
            { user_id: userId, relation: 'self' },
            { $setOnInsert: { user_id: userId, relation: 'self', name: displayName } },
            { upsert: true, new: true }
        );
    } catch (err) {
        // Lost an upsert race against the unique index — the doc now exists.
        if (err.code === 11000) return Person.findOne({ user_id: userId, relation: 'self' });
        throw err;
    }
}

/** IDs of the user's own + family people (the "Family" group, i.e. not bookers). */
async function familyPersonIds(userId) {
    const people = await Person.find({ user_id: userId, relation: { $in: ['self', 'family'] } }, '_id').lean();
    return people.map(p => p._id);
}

module.exports = { ensureSelfPerson, familyPersonIds };
