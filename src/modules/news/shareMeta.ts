import { config } from '../../config/env';

export type NewsShareMetaDto = {
  shareUrl: string;
  publisherUrl: string;
  ogImageUrl: string | null;
};

export function buildShareMeta(params: {
  externalId: string;
  sourceUrl: string;
  imageUrl?: string | null;
}): NewsShareMetaDto {
  const base = config.nayftShareBaseUrl.replace(/\/+$/, '');
  const shareUrl = `${base}/share/${encodeURIComponent(params.externalId)}`;
  return {
    shareUrl,
    publisherUrl: params.sourceUrl,
    ogImageUrl: params.imageUrl?.trim() || null,
  };
}
