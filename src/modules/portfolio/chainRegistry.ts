export type PortfolioChainKind = 'evm' | 'solana';

export interface PortfolioChainMetadata {
  id: string;
  name: string;
  symbol: string;
  nativeSymbol: string;
  kind: PortfolioChainKind;
  alchemyNotifyNetworks: string[];
  alchemyRpcSlug?: string;
  zerionChainId: string;
  explorerTxBaseUrl: string;
  supportsEvmReceiptRefresh: boolean;
}

export interface PortfolioChainDto {
  id: string;
  name: string;
  symbol: string;
  kind?: PortfolioChainKind;
  nativeSymbol?: string;
}

const PORTFOLIO_CHAIN_REGISTRY: PortfolioChainMetadata[] = [
  {
    id: 'eth',
    name: 'Ethereum',
    symbol: 'ETH',
    nativeSymbol: 'ETH',
    kind: 'evm',
    alchemyNotifyNetworks: ['ETH_MAINNET', 'eth-mainnet'],
    alchemyRpcSlug: 'eth-mainnet',
    zerionChainId: 'ethereum',
    explorerTxBaseUrl: 'https://etherscan.io/tx/',
    supportsEvmReceiptRefresh: true,
  },
  {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'POL',
    nativeSymbol: 'POL',
    kind: 'evm',
    alchemyNotifyNetworks: ['MATIC_MAINNET', 'POLYGON_MAINNET', 'polygon-mainnet', 'matic-mainnet'],
    alchemyRpcSlug: 'polygon-mainnet',
    zerionChainId: 'polygon',
    explorerTxBaseUrl: 'https://polygonscan.com/tx/',
    supportsEvmReceiptRefresh: true,
  },
  {
    id: 'bnb',
    name: 'BNB Chain',
    symbol: 'BNB',
    nativeSymbol: 'BNB',
    kind: 'evm',
    alchemyNotifyNetworks: ['BNB_MAINNET', 'BSC_MAINNET', 'bnb-mainnet', 'bsc-mainnet'],
    alchemyRpcSlug: 'bnb-mainnet',
    zerionChainId: 'binance-smart-chain',
    explorerTxBaseUrl: 'https://bscscan.com/tx/',
    supportsEvmReceiptRefresh: true,
  },
  {
    id: 'arb',
    name: 'Arbitrum',
    symbol: 'ARB',
    nativeSymbol: 'ETH',
    kind: 'evm',
    alchemyNotifyNetworks: ['ARB_MAINNET', 'ARBITRUM_MAINNET', 'arb-mainnet', 'arbitrum-mainnet'],
    alchemyRpcSlug: 'arb-mainnet',
    zerionChainId: 'arbitrum',
    explorerTxBaseUrl: 'https://arbiscan.io/tx/',
    supportsEvmReceiptRefresh: true,
  },
  {
    id: 'sol',
    name: 'Solana',
    symbol: 'SOL',
    nativeSymbol: 'SOL',
    kind: 'solana',
    alchemyNotifyNetworks: ['SOLANA_MAINNET', 'SOL_MAINNET', 'solana-mainnet', 'sol-mainnet'],
    alchemyRpcSlug: 'solana-mainnet',
    zerionChainId: 'solana',
    explorerTxBaseUrl: 'https://solscan.io/tx/',
    supportsEvmReceiptRefresh: false,
  },
];

const CHAIN_BY_ID = new Map(PORTFOLIO_CHAIN_REGISTRY.map((chain) => [chain.id, chain]));
const CHAIN_ALIASES = new Map<string, PortfolioChainMetadata>();

for (const chain of PORTFOLIO_CHAIN_REGISTRY) {
  const aliases = [
    chain.id,
    chain.zerionChainId,
    chain.alchemyRpcSlug,
    ...chain.alchemyNotifyNetworks,
  ].filter((value): value is string => Boolean(value));

  for (const alias of aliases) {
    CHAIN_ALIASES.set(normalizeAlias(alias), chain);
  }
}

CHAIN_ALIASES.set('matic', CHAIN_BY_ID.get('polygon')!);
CHAIN_ALIASES.set('bsc', CHAIN_BY_ID.get('bnb')!);
CHAIN_ALIASES.set('binance', CHAIN_BY_ID.get('bnb')!);
CHAIN_ALIASES.set('arbitrum-one', CHAIN_BY_ID.get('arb')!);

const EXTRA_CHAIN_ALIASES: Record<string, string[]> = {
  eth: ['1', 'chain_1', 'chain-1'],
  polygon: ['137', 'chain_137', 'chain-137'],
  bnb: ['56', 'chain_56', 'chain-56'],
  arb: ['42161', 'chain_42161', 'chain-42161'],
  sol: ['solana', '101', 'chain_101', 'chain-101'],
};

for (const [chainId, aliases] of Object.entries(EXTRA_CHAIN_ALIASES)) {
  const chain = CHAIN_BY_ID.get(chainId);
  if (!chain) continue;
  for (const alias of aliases) {
    CHAIN_ALIASES.set(normalizeAlias(alias), chain);
  }
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function parseJsonMap(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [key.trim().toLowerCase(), String(value ?? '').trim()])
        .filter(([key]) => Boolean(key))
    );
  } catch {
    return {};
  }
}

function chainIdsFromLegacyConfig(raw: string): string[] {
  const requested = new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  return PORTFOLIO_CHAIN_REGISTRY
    .filter((chain) => requested.has(chain.id))
    .map((chain) => chain.id);
}

