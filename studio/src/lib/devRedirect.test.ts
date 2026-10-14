import { describe, expect, it } from 'vitest';
import { directDevRedirect } from './devRedirect';

const at = (port: string, pathname = '/studio/', search = '', hostname = 'localhost') => ({ hostname, port, pathname, search, hash: '' });

describe('directDevRedirect', () => {
  it('sends a direct visit on Studio\'s own dev port to BrandShield\'s origin', () => {
    expect(directDevRedirect(at('3000'))).toBe('http://localhost:5173/studio/');
    expect(directDevRedirect(at('3000', '/studio/', '?x=1', '127.0.0.1'))).toBe('http://localhost:5173/studio/?x=1');
  });
  it('turns a bare or wrong path into /studio/', () => {
    expect(directDevRedirect(at('3000', '/'))).toBe('http://localhost:5173/studio/');
    expect(directDevRedirect(at('3000', '/login', '?next=/studio/'))).toBe('http://localhost:5173/studio/?next=/studio/');
  });
  it('does nothing when Studio is served through BrandShield or on another host', () => {
    expect(directDevRedirect(at('5173'))).toBeNull();
    expect(directDevRedirect(at('5174'))).toBeNull(); // the browser-test stack
    expect(directDevRedirect(at('3000', '/studio/', '', 'studio.example.com'))).toBeNull();
  });
  it('honours a custom BrandShield address', () => {
    expect(directDevRedirect(at('3000'), 'http://localhost:5199/')).toBe('http://localhost:5199/studio/');
  });
});
