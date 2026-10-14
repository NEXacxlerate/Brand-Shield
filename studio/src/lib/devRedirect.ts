// Development only. Brand Studio's own dev server (port 3000) has no BrandShield session: the login lives on BrandShield's origin and the
// two apps share it through localStorage. BrandShield's dev server (port 5173) serves Studio at /studio/ through a proxy, so that is the
// address that works. Opening port 3000 directly (as an old README suggested) used to end on a dead page; now it hops to the right one.

interface Loc {
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
}

export const STUDIO_DEV_PORT = '3000';

/** Where to send a visitor who opened the Studio dev server directly, or null when nothing should happen. */
export function directDevRedirect(loc: Loc, shieldUrl = 'http://localhost:5173'): string | null {
  const local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
  if (!local || loc.port !== STUDIO_DEV_PORT) return null;
  const path = loc.pathname.startsWith('/studio') ? loc.pathname : '/studio/';
  return `${shieldUrl.replace(/\/+$/, '')}${path}${loc.search}${loc.hash}`;
}
