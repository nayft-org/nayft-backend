import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { authMetrics } from '../../../observability/authMetrics';
import { sendPolicyError, sendError } from '../../../utils/response';
import { eventService } from '../../../core/event-system';
import {
  getPasswordFeedbackMessage,
  validatePasswordForSignup,
} from '../passwordValidation.service';
import type { PasswordEvaluationResult } from '@nayft/password-policy';

function hashIp(req: Request): string {
  const crypto = require('crypto') as typeof import('crypto');
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function emitPasswordViolation(
  req: Request,
  validation: PasswordEvaluationResult,
  endpoint: string
): void {
  authMetrics.passwordValidationFailedTotal += 1;
  for (const violation of validation.violations) {
    authMetrics.passwordViolationCounts[violation] =
      (authMetrics.passwordViolationCounts[violation] ?? 0) + 1;
  }

  console.warn(
    JSON.stringify({
      event: 'password_policy_violation',
      level: validation.level,
      violations: validation.violations,
      ipHash: hashIp(req),
      endpoint,
    })
  );

  eventService
    .emitEvent({
      featureKey: 'auth',
      eventType: 'password_validation_failed',
      metadata: {
        level: validation.level,
        violations: validation.violations.join(','),
        endpoint,
      },
    })
    .catch(() => {});
}

function rejectPassword(
  res: Response,
  req: Request,
  validation: PasswordEvaluationResult,
  endpoint: string
): void {
  emitPasswordViolation(req, validation, endpoint);
  sendPolicyError(res, getPasswordFeedbackMessage(validation.feedbackKey), 400, {
    code: 'PASSWORD_POLICY_VIOLATION',
    level: validation.level,
    violations: validation.violations,
  });
}

export function validateSignupPasswordMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
  const username = typeof req.body?.username === 'string' ? req.body.username : undefined;

  if (!password) {
    sendError(res, 'Password is required', 400);
    return;
  }

  const result = validatePasswordForSignup(password, { email, username });
  if (!result.valid) {
    rejectPassword(res, req, result, 'signup');
    return;
  }
  next();
}

export function validateNewPasswordMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const email = typeof req.body?.email === 'string' ? req.body.email : undefined;

  if (!newPassword) {
    sendError(res, 'New password is required', 400);
    return;
  }

  const result = validatePasswordForSignup(newPassword, { email });
  if (!result.valid) {
    const endpoint = req.path?.includes('reset') ? 'reset-password' : 'change-password';
    rejectPassword(res, req, result, endpoint);
    return;
  }
  next();
}

export function handleExpressValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    next();
    return;
  }
  sendError(res, errors.array()[0].msg, 400);
}
