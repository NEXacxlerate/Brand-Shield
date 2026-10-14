// Brand Studio is a separate app served on the same origin at /studio/ (shares the BrandShield session).
// VITE_STUDIO_URL is only for odd setups (Studio on another origin); it is not needed in production, Vercel or Docker.
export const STUDIO_URL: string = (import.meta.env.VITE_STUDIO_URL as string | undefined) || '/studio/';

/** Full-page navigation: Studio is not part of the React router. */
export function openStudio(): void {
  window.location.assign(STUDIO_URL);
}

/**
 * Brand Studio sends signed-out visitors to /login?next=/studio/. Only a path inside /studio/ is accepted (never another site,
 * never "//host" or "..") so the parameter cannot be used as an open redirect.
 */
export function safeStudioNext(search: string): string | null {
  const raw = new URLSearchParams(search).get('next');
  if (!raw || !/^\/studio\/[A-Za-z0-9\-._~/]*$/.test(raw) || raw.includes('..') || raw.includes('//')) return null;
  return raw;
}
