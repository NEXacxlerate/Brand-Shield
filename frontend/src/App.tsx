import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { onUnauthorized, session } from './api/client';
import { resetBrand } from './hooks/useBrand';
import { sm } from './api/sm';
import { VoiceAgentButton } from './components/voice/VoiceAgentButton';

// Pages matching PDF
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectBrandPage } from './pages/ProtectBrandPage';
import { SetupPage } from './pages/SetupPage';
import { DashboardPage } from './pages/DashboardPage';
import { BrandProfilePage } from './pages/BrandProfilePage';
import { SocialMonitoringPage } from './pages/SocialMonitoringPage';
import { AppStoreMonitoringPage } from './pages/AppStoreMonitoringPage';
import { LookalikeLabPage } from './pages/LookalikeLabPage';
import { SourceHealthPage } from './pages/SourceHealthPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { WebThreatsPage } from './pages/WebThreatsPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { Round2Dashboard } from './pages/Round2Dashboard';
import { UrlScannerPage } from './pages/UrlScannerPage';
import { AdminBrandsPage } from './pages/AdminBrandsPage';

const LandingPage = lazy(() => import('./landing/LandingPage').then((m) => ({ default: m.LandingPage })));

/** "/" is the marketing page for visitors and the dashboard for signed-in users, as before. */
function Home() {
  if (session.isAuthenticated()) return <Navigate to="/dashboard" replace />;
  return (
    <Suspense fallback={null}>
      <LandingPage />
    </Suspense>
  );
}

/** Pages only an administrator may open (the menu hides them too); anyone else is sent to the dashboard. */
function RequireAdmin() {
  // the account saved at sign-in; only when it is missing is the server asked (and then once)
  const [role, setRole] = useState<string | null | undefined>(() => session.user()?.role);
  useEffect(() => {
    if (role) return;
    let alive = true;
    sm.me()
      .then((u) => alive && setRole(u.role))
      .catch(() => alive && setRole(null));
    return () => {
      alive = false;
    };
  }, [role]);
  if (role === undefined) return null;
  return role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

function RequireAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(
    () =>
      onUnauthorized(() => {
        resetBrand();
        navigate('/login', { replace: true });
      }),
    [navigate]
  );

  // No silent offline session: without a token the user must sign in.
  if (!session.isAuthenticated()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // The voice assistant is mounted once here (above every signed-in route), so it keeps its state while the person moves between pages.
  return (
    <>
      <Outlet />
      <VoiceAgentButton />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 1. /login: Sign in */}
        <Route path="/login" element={<LoginPage />} />
        {/* Create account (public): signs the new user in and goes to /protect-brand */}
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<RequireAuth />}>
          {/* Post-login brand protection workflow */}
          <Route path="/protect-brand" element={<ProtectBrandPage />} />
          <Route path="/protect-your-brand" element={<Navigate to="/protect-brand" replace />} />

          {/* 2. /setup: 3-step first-run (the admin must be signed in) */}
          <Route path="/setup" element={<SetupPage />} />

          {/* 3. /dashboard */}
          <Route
            path="/dashboard"
            element={
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            }
          />

          {/* 4. /brand: Brand Profile */}
          <Route
            path="/brand"
            element={
              <AppLayout>
                <BrandProfilePage />
              </AppLayout>
            }
          />

          {/* 5. /social: Social Media Monitoring */}
          <Route
            path="/social"
            element={
              <AppLayout>
                <SocialMonitoringPage />
              </AppLayout>
            }
          />

          {/* 6. /apps: App Store Monitoring */}
          <Route
            path="/apps"
            element={
              <AppLayout>
                <AppStoreMonitoringPage />
              </AppLayout>
            }
          />

          <Route
            path="/web"
            element={
              <AppLayout>
                <WebThreatsPage />
              </AppLayout>
            }
          />
          <Route
            path="/investigations"
            element={
              <AppLayout>
                <InvestigationsPage />
              </AppLayout>
            }
          />

          <Route
            path="/r2"
            element={
              <AppLayout>
                <Round2Dashboard />
              </AppLayout>
            }
          />

          {/* 7. /lookalike: Look-alike Lab */}
          <Route
            path="/lookalike"
            element={
              <AppLayout>
                <LookalikeLabPage />
              </AppLayout>
            }
          />

          {/* /url-scanner: Fake URL Scanner */}
          <Route
            path="/url-scanner"
            element={
              <AppLayout>
                <UrlScannerPage />
              </AppLayout>
            }
          />

          {/* 9. /reports */}
          <Route
            path="/reports"
            element={
              <AppLayout>
                <ReportsPage />
              </AppLayout>
            }
          />

          {/* Administrators only: Source Health, Settings, Model Evaluation */}
          <Route element={<RequireAdmin />}>
            <Route path="/sources" element={<AppLayout><SourceHealthPage /></AppLayout>} />
            <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
            <Route path="/evaluation" element={<AppLayout><EvaluationPage /></AppLayout>} />
            <Route path="/admin/brands" element={<AppLayout><AdminBrandsPage /></AppLayout>} />
          </Route>
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
