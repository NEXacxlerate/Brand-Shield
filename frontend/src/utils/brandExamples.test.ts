import { describe, expect, it } from 'vitest';
import { brandExamples } from './brandExamples';

describe('brandExamples', () => {
  it('builds every example from the brand name', () => {
    const e = brandExamples('Zenith Pay');
    expect(e.compact).toBe('zenithpay');
    expect(e.swap).toBe('zenithpayx');
    expect(e.digit).toBe('z3nithpay');
    expect(e.addedWord).toBe('zenithpay-support');
    expect(e.addedPhrase).toBe('Zenith Pay Official Helpline');
    expect(e.spaced).toBe('Z E N I T H P A Y');
    expect(e.separated).toBe('zenith_pay');
    expect(e.transposed).toBe('zenithpya');
    expect(e.missing).toBe('zenithpy');
    expect(e.other).toBe('Zenith Bakery');
    expect(JSON.stringify(e).toLowerCase()).not.toContain('acme');
  });

  it('uses m -> rn when the name has an m', () => {
    expect(brandExamples('Acme Bank').swap).toBe('acrnebank');
  });

  it('copes with one-word, very short and empty names', () => {
    expect(brandExamples('Nova').separated).toBe('no_va');
    for (const n of ['X', 'AB', '', '   ', '!!!']) {
      const e = brandExamples(n);
      for (const v of Object.values(e)) expect(typeof v === 'string' && v.length > 0).toBe(true);
    }
    expect(brandExamples('X').swap).not.toBe('x');
  });
});
