// Tiny toast for success / error messages (no provider needed).
type Kind = 'success' | 'error' | 'info';

function show(message: string, kind: Kind) {
  const el = document.createElement('div');
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  const colors: Record<Kind, string> = { success: '#34D399', error: '#FF6B6B', info: '#7F95FF' };
  el.style.cssText = [
    'position:fixed', 'right:20px', 'bottom:20px', 'z-index:9999', 'max-width:420px', 'padding:12px 16px', 'border-radius:12px',
    'background:#131318', `border:1px solid ${colors[kind]}`, 'color:#EDEDF2', 'font:600 13px Manrope,system-ui,sans-serif',
    'box-shadow:0 20px 40px -20px rgba(0,0,0,.9)'
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3500);
}

export const toast = {
  success: (m: string) => show(m, 'success'),
  error: (m: string) => show(m, 'error'),
  info: (m: string) => show(m, 'info')
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}
