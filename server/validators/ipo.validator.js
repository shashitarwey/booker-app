const { body, param, query } = require('express-validator');

const money = (field, label) => body(field).isFloat({ min: 0 }).withMessage(`${label} must be 0 or more`).toFloat();

exports.applicantCreateRules = [
    body('name').isString().trim().notEmpty().withMessage('Name is required')
        .isLength({ max: 80 }).withMessage('Name must be 80 characters or less'),
    body('broker').optional().isString().trim().isLength({ max: 60 }).withMessage('Broker must be 60 characters or less'),
    body('default_bank_account_id').optional({ values: 'null' }).custom(v => v === '' || /^[a-f\d]{24}$/i.test(v)).withMessage('Invalid bank account id'),
    body('notes').optional().isString().trim().isLength({ max: 500 }).withMessage('Notes must be 500 characters or less'),
];

exports.applicantUpdateRules = [
    param('id').isMongoId().withMessage('Invalid applicant id'),
    body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty')
        .isLength({ max: 80 }).withMessage('Name must be 80 characters or less'),
    body('broker').optional().isString().trim().isLength({ max: 60 }).withMessage('Broker must be 60 characters or less'),
    body('default_bank_account_id').optional({ values: 'null' }).custom(v => v === '' || /^[a-f\d]{24}$/i.test(v)).withMessage('Invalid bank account id'),
    body('notes').optional().isString().trim().isLength({ max: 500 }).withMessage('Notes must be 500 characters or less'),
];

exports.idRule = [param('id').isMongoId().withMessage('Invalid id')];

exports.listRules = [
    query('applicant_id').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid applicant id'),
    query('status').optional({ values: 'falsy' }).isIn(['applied', 'allotted', 'sold']).withMessage('Invalid status'),
];

const sellPrice = body('sell_price').optional({ values: 'null' })
    .custom(v => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0)).withMessage('Sell price must be 0 or more');

exports.applicationCreateRules = [
    body('entries').isArray({ min: 1, max: 50 }).withMessage('Pick at least one applicant'),
    body('entries.*.applicant_id').isMongoId().withMessage('Invalid applicant id'),
    body('entries.*.bank_account_id').isMongoId().withMessage('Pick the bank account for every applicant'),
    body('ipo_name').isString().trim().notEmpty().withMessage('IPO name is required')
        .isLength({ max: 120 }).withMessage('IPO name must be 120 characters or less'),
    money('lot_price', '1 lot price'),
    body('profit_share_percent').isFloat({ min: 0, max: 100 }).withMessage('Profit share must be between 0 and 100').toFloat(),
    body('allotted').optional().isBoolean().withMessage('allotted must be true or false').toBoolean(),
    sellPrice,
];

exports.applicationUpdateRules = [
    param('id').isMongoId().withMessage('Invalid application id'),
    body('applicant_id').optional().isMongoId().withMessage('Invalid applicant id'),
    body('bank_account_id').optional().isMongoId().withMessage('Invalid bank account id'),
    body('ipo_name').optional().isString().trim().notEmpty().withMessage('IPO name cannot be empty')
        .isLength({ max: 120 }).withMessage('IPO name must be 120 characters or less'),
    body('lot_price').optional().isFloat({ min: 0 }).withMessage('1 lot price must be 0 or more').toFloat(),
    body('profit_share_percent').optional().isFloat({ min: 0, max: 100 }).withMessage('Profit share must be between 0 and 100').toFloat(),
    body('allotted').optional().isBoolean().withMessage('allotted must be true or false').toBoolean(),
    sellPrice,
];
