# Brand Studio

Brand Studio (BrandStudio) is the AI branding companion of BrandShield: brand name ideas, logo designer, colour palettes, content, sentiment, audit, consultant chat and a collections shelf. It started as a standalone app (Firebase login, browser-side AI keys). It is now a separate app **inside this repository, in `studio/`**, served at **`/studio/`** on the same origin as BrandShield. The backend contract is `docs/STUDIO_INTEGRATION_CONTRACT.md`; the endpoints are in `docs/API.md` section 23.

## What changed from the standalone app

| Before | Now |
|---|---|
| Landing page and Firebase login | Removed. One login: the BrandShield JWT. |
| Firestore `collections` | `/api/studio/items` (BrandShield database, owner-only) |
| Groq / Hugging Face / Gemini called from the browser with `VITE_*` keys | `/api/studio/ai/chat`, `/image`, `/status` on the BrandShield backend |
| Firebase Analytics | The Analytics screen already used browser counters (`bc-analytics` in localStorage); it is unchanged. The dashboard counters (names, logos, content, saved) are computed from the saved items. |
| none | "Create brand & protect it in BrandShield" flow |

Removed on purpose: Firebase, `@google/genai`, `@huggingface/inference`, the Express/SQLite server stub, every `VITE_GROQ_API_KEY`, `VITE_HF_API_KEY`, `VITE_FIREBASE_*`. Nothing from the environment is injected into the bundle.

## Folder layout

```
studio/
  index.html, vite.config.ts      base '/studio/', dev port 3000 (strict), Tailwind v4
  src/
    App.tsx                       shell: sidebar, dashboard, tabs
    components/                   one file per tool; ProtectBrand.tsx is the registration wizard
    contexts/                     Auth (BrandShield session), Collections (items API), Brand, Theme
    lib/session.ts                reads/clears scammind.auth + scammind.user (same keys as BrandShield)
    lib/api.ts                    fetch client: Bearer, refresh once on 401, Web Locks, redirect to login
    lib/ai.ts                     chat/image/status calls and friendly error wording
    lib/items.ts                  saved-items client (+ one-off upload of the old guest collection)
    lib/brandshield.ts            logo rules, alias/keyword derivation, brand registration flow (409 -> confirm -> PUT)
    services/gemini.ts            the prompts (unchanged), now sent through lib/ai.ts
    test/, **/*.test.ts(x)        vitest + Testing Library (jsdom), no network
```

## Develop

1. Backend: `uvicorn` on port 8000 as usual. Frontend: BrandShield's dev server (it proxies `/studio` to port 3000 and `/api` to the backend).
2. `cd studio && npm install && npm run dev` (port 3000, strict).
3. Sign in at BrandShield, then open `/studio/` on the BrandShield dev address. Opening `http://127.0.0.1:3000/studio/` directly works for UI work, but that is another origin, so the BrandShield session is not there and you are sent to `/login`.
4. Checks: `npm run lint`, `npm test`, `npm run build` (CI uses Node 22).

Production: the build is static files under `/studio/`; the web server (or the BrandShield nginx / Vercel rewrites) must serve them at that path and send `/studio/*` without a file to `/studio/index.html`.

## How the shared login works

Both apps are on one origin, so they read the same storage. BrandShield's `frontend/src/api/client.ts` writes `scammind.auth` (`{access, refresh}`) and `scammind.user`; it uses `localStorage` when "keep me signed in" is on, `sessionStorage` when it is off. Studio reads them the same way (localStorage first), and:

