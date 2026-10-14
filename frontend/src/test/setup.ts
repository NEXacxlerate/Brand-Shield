import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearQueryCache } from '../api/queryCache';

afterEach(() => {
  cleanup();
  clearQueryCache(); // every test starts with an empty page cache
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});
