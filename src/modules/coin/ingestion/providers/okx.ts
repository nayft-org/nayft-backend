import axios from 'axios';

const OKX_BASE_URL = 'https://www.okx.com';

export interface OkxInstrument {
  instId: string;
  baseCcy: string;
  quoteCcy: string;
  state: string;
  raw: Record<string, unknown>;
}

export interface OkxFetchResult {
  provider: 'okx';
  provider_timestamp?: Date;
  instruments: OkxInstrument[];
}

export async function fetchOkx(): Promise<OkxFetchResult> {
  const response = await axios.get(`${OKX_BASE_URL}/api/v5/public/instruments`, {
    params: { instType: 'SPOT' },
  });
  const data = response.data;

  const list = data?.data ?? [];
  const instruments: OkxInstrument[] = list.map((item: Record<string, unknown>) => ({
    instId: String(item.instId ?? ''),
    baseCcy: String(item.baseCcy ?? ''),
    quoteCcy: String(item.quoteCcy ?? ''),
    state: String(item.state ?? ''),
    raw: item,
  }));

  return {
    provider: 'okx',
    instruments,
  };
}
