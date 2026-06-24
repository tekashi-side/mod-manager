import { describe, expect, it } from 'vitest';
import { buildManagedModFileName, parseManagedModFileName } from './modFilename';

describe('parseManagedModFileName', () => {
  it('parses a managed file name into id + integer version', () => {
    expect(parseManagedModFileName('uisciasZoom_00001.it')).toEqual({
      fileName: 'uisciasZoom_00001.it',
      modId: 'Zoom',
      version: 1,
    });
  });

  it('compares versions numerically regardless of zero-padding', () => {
    const a = parseManagedModFileName('uisciasDDtimer_6.it');
    const b = parseManagedModFileName('uisciasDDtimer_00011.it');
    expect(a?.version).toBe(6);
    expect(b?.version).toBe(11);
    expect((a?.version ?? 0) < (b?.version ?? 0)).toBe(true);
  });

  it('matches the prefix case-insensitively', () => {
    expect(parseManagedModFileName('UisciasCrom_2.it')?.modId).toBe('Crom');
  });

  it('returns null for non-managed files', () => {
    expect(parseManagedModFileName('data_99999.it')).toBeNull();
    expect(parseManagedModFileName('DDtimer_00005.it')).toBeNull();
    expect(parseManagedModFileName('uisciasExtra_part_1.it')).toBeNull();
    expect(parseManagedModFileName('uisciasZoom_1.txt')).toBeNull();
  });
});

describe('buildManagedModFileName', () => {
  it('round-trips with the parser', () => {
    const name = buildManagedModFileName('Zoom', 5);
    expect(name).toBe('uisciasZoom_5.it');
    expect(parseManagedModFileName(name)?.modId).toBe('Zoom');
  });
});
