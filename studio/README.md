# Brand Studio

AI branding tools (names, logos, colour palettes, content, audit, sentiment, consultant chat) that live next to BrandShield. This is a **separate Vite app served at `/studio/` on the same origin** as BrandShield, so it shares BrandShield's login. It has no sign-in page and no secrets of its own.

- **Login:** the BrandShield session (`scammind.auth` / `scammind.user` in browser storage). No session means a redirect to `/login?next=/studio/`.
- **Saved items:** `/api/studio/items` (BrandShield database).
- **AI:** `/api/studio/ai/chat|image|status` (keys stay on the server).
- **Protect a brand:** the dashboard has "Create brand & protect it in BrandShield", which registers the brand through `/api/brands` and uploads the logo.

## Run

```bash
cd studio
npm install
npm run dev        # http://127.0.0.1:3000/studio/ (port 3000, strict)
npm run lint       # tsc --noEmit
npm test           # vitest
npm run build      # dist/ (base /studio/)
```

Normally open BrandShield's dev server: it proxies `/studio` to this server and `/api` to the backend, so both apps share one origin and one login. Opened directly, this dev server forwards `/api` to `http://127.0.0.1:8000` (override with `STUDIO_API_PROXY`), but the BrandShield session is not visible on a different origin.

See `docs/STUDIO.md` for the architecture and `docs/STUDIO_INTEGRATION_CONTRACT.md` for the backend contract.
