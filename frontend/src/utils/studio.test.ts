import { describe, expect, it } from 'vitest';
import { safeStudioNext } from './studio';

describe('safeStudioNext', () => {
  it('accepts paths inside /studio/', () => {
    expect(safeStudioNext('?next=/studio/')).toBe('/studio/');
    expect(safeStudioNext('?next=%2Fstudio%2Fassets%2Fx')).toBe('/studio/assets/x');
  });
  it('rejects anything that could leave Brand Studio or the site', () => {
    for (const bad of ['', '?next=', '?next=https://evil.example/', '?next=//evil.example/studio/', '?next=/dashboard', '?next=/studio', '?next=/studio/../admin', '?next=/studio//evil', '?next=javascript:alert(1)']) {
      expect(safeStudioNext(bad), bad).toBeNull();
    }
  });
});
