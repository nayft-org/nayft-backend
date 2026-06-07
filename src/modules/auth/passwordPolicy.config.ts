import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_ZXCVBN_SCORE,
} from '@nayft/password-policy';

export const passwordPolicyConfig = {
  minLength: Number(process.env.PASSWORD_MIN_LENGTH) || PASSWORD_MIN_LENGTH,
  maxLength: Number(process.env.PASSWORD_MAX_LENGTH) || PASSWORD_MAX_LENGTH,
  minZxcvbnScore: Number(process.env.PASSWORD_MIN_ZXCVBN_SCORE) || PASSWORD_MIN_ZXCVBN_SCORE,
  blockCommon: process.env.PASSWORD_BLOCK_COMMON !== 'false',
};
