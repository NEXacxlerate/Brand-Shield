// Brand Studio is a separate app served on the same origin at /studio/ (shares the BrandShield session).
// VITE_STUDIO_URL is only for odd setups (Studio on another origin); it is not needed in production, Vercel or Docker.
export const STUDIO_URL: string = (import.meta.env.VITE_STUDIO_URL as string | undefined) || '/studio/';

/** Full-page navigation: Studio is not part of the React router. */
export function openStudio(): void {
  window.location.assign(STUDIO_URL);
}
