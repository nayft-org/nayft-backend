import { statfs } from 'fs/promises';

/**
 * Returns approximate percent of disk space free for the filesystem containing `rootPath`.
 * Null if unavailable.
 */
export async function getDiskPercentFree(rootPath: string): Promise<number | null> {
  try {
    const s = await statfs(rootPath);
    const free = Number(s.bavail) * Number(s.bsize);
    const total = Number(s.blocks) * Number(s.bsize);
    if (total <= 0) return null;
    return (free / total) * 100;
  } catch {
    return null;
  }
}
