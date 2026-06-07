import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { authController } from './controller';
import { authenticate } from '../../middlewares/auth';

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
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  ],
  authController.signup
);

router.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.login
);

router.get('/me', authenticate, authController.getMe);

router.post('/google', authRateLimiter, authController.googleSignIn);

export default router;

