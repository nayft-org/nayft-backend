import { Router } from 'express';
import { body } from 'express-validator';
import { authController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.post(
  '/signup',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  ],
  authController.signup
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.login
);

router.get('/me', authenticate, authController.getMe);

router.post('/google', authController.googleSignIn);

export default router;

