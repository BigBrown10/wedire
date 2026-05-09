import fs from 'fs';
import path from 'path';

/**
 * Purges files in the renders directory that are older than the specified TTL.
 * @param ttlHours Time to live in hours (default: 6)
 */
export function purgeOldRenders(ttlHours: number = 6) {
  const renderDir = path.join(process.cwd(), 'public', 'renders');
  if (!fs.existsSync(renderDir)) return;

  const now = Date.now();
  const ttlMs = ttlHours * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(renderDir);
    let deletedCount = 0;

    files.forEach(file => {
      // Skip hidden files
      if (file.startsWith('.')) return;

      const filePath = path.join(renderDir, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > ttlMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      console.log(`[GC] Purged ${deletedCount} old renders (TTL: ${ttlHours}h)`);
    }
  } catch (err) {
    console.warn('[GC] Cleanup failed:', err instanceof Error ? err.message : err);
  }
}
