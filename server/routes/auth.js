const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ensureSelfPerson } = require('../utils/people');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    registerRules,
    loginRules,
    updateProfileRules,
    changePasswordRules,
    forgotPasswordRules,
    resetPasswordRules,
} = require('../validators/auth.validator');
const logger = require('../utils/logger');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cardvault_secret_change_in_prod';
const signToken = (user) =>
    jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, description: "Requires uppercase, lowercase, digit, special char" }
 *     responses:
 *       201: { description: User registered, returns token + user }
 *       400: { description: Validation error or email exists }
 *
 * /auth/login:
 *   post:
 *     summary: Login and receive JWT
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns token + user }
 *       401: { description: Invalid credentials }
 *
 * /auth/profile:
 *   put:
 *     summary: Update user name/email
 *     tags: [Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *     responses:
 *       200: { description: Profile updated, returns new token + user }
 *
 * /auth/change-password:
 *   put:
 *     summary: Change password with old password verification
 *     tags: [Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [old_password, new_password]
 *             properties:
 *               old_password: { type: string }
 *               new_password: { type: string }
 *     responses:
 *       200: { description: Password changed }
 *       401: { description: Old password incorrect }
 *
 * /auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200: { description: Reset email sent (always returns 200 to prevent enumeration) }
 *
 * /auth/reset-password/{token}:
 *   post:
 *     summary: Reset password using emailed token
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200: { description: Password reset successful }
 *       400: { description: Invalid or expired token }
 *
 * /auth/request-deletion:
 *   post:
 *     summary: Schedule account deletion (7-day grace period)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Deletion scheduled }
 *
 * /auth/cancel-deletion:
 *   post:
 *     summary: Cancel pending account deletion
 *     tags: [Auth]
 *     responses:
 *       200: { description: Deletion cancelled }
 *
 * /auth/account-status:
 *   get:
 *     summary: Get account deletion status
 *     tags: [Auth]
 *     responses:
 *       200: { description: Returns deletion_requested_at, scheduled_deletion_date, days_remaining }
 */

// POST /api/auth/register
router.post('/register', registerRules, validate, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ error: 'Email already registered' });

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: passwordHash });
        await ensureSelfPerson(user._id, user.name);

        res.status(201).json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login
router.post('/login', loginRules, validate, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password)))
            return res.status(401).json({ error: 'Invalid email or password' });

        // Cancel any pending deletion request on successful login
        if (user.deletion_requested_at) {
            user.deletion_requested_at = null;
            await user.save();
            logger.info('Deletion cancelled on login', { userId: user._id });
        }

        res.json({
            token: signToken(user),
            user: { id: user._id, name: user.name, email: user.email, deletion_requested_at: user.deletion_requested_at },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/auth/profile — update name and/or email (protected)
router.put('/profile', authMiddleware, updateProfileRules, validate, async (req, res) => {
    try {
        const { name, email } = req.body;

        const update = {};
        if (name !== undefined) update.name = name.trim();
        if (email !== undefined) {
            const lower = email.trim().toLowerCase();
            // Check if another user already uses this email
            const existing = await User.findOne({ email: lower, _id: { $ne: req.user.id } });
            if (existing) return res.status(409).json({ error: 'Email already in use by another account' });
            update.email = lower;
        }

        const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Re-issue JWT so the embedded claims stay up to date
        const token = signToken(user);
        logger.info('Profile updated', { userId: user._id, fields: Object.keys(update) });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT /api/auth/change-password — change password with old password verification (protected)
router.put('/change-password', authMiddleware, changePasswordRules, validate, async (req, res) => {
    try {
        const { old_password, new_password } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Verify old password
        const isMatch = await user.comparePassword(old_password);
        if (!isMatch) return res.status(401).json({ error: 'Old password is incorrect' });

        // Ensure new password is different
        const isSame = await bcrypt.compare(new_password, user.password);
        if (isSame) return res.status(400).json({ error: 'New password must be different from the old password' });

        user.password = await bcrypt.hash(new_password, 12);
        await user.save();

        logger.info('Password changed', { userId: user._id });
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/auth/request-deletion — schedule account for deletion (protected)
router.post('/request-deletion', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.deletion_requested_at) {
            return res.status(400).json({ error: 'Deletion already requested' });
        }

        user.deletion_requested_at = new Date();
        await user.save();

        const deleteDate = new Date(user.deletion_requested_at.getTime() + 7 * 24 * 60 * 60 * 1000);
        logger.info('Account deletion requested', { userId: user._id, scheduledFor: deleteDate });
        res.json({
            message: 'Account scheduled for deletion. Log in within 7 days to cancel.',
            deletion_requested_at: user.deletion_requested_at,
            scheduled_deletion_date: deleteDate,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/cancel-deletion — cancel a pending deletion request (protected)
router.post('/cancel-deletion', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.deletion_requested_at) {
            return res.status(400).json({ error: 'No deletion request is pending' });
        }

        user.deletion_requested_at = null;
        await user.save();

        logger.info('Account deletion cancelled', { userId: user._id });
        res.json({ message: 'Account deletion cancelled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/account-status — get current deletion status (protected)
router.get('/account-status', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('deletion_requested_at');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const result = { deletion_requested_at: user.deletion_requested_at };
        if (user.deletion_requested_at) {
            result.scheduled_deletion_date = new Date(
                user.deletion_requested_at.getTime() + 7 * 24 * 60 * 60 * 1000
            );
            result.days_remaining = Math.max(0, Math.ceil(
                (result.scheduled_deletion_date - Date.now()) / (24 * 60 * 60 * 1000)
            ));
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordResetEmail } = require('../utils/mailer');

// POST /api/auth/forgot-password — send reset email (public)
router.post('/forgot-password', forgotPasswordRules, validate, async (req, res) => {
    try {
        const { email } = req.body;

        // Always return 200 to prevent email enumeration
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            logger.info('Password reset requested for non-existent email', { email });
            return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
        }

        const rawToken = await PasswordResetToken.createToken(user._id);

        // Build reset URL — use CLIENT_URL env or fall back to the request origin
        const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${clientUrl}/reset-password/${rawToken}`;

        await sendPasswordResetEmail(user.email, resetUrl);

        logger.info('Password reset email sent', { userId: user._id });
        res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    } catch (err) {
        logger.error('Forgot password error', { error: err.message });
        res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }
});

// POST /api/auth/reset-password/:token — reset password using token (public)
router.post('/reset-password/:token', resetPasswordRules, validate, async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        // Verify token
        const tokenDoc = await PasswordResetToken.verifyToken(token);
        if (!tokenDoc) {
            return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
        }

        // Update password
        const user = await User.findById(tokenDoc.user_id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.password = await bcrypt.hash(password, 12);
        await user.save();

        // Mark token as used
        tokenDoc.used = true;
        await tokenDoc.save();

        logger.info('Password reset completed', { userId: user._id });
        res.json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (err) {
        logger.error('Reset password error', { error: err.message });
        res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
});

module.exports = router;
