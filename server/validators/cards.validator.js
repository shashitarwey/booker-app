const { body, param } = require('express-validator');

const NETWORKS = ['Visa', 'Mastercard', 'AmEx', 'RuPay'];
const PERIODS = ['monthly', 'quarterly', 'half-yearly', 'yearly'];
const CARD_TYPES = ['primary', 'addon'];

const holderRules = [
    body('holder_id').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid holder_id'),
    body('card_type').optional({ values: 'falsy' }).isIn(CARD_TYPES).withMessage(`card_type must be one of ${CARD_TYPES.join(', ')}`),
    body('primary_card_id').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid primary_card_id'),
];

const createRules = [
    body('bank_name').isString().trim().notEmpty().withMessage('Bank name is required'),
    body('card_network').isIn(NETWORKS).withMessage(`card_network must be one of ${NETWORKS.join(', ')}`),
    body('last_four_digit').matches(/^\d{4}$/).withMessage('last_four_digit must be exactly 4 digits'),
    body('name_on_card').isString().trim().notEmpty().withMessage('Name on card is required'),
    body('cashback_enabled').optional({ values: 'falsy' }).isBoolean().withMessage('cashback_enabled must be boolean'),
    body('cashback_percent').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }).withMessage('cashback_percent must be between 0 and 100'),
    body('cashback_limit').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('cashback_limit must be >= 0'),
    body('cashback_period').optional({ values: 'falsy' }).isIn(PERIODS).withMessage(`cashback_period must be one of ${PERIODS.join(', ')}`),
    body('cashback_reset_day').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('cashback_reset_day must be 1-31'),
    body('cashback_cycle_start_month').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).withMessage('cashback_cycle_start_month must be 1-12'),
    body('billing_date').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('billing_date must be 1-31'),
    body('due_date').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('due_date must be 1-31'),
    body('cashback_sites').optional().isArray().withMessage('cashback_sites must be an array'),
    body('cashback_sites.*').optional().isString().trim(),
    ...holderRules,
];

const updateRules = [
    param('id').isMongoId().withMessage('Invalid card id'),
    body('bank_name').optional().isString().trim().notEmpty().withMessage('Bank name cannot be empty'),
    body('card_network').optional({ values: 'falsy' }).isIn(NETWORKS).withMessage(`card_network must be one of ${NETWORKS.join(', ')}`),
    body('last_four_digit').optional({ values: 'falsy' }).matches(/^\d{4}$/).withMessage('last_four_digit must be exactly 4 digits'),
    body('name_on_card').optional().isString().trim().notEmpty().withMessage('Name on card cannot be empty'),
    body('cashback_enabled').optional({ values: 'falsy' }).isBoolean().withMessage('cashback_enabled must be boolean'),
    body('cashback_percent').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }).withMessage('cashback_percent must be between 0 and 100'),
    body('cashback_limit').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('cashback_limit must be >= 0'),
    body('cashback_period').optional({ values: 'falsy' }).isIn(PERIODS).withMessage(`cashback_period must be one of ${PERIODS.join(', ')}`),
    body('cashback_reset_day').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('cashback_reset_day must be 1-31'),
    body('cashback_cycle_start_month').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).withMessage('cashback_cycle_start_month must be 1-12'),
    body('billing_date').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('billing_date must be 1-31'),
    body('due_date').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }).withMessage('due_date must be 1-31'),
    body('cashback_sites').optional().isArray().withMessage('cashback_sites must be an array'),
    body('cashback_sites.*').optional().isString().trim(),
    ...holderRules,
];

const idRule = [param('id').isMongoId().withMessage('Invalid card id')];

module.exports = { createRules, updateRules, idRule };
