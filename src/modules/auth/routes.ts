import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { authController } from './controller';
import { authenticate } from '../../middlewares/auth';
import {
  handleExpressValidationErrors,
  validateNewPasswordMiddleware,
  validateSignupPasswordMiddleware,
} from './middleware/validatePassword.middleware';

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many auth attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/signup',
  authRateLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  ],
  handleExpressValidationErrors,
  validateSignupPasswordMiddleware,
  authController.signup
);

router.get('/password-policy', authController.getPasswordPolicy);

router.post(
  '/change-password',
  authRateLimiter,
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').notEmpty().withMessage('New password is required'),
    body('newPassword').custom((newPassword, { req }) => {
      if (newPassword === req.body?.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  ],
  handleExpressValidationErrors,
  validateNewPasswordMiddleware,
  authController.changePassword
);

router.post(
  '/reset-password',
  authRateLimiter,
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('newPassword').notEmpty().withMessage('New password is required'),
  ],
  handleExpressValidationErrors,
  validateNewPasswordMiddleware,
  authController.resetPassword
);

router.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleExpressValidationErrors,
  authController.login
);

router.get('/me', authenticate, authController.getMe);

router.post('/google', authRateLimiter, authController.googleSignIn);

export default router;
