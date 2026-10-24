const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/booker_app';

mongoose.connect(MONGO_URI)
    .then(() => logger.info('MongoDB connected'))
    .catch(err => { logger.error('MongoDB connection failed', { error: err.message }); process.exit(1); });
