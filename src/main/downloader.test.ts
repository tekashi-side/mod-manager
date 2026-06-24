import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { downloadToFile } from './downloader';

const dir = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/findias-downloader-test`;

const streamOf = (...chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const failingStream = (chunk: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.error(new Error('connection reset'));
    },
  });

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

describe('downloadToFile', () => {
  beforeEach(async () => {
    await fs.mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes the streamed bytes to the final file', async () => {
    const finalPath = await downloadToFile({
      openStream: async () => streamOf(bytes(1, 2, 3), bytes(4, 5)),
      destinationDir: dir,
      fileName: 'uisciasFoo_1.it',
    });

    expect(finalPath).toBe(join(dir, 'uisciasFoo_1.it'));
    expect(new Uint8Array(await fs.readFile(finalPath))).toEqual(bytes(1, 2, 3, 4, 5));
  });

  it('reports cumulative progress per chunk', async () => {
    const received: number[] = [];
    await downloadToFile({
      openStream: async () => streamOf(bytes(1, 2, 3), bytes(4, 5)),
      destinationDir: dir,
      fileName: 'uisciasFoo_1.it',
      onProgress: (n) => received.push(n),
    });

    expect(received).toEqual([3, 5]);
  });

  it('leaves no temp file behind on success', async () => {
    await downloadToFile({
      openStream: async () => streamOf(bytes(9)),
      destinationDir: dir,
      fileName: 'uisciasFoo_1.it',
    });
    expect(await fs.readdir(dir)).toEqual(['uisciasFoo_1.it']);
  });

  it('removes the temp file and writes nothing final when the stream fails', async () => {
    await expect(
      downloadToFile({
        openStream: async () => failingStream(bytes(1, 2)),
        destinationDir: dir,
        fileName: 'uisciasFoo_1.it',
      }),
    ).rejects.toThrow('connection reset');

    expect(await fs.readdir(dir)).toEqual([]);
  });
});
