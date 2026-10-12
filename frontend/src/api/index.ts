// Single entry point for pages: `import { api } from '../api'`.
import { checkHealth, isOffline, subscribeStatus, session } from './client';
import { authApi } from './auth';
import { dashboardApi } from './dashboard';
import { investigationsApi } from './investigations';
import { campaignsApi } from './campaigns';
import { appsApi } from './apps';
import { monitorApi } from './monitor';
import { reportsApi } from './reports';
import { watchlistApi } from './watchlist';
import { simulatorApi } from './simulator';

export const api = {
  get isOffline() {
    return isOffline();
  },
  subscribeStatus,
  checkHealth,
  session,
  ...authApi,
  ...dashboardApi,
  ...investigationsApi,
  ...campaignsApi,
  ...appsApi,
  ...monitorApi,
  ...reportsApi,
  ...watchlistApi,
  ...simulatorApi
};

export { session, ApiError, downloadFile, BASE_URL } from './client';
export * from './common';
void checkHealth();
export { useAsync } from './useAsync';
export { toast, errorMessage } from './toast';
