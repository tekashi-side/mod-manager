import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface DownloadOptions {
  /** Opens the byte stream to read from (e.g. a CatalogEntry's `fetchBytes`). */
  openStream: () => Promise<ReadableStream<Uint8Array>>;
  /** Directory the final file is written into (same dir as the temp file). */
  destinationDir: string;
  /** Final file name within `destinationDir`. */
  fileName: string;
  /** Called with cumulative bytes written after each chunk. */
  onProgress?: (receivedBytes: number) => void;
}

/**
 * Stream bytes to a temp file in the destination directory, then atomically
 * rename it into place. On any failure the temp file is removed and the error is
 * rethrown, so the package folder never contains a half-written `.it` that the
 * game would try to load. Returns the final file path.
 *
 * The temp name is dotted (`.<name>.part`) so the package scanner — which only
 * matches the `uiscias…` grammar — ignores it even if a crash leaves one behind.
 */
export const downloadToFile = async (options: DownloadOptions): Promise<string> => {
  const finalPath = join(options.destinationDir, options.fileName);
  const tempPath = join(options.destinationDir, `.${options.fileName}.part`);

  const stream = await options.openStream();
  const reader = stream.getReader();
  const handle = await fs.open(tempPath, 'w');

  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await handle.write(value);
      received += value.byteLength;
      options.onProgress?.(received);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    await handle.close();
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  await handle.close();
  await fs.rename(tempPath, finalPath);
  return finalPath;
};
