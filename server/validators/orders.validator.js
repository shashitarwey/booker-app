const { body, param } = require('express-validator');

const DELIVERY = ['Delivered', 'Pending', 'Cancelled'];

const baseRules = (optional = false) => {
    const opt = (chain) => (optional ? chain.optional() : chain);
    return [
        opt(body('card_id').isMongoId()).withMessage('card_id is required'),
        opt(body('seller_id').isMongoId()).withMessage('seller_id is required'),
        opt(body('order_date').isISO8601()).withMessage('order_date must be a valid date'),
        body('delivered_date').optional({ values: 'falsy' }).isISO8601().withMessage('delivered_date must be a valid date'),
        opt(body('order_amount').isFloat({ min: 0 })).withMessage('order_amount must be >= 0'),
        opt(body('return_amount').isFloat({ min: 0 })).withMessage('return_amount must be >= 0'),
        body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('quantity must be >= 1'),
        body('cashback').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('cashback must be >= 0'),
        body('coupon_cashback').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('coupon_cashback must be >= 0'),
        body('coupon_in_profit').optional().isBoolean().withMessage('coupon_in_profit must be true or false'),
        body('friend_amount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('friend_amount must be >= 0'),
        body('advance_amount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('advance_amount must be >= 0'),
        body('variant').optional({ values: 'falsy' }).isString().trim().isLength({ max: 30 }).withMessage('variant must be 30 characters or fewer'),
        opt(body('model_ordered').isString().trim().notEmpty()).withMessage('model_ordered is required'),
        opt(body('id_used').isString().trim().notEmpty()).withMessage('id_used is required'),
        body('delivery_status').optional({ values: 'falsy' }).isIn(DELIVERY).withMessage(`delivery_status must be one of ${DELIVERY.join(', ')}`),
        opt(body('ecomm_site').isString().trim().notEmpty()).withMessage('ecomm_site is required'),
        body('is_cleared').optional({ values: 'falsy' }).isBoolean().withMessage('is_cleared must be boolean'),
        body('remark').optional({ values: 'falsy' }).isString().withMessage('remark must be a string')
            .bail()
            .isLength({ max: 200 }).withMessage('remark must be 200 characters or fewer'),
    ];
};

exports.createRules = baseRules(false);
exports.updateRules = [param('id').isMongoId().withMessage('Invalid order id'), ...baseRules(true)];
exports.idRule = [param('id').isMongoId().withMessage('Invalid order id')];

exports.bulkStatusRules = [
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids.*').isMongoId().withMessage('Each id must be a valid MongoId'),
    body('delivery_status').isIn(DELIVERY).withMessage(`delivery_status must be one of ${DELIVERY.join(', ')}`),
    body('delivered_date').optional({ values: 'falsy' }).isISO8601().withMessage('delivered_date must be a valid date'),
];

exports.bulkClearRules = [
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids.*').isMongoId().withMessage('Each id must be a valid MongoId'),
    body('is_cleared').isBoolean().withMessage('is_cleared must be boolean'),
];

exports.bulkDeleteRules = [
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids.*').isMongoId().withMessage('Each id must be a valid MongoId'),
];
