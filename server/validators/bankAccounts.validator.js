const { body, param, query } = require('express-validator');

const text = (field, label, optional) => (optional ? body(field).optional() : body(field))
    .isString().trim().notEmpty().withMessage(`${label} is required`)
    .isLength({ max: 80 }).withMessage(`${label} must be 80 characters or less`);

const last4 = body('account_last4').optional().isString().trim()
    .matches(/^(\d{4})?$/).withMessage('Last 4 digits must be 4 numbers');

exports.createRules = [text('holder_name', 'Account holder'), text('bank_name', 'Bank'), last4];

exports.updateRules = [
    param('id').isMongoId().withMessage('Invalid bank account id'),
    text('holder_name', 'Account holder', true),
    text('bank_name', 'Bank', true),
    last4,
];

exports.idRule = [param('id').isMongoId().withMessage('Invalid bank account id')];

exports.summaryRules = [
    param('id').isMongoId().withMessage('Invalid bank account id'),
    query('from_date').optional({ values: 'falsy' }).isISO8601().withMessage('from_date must be a valid date'),
    query('to_date').optional({ values: 'falsy' }).isISO8601().withMessage('to_date must be a valid date'),
];

const dateRange = [
    query('from_date').optional({ values: 'falsy' }).isISO8601().withMessage('from_date must be a valid date'),
    query('to_date').optional({ values: 'falsy' }).isISO8601().withMessage('to_date must be a valid date'),
];

exports.holderSummaryRules = [
    query('holder').isString().trim().notEmpty().withMessage('holder is required'),
    ...dateRange,
];

exports.holderRenameRules = [
    body('from').isString().trim().notEmpty().withMessage('Current name is required'),
    text('to', 'New name'),
];
