import { describe, expect, it } from 'vitest';
import { passwordProblem } from './passwordPolicy';

describe('sign-up password policy (mirrors the server)', () => {
  it('accepts a normal passphrase', () => {
    expect(passwordProblem('correct horse battery', 'Rita Shah', 'rita@company.com')).toBeNull();
  });
  it('refuses short, all-digit, few-distinct and trivial passwords', () => {
    expect(passwordProblem('short1!')).toMatch(/at least 10 characters/);
    expect(passwordProblem('48291736405')).toMatch(/too easy/);
    expect(passwordProblem('abababababab')).toMatch(/too easy/);
    expect(passwordProblem('Password1234')).toMatch(/too easy/);
  });
  it('refuses more than 72 bytes', () => {
    expect(passwordProblem('x1y2z3'.repeat(13))).toMatch(/72 bytes/);
  });
  it('refuses the name, the email, its local part, and the local part twice', () => {
    expect(passwordProblem('rita shah shah', 'rita shah shah', '')).toMatch(/name or email/);
    expect(passwordProblem('rita.shah@company.com', 'x', 'Rita.Shah@company.com')).toMatch(/name or email/);
    expect(passwordProblem('ritashahrita', 'x', 'ritashahrita@company.com')).toMatch(/name or email/);
    expect(passwordProblem('ritashahritashah', 'x', 'ritashah@company.com')).toMatch(/name or email/);
  });
});
