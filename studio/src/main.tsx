import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { directDevRedirect } from './lib/devRedirect';

if (import.meta.env.DEV) {
  // opened on Studio's own dev port: continue on BrandShield's origin, where the shared login lives
  const target = directDevRedirect(window.location, import.meta.env.VITE_SHIELD_URL as string | undefined);
  if (target) window.location.replace(target);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
