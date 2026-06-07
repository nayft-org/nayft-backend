import {
  compareVerificationCodeHashes,
  generateVerificationCode,
  hashVerificationCode,
  normalizeVerificationCodeInput,
} from './verificationCode.util';

process.env.VERIFICATION_CODE_SECRET = 'test-secret-key-for-unit-tests-only';

describe('verificationCode.util', () => {
  it('generates 6-digit codes', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).not.toMatch(/^(\d)\1{5}$/);
  });

  it('normalizes valid input', () => {
    expect(normalizeVerificationCodeInput(' 482193 ')).toBe('482193');
    expect(normalizeVerificationCodeInput('abc')).toBeNull();
  });

  it('hashes and compares consistently', () => {
    const hash = hashVerificationCode('user1', 'email_signup', '482193');
    expect(compareVerificationCodeHashes(hash, hash)).toBe(true);
    const wrong = hashVerificationCode('user1', 'email_signup', '000000');
    expect(compareVerificationCodeHashes(hash, wrong)).toBe(false);
  });
});