export function listPortfolioChains(): PortfolioChainMetadata[] {
  return [...PORTFOLIO_CHAIN_REGISTRY];
}

export function getPortfolioChain(chainId: string): PortfolioChainMetadata | null {
  return CHAIN_BY_ID.get(chainId.trim().toLowerCase()) ?? null;
}

export function resolvePortfolioChain(value: string | undefined | null): PortfolioChainMetadata | null {
  if (!value) return null;
  return CHAIN_ALIASES.get(normalizeAlias(value)) ?? null;
}

export function parsePortfolioEnvMap(raw: string): Record<string, string> {
  return parseJsonMap(raw);
}

export function getSelectablePortfolioChains(
  webhookIdsRaw: string,
  legacySupportedChainsRaw: string,
  warn: (message: string) => void = () => {}
): PortfolioChainMetadata[] {
  const webhookIds = parseJsonMap(webhookIdsRaw);
  const activeWebhookIds = Object.entries(webhookIds)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);

  if (activeWebhookIds.length > 0) {
    const knownActive = new Set<string>();
    for (const key of activeWebhookIds) {
      const chain = getPortfolioChain(key);
      if (chain) {
        knownActive.add(chain.id);
      } else {
        warn(`[PortfolioChains] Ignoring unknown ALCHEMY_WEBHOOK_IDS key "${key}"`);
      }
    }
    return PORTFOLIO_CHAIN_REGISTRY.filter((chain) => knownActive.has(chain.id));
  }

  const fallbackIds = new Set(chainIdsFromLegacyConfig(legacySupportedChainsRaw));
  return PORTFOLIO_CHAIN_REGISTRY.filter((chain) => fallbackIds.has(chain.id));
}

export function portfolioChainToDto(chain: PortfolioChainMetadata): PortfolioChainDto {
  return {
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    kind: chain.kind,
    nativeSymbol: chain.nativeSymbol,
  };
}

export function validatePortfolioChainSelection(
  chainIds: string[],
  selectableChains: PortfolioChainMetadata[]
): PortfolioChainMetadata[] {
  const selectableIds = new Set(selectableChains.map((chain) => chain.id));
  const normalizedIds = Array.from(
    new Set(chainIds.map((chain) => chain.trim().toLowerCase()).filter(Boolean))
  );

  if (normalizedIds.length === 0) {
    throw new Error('chains must be a non-empty array');
  }

  const invalid = normalizedIds.filter((chainId) => !selectableIds.has(chainId));
  if (invalid.length > 0) {
    throw new Error(`Unsupported chains: ${invalid.join(', ')}`);
  }

  const selected = PORTFOLIO_CHAIN_REGISTRY.filter((chain) => normalizedIds.includes(chain.id));
  const kinds = new Set(selected.map((chain) => chain.kind));
  if (kinds.size > 1 || (selected.some((chain) => chain.kind === 'solana') && selected.length > 1)) {
    throw new Error('Solana must be monitored as its own wallet entry');
  }

  return selected;
}

export function getSelectionKind(chains: PortfolioChainMetadata[]): PortfolioChainKind {
  return chains.some((chain) => chain.kind === 'solana') ? 'solana' : 'evm';
}

export function normalizePortfolioAddress(address: string, kind: PortfolioChainKind): string {
  const trimmed = address.trim();
  if (!trimmed) throw new Error('address is required');

  if (kind === 'evm') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      throw new Error('Invalid EVM wallet address');
    }
    return trimmed.toLowerCase();
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    throw new Error('Invalid Solana wallet address');
  }
  return trimmed;
}

export function normalizePortfolioAddressForChain(address: string, chainOrAlias: string): string {
  const chain = resolvePortfolioChain(chainOrAlias);
  return normalizePortfolioAddress(address, chain?.kind ?? 'evm');
}

export function normalizeWebhookAddressForChain(
  address: unknown,
  chainOrAlias: string
): string | null {
  if (typeof address !== 'string') return null;
  const chain = resolvePortfolioChain(chainOrAlias);
  const trimmed = address.trim();
  if (!trimmed) return null;
  return chain?.kind === 'solana' ? trimmed : trimmed.toLowerCase();
}

export function addressesMatchForChain(left: string, right: string, chainOrAlias: string): boolean {
  const chain = resolvePortfolioChain(chainOrAlias);
  if (chain?.kind === 'solana') return left.trim() === right.trim();
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function getExplorerTxUrlForChain(chainOrAlias: string, txHash: string): string {
  const trimmedHash = txHash.trim();
  if (!trimmedHash) return '';
  const chain = resolvePortfolioChain(chainOrAlias);
  return chain ? `${chain.explorerTxBaseUrl}${trimmedHash}` : '';
}

export function supportsEvmReceiptRefresh(chainOrAlias: string): boolean {
  return resolvePortfolioChain(chainOrAlias)?.supportsEvmReceiptRefresh ?? false;
}

export function getAlchemyRpcSlugForChain(chainOrAlias: string): string | null {
  return resolvePortfolioChain(chainOrAlias)?.alchemyRpcSlug ?? null;
}

export function getZerionChainIdForChain(chainOrAlias: string): string | null {
  return resolvePortfolioChain(chainOrAlias)?.zerionChainId ?? null;
}

export function getCanonicalChainId(chainOrAlias: string): string | null {
  return resolvePortfolioChain(chainOrAlias)?.id ?? null;
}