- no session: go to `/login?next=/studio/` (BrandShield's page; the `next` parameter must be honoured there to come back);
- a `401`: refresh once with `POST /api/auth/refresh`, store the rotated pair back where the session lives, retry once; the refresh is single-flight in a tab and serialised across tabs and across BrandShield and Studio with `navigator.locks.request('scammind-refresh', ...)`. Inside the lock the stored tokens are re-read: if they changed since the failing request, the request is simply retried with them. Without the Web Locks API only the in-tab single flight remains;
- refresh rejected (4xx): both keys are cleared and the user goes to the login; a server error during refresh keeps the session;
- sign out: `POST /api/auth/logout` (best effort), clear both keys, go to `/login`. A sign-out in another tab is noticed through the `storage` event.

## Protect a brand in BrandShield

Dashboard card (and the sidebar item "Protect in BrandShield") opens the wizard. It collects name (default: the brand selected in the Studio), industry, short description (default: the generated about text or tagline), spellings (derived: no-space, hyphenated, underscored, first word; editable chips), keywords and optional official domains, and a logo (a logo saved in Collections, an uploaded file, or none). On submit:

1. Logo check against BrandShield's rules: PNG/JPEG/WebP, at most 2 MB, at least 256 px, width/height between 0.8 and 1.25. A picture that fails any size or shape rule is redrawn on a white 512 x 512 PNG (canvas) and the wizard says what was done.
2. `POST /api/brands`, then `POST /api/brands/{id}/logo` (multipart).
3. `409` (the account already has a brand): a dialog explains that continuing UPDATES the existing brand with `PUT /api/brands/{id}` and retires earlier detections when name, spellings, keywords or domains change (see `docs/DECISIONS.md`, "Brand changes and speed"). Only an explicit confirmation sends the PUT; the answer's `refresh.message` is shown on the result screen.
4. Result screen with the brand summary and two buttons: "Add official accounts & start protection" (`/setup`) and "Open BrandShield dashboard" (`/dashboard`), plain page navigations.
5. `422` lists are mapped to the form fields; `403` (viewer account) explains that the account cannot create a brand. A failed logo upload does not undo the brand (the result says so).

## Manual logo fallback

Logo generation needs Pollinations credits ("pollen"). When they are exhausted (the backend answers `503` "out of credits") or image generation is not configured, the Logo Designer shows a plain message and the **"Upload your own logo"** button is highlighted; an uploaded picture can be saved to Collections and used in the protect-brand wizard exactly like a generated one. The wizard has its own upload button. The status banner (`GET /api/studio/ai/status`) warns on the dashboard and Logo Designer when a feature is not configured or today's allowance is used.

## Limits

- Per user: 20 AI requests a minute, 200 text and 50 image calls a day (UTC); `429` is shown as a friendly wait message.
- Image generation can take up to two minutes, and produces nothing while the Pollinations credits are exhausted.
- Saved items: 500 per user, picture at most 2 MB, data at most 64 KB.
- Brand: an account can protect up to 10 brands (each Studio registration adds one and selects it); `viewer` accounts cannot register one.
- Remembered details: brand name, industry, audience, description, tone/style/mood are kept per account in the browser (`studio/src/lib/profile.ts`) and shared by every tool that has the field.
- Collections: generated or uploaded logos over 1.5 MB are scaled down before saving (the server accepts 2 MB).
- Analytics counters are per browser (localStorage), not per account.

## Image provider: Pollinations

Images come from Pollinations through the backend proxy (`POST /api/studio/ai/image`); the Hugging Face image route and its settings (`STUDIO_HF_API_KEY`, `STUDIO_IMAGE_ROUTE`) are gone. No new package: it is plain `httpx` plus Pillow. The optional Hugging Face TEXT provider of the scanner (`HUGGINGFACE_*`) is a separate feature and is untouched.

Docs read on 2026-10-14: https://gen.pollinations.ai/docs (OpenAPI reference; `enter.pollinations.ai/api/docs` redirects there), https://github.com/pollinations/pollinations/blob/main/APIDOCS.md, live model list https://gen.pollinations.ai/image/models.

Facts relied on (from those docs):
- Endpoint `GET https://gen.pollinations.ai/image/{prompt}` (prompt URL-encoded in the path). Key from enter.pollinations.ai, sent as `Authorization: Bearer <key>` (a `?key=` query parameter also exists; we use the header so the key never lands in a URL).
- Query: `model` (model id), `width`, `height` (default 1024), `seed` (default 0, -1 = random; we send -1), `safe` (optional prompt checks, off by default; we do not set it). Only some models honour `seed`.
- Response: image bytes, `image/jpeg`, `image/png` or `image/svg+xml` depending on the model. The server accepts only png/jpeg/webp, decodes with Pillow and re-encodes PNG.
- Errors (JSON `{status, success, error:{code,message}}`): 400 bad parameters (or `content_blocked` by `safe`), 401 missing/invalid key, 402 not enough pollen, 403 key lacks permission, 429 and 503 carry `Retry-After`, 500/502 upstream failure. Mapped to the safe messages in `docs/API.md`.
- `GET /image/models` lists models with `paid_only` and per-image pollen prices without a key. Default `STUDIO_IMAGE_MODEL=black-forest-labs/flux.1-schnell` (alias `flux`) is listed `paid_only: false` at about 0.002 pollen per image.
- A timed-out request can be resent identically: the server reuses the in-progress generation and bills once.

UNVERIFIED: numeric rate limits for `sk_` keys and how pollen is granted per tier (not in the pages read); a `nologo` option (not documented, not sent); whether 403 is used for anything but missing key permissions; the exact maximum width/height for `flux.1-schnell` (the app only asks for sizes up to 1280x720).

Verified once against the live API on 2026-10-14 with `python -m scripts.studio_ai_check`: the default model returned a 512x512 picture in about 8 seconds.
