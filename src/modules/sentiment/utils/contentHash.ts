import { createHash } from 'crypto';

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ');
}

function normalizeField(text: string | undefined): string {
  const raw = stripHtml(text || '').trim();
  return raw.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
}

export function computeArticleContentHash(title: string, subtitle?: string): string {
  const normalized = `${normalizeField(title)}\n${normalizeField(subtitle)}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}
