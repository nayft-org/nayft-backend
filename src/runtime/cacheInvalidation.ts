import { invalidateOwnedAddresses } from '../websocket/walletOwnershipCache';

/** Hooks for wallet ownership cache invalidation on portfolio mutations. */
export const walletOwnershipCacheInvalidation = {
  onWalletAddressesChanged(userId: string): void {
    invalidateOwnedAddresses(userId);
  },

  onAccountDeleted(userId: string): void {
    invalidateOwnedAddresses(userId);
  },
};
