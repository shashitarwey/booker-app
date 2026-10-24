const { body, param } = require('express-validator');

// "self" is auto-created and cannot be assigned through the API
const EDITABLE_RELATIONS = ['family', 'friend'];

const commonRules = [
    body('phone').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }).withMessage('phone must be 20 characters or fewer'),
    body('notes').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }).withMessage('notes must be 500 characters or fewer'),
];

exports.createRules = [
    body('name').isString().trim().notEmpty().withMessage('Name is required'),
    body('relation').isIn(EDITABLE_RELATIONS).withMessage(`relation must be one of ${EDITABLE_RELATIONS.join(', ')}`),
    ...commonRules,
];

exports.updateRules = [
    param('id').isMongoId().withMessage('Invalid person id'),
    body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty'),
    body('relation').optional().isIn(EDITABLE_RELATIONS).withMessage(`relation must be one of ${EDITABLE_RELATIONS.join(', ')}`),
    ...commonRules,
];

exports.idRule = [param('id').isMongoId().withMessage('Invalid person id')];
