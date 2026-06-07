import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

let initialized = false;

export function ensureZxcvbnInitialized(): void {
  if (initialized) return;
  const options = {
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
  };
  zxcvbnOptions.setOptions(options);
  initialized = true;
}

export function scorePassword(password: string, userInputs: string[] = []): number {
  ensureZxcvbnInitialized();
  const result = zxcvbn(password, userInputs.filter(Boolean));
  return result.score;
}
