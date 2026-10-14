import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { putSession, stubLocation } from '../test/helpers';

function Who() {
  const { user } = useAuth();
  return <p>{user ? `${user.name} <${user.email}>` : 'nobody'}</p>;
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('AuthProvider (BrandShield session)', () => {
  it('shows the BrandShield user without any redirect', () => {
    const assign = stubLocation();
    putSession();
    render(<AuthProvider><Who /></AuthProvider>);
    expect(screen.getByText('Rita Shah <rita@company.com>')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('redirects to the BrandShield login when there is no session', () => {
    const assign = stubLocation();
    render(<AuthProvider><Who /></AuthProvider>);
    expect(screen.getByText('nobody')).toBeInTheDocument();
    expect(assign).toHaveBeenCalledWith('/login?next=/studio/');
  });
});
