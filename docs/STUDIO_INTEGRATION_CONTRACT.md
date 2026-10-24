# Brand Studio integration contract (for the frontend agents)

One login for BrandShield and Brand Studio: the BrandShield JWT. Studio (the `studio/` folder, see `docs/STUDIO.md`) is a separate app served at `/studio/` on the **same origin** as BrandShield and calls this backend with relative URLs (`/api/...`). Full detail is in `docs/API.md` section 23; this page is the short, precise version. Nothing here needs Firebase, `VITE_GROQ_API_KEY`, `VITE_HF_API_KEY` or `VITE_FIREBASE_*` any more.

## 1. Auth

All JSON, UTF-8. Every authenticated call sends `Authorization: Bearer <access_token>`.

| Call | Body | Response |
|---|---|---|
| `POST /api/auth/register` (public) | `{name, email, password}` | `201` login payload |
| `POST /api/auth/login` (public) | `{email, password}` | `200` login payload |
| `POST /api/auth/refresh` (public) | `{refresh_token}` | `200` new login payload (the old refresh token is now dead: never send it twice, never refresh in parallel) |
| `POST /api/auth/logout` (public) | `{refresh_token}` | `{ok: true}` |
| `GET /api/me` | | `{id, name, email, role, active, default_brand_id}` |

Login payload (register, login and refresh):

```json
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 900,
  "user": { "id": 5, "name": "Rita Shah", "email": "rita@company.com", "role": "analyst", "active": true, "default_brand_id": null } }
```

Sign-up rules: name 1..80 characters; email unique (`409 "An account with this email already exists."`); password at least 10 characters, not trivial, not the name or email (`422`, the `msg` is a plain sentence); `403 "Sign-up is disabled"` when switched off; `429` after 5 sign-ups per IP or 3 per email per hour. New accounts are `analyst`. No email verification.

## 2. How Studio reads the session (same origin)

BrandShield's `frontend/src/api/client.ts` owns the session. Studio reads it and must not invent its own keys:

| Storage key | Value (JSON string) |
|---|---|
| `scammind.auth` | `{"access": "<jwt>", "refresh": "<jwt>"}` |
| `scammind.user` | `{"id": 5, "name": "...", "email": "...", "role": "admin\|analyst\|viewer", "active": true, "default_brand_id": 12 \| null}` |

- Where it lives: **`localStorage`** when "keep me signed in" is on, **`sessionStorage`** when it is off (a different tab of the same origin does not see sessionStorage). Read both, `localStorage` first, exactly like `read()` in `client.ts`. Both keys are always written together and removed together.
- Not signed in (no `scammind.auth`): send the user to `/login` (BrandShield), optionally with a return path to `/studio`.
- A `401` on any call: refresh once with `POST /api/auth/refresh` `{refresh_token: <session.refresh>}`, write the **new** pair back to the same storage with the same two keys (access, refresh and `user`), retry the original request once, and on a `4xx` from the refresh clear both keys and go to `/login`. Concurrent 401s must share one refresh (single flight): a rotated refresh token that is used twice revokes the whole session.
- Simplest and safest: Studio imports (or copies verbatim) the `session`, `request` and refresh logic of `client.ts` instead of re-implementing it. Sign-out = `POST /api/auth/logout` then remove both keys.
- Access tokens last 15 minutes (`expires_in`), refresh tokens 7 days.
- `role`: `viewer` can use Studio (items and AI) but cannot create a brand (`403`).

## 3. Registering a brand from Studio

Every account owns **its own** brands (up to 10 per account; one is selected via `POST /api/brands/{id}/select`, and every page without an explicit `brand_id` follows it). Brand data of other accounts is invisible (`404`).

1. `GET /api/me` -> `default_brand_id`; if not `null` the user already has a brand: `GET /api/brands/{id}` and use it.
2. Otherwise `POST /api/brands` (analyst or admin) with

```json
{ "name": "Acme Bank", "industry": "Banking", "aliases": ["Acme"], "keywords": ["acmebank"], "domains": ["acmebank.com"], "description": "optional, <= 2000 chars" }
```
   `201` -> the full brand (`id`, `logo: null`, `official_accounts`, `official_apps`, `profile_health`, ...). `name` 1..120 characters; the lists are trimmed, lower-cased and de-duplicated by the server; domains must be valid hostnames. `409 {"detail": "A brand already exists. Edit it instead."}` means this user already has an active brand: **handle 409 by fetching `GET /api/brands` (the caller's own list, newest rule: first item) and editing it with PUT instead of failing.**
3. Logo (optional): `POST /api/brands/{id}/logo`, **multipart** field `file` (PNG, JPEG or WebP, at most 2 MB, at least 256 x 256 px, roughly square: width/height between 0.8 and 1.25). Response `{url, format, width, height, size_bytes, sha256}`; `GET /api/brands/{id}/logo` serves it (with the `Authorization` header: fetch it as a blob, an `<img src>` cannot send the header). Errors `413`, `415`, `422` carry a plain `detail`. A Studio logo that is saved as an item is a different thing: use the studio items endpoints below, then upload the same picture here if it should become the brand's official logo.
4. Update: `PUT /api/brands/{id}` with the full identity body (same shape as POST; leave `description` out to keep it). **Side effect:** if `name`, `aliases`, `keywords` or `domains` change, every earlier detection of the brand is retired, the Look-alike Lab's built-in cases are rebuilt from the new name, and the response carries `refresh: {results_retired, rescan, message}` (in sample data mode a new scan starts at once; in live mode a scan must be started manually with `POST /api/scan`). Changing only `industry` or `description` has no such effect. Show the `refresh.message` to the user before/after saving (see `docs/DECISIONS.md`, "Brand changes and speed").
5. Official accounts, apps, publishers and extra logos, if Studio wants them: `POST /api/brands/{id}/accounts` `{platform, handle}`, `POST /api/brands/{id}/apps` `{name, package_id, publisher, stores: ["google_play"]}`, `POST /api/brands/{id}/logos` (multipart `file`), as in `docs/API.md` section 5.

## 4. Saved items (replaces Firebase `collections`)

Any signed-in user, owner-only (another user's id is `404`, also for the admin). The item mirrors Studio's `SavedItem`:

```json
{ "id": "17", "userId": "5", "type": "logo", "label": "Acme logo", "data": {}, "url": "/api/studio/items/17/image", "timestamp": 1791990000000, "created_at": "2026-10-14T13:00:00Z" }
```
`type` is one of `logo | palette | brand_name | content | audit | sentiment`. `id` and `userId` are strings, `timestamp` is milliseconds, `url` is `null` without a picture (fetch `url` with the Authorization header as a blob).

| Call | Notes |
|---|---|
| `GET /api/studio/items?type=&limit=&offset=` | `{total, limit, offset, items}`, newest first, `limit` 1..500 (default 100). Replaces the Firestore `onSnapshot`: poll or refetch after a save/delete |
| `POST /api/studio/items` | JSON `{type, label, data?, image_base64?}` (`image_base64`: raw base64 or a `data:image/png;base64,...` URL, so the Studio's logo data URL can be sent as is) **or** multipart (`type`, `label`, `data` = JSON text, `file`). `201` + item |
| `DELETE /api/studio/items/{id}` | `{ok: true}`; `404` if not yours |
| `GET /api/studio/items/{id}/image` | the picture |

Limits: `label` 1..200 characters (`422`), `data` <= 64 KB (`413`), picture PNG/JPEG/WebP <= 2 MB (`413/415/422`), 500 items per user (`409`). The old guest `localStorage` collection (`brandcraft_collections`) can be uploaded once after sign-in by posting each item (data URL images work).

## 5. AI endpoints (the keys stay on the server)

Signed-in users only. Replace `groqChat` and `hfGenerateImage` and the chat session with these calls.

`POST /api/studio/ai/chat` `{messages, response_format: "json" | "text", temperature, max_tokens}`
- `messages`: `[{role: "system" | "user" | "assistant" | "model", content}]` (the Studio's `{role: "model", text}` is accepted as is). `groqChat(system, user)` -> `messages: [{role: "system", content: system}, {role: "user", content: user}]`, `response_format: "json"`, `temperature: 0.8`; the answer's `text` is the JSON string, so keep `JSON.parse(text)`. The multi-turn chat sends the whole history every time (system prompt first), `response_format: "text"`, `temperature: 0.7`.
- `200 {text, provider: "groq" | "gemini", model}`. Groq first, Gemini as automatic fallback.
- Caps: at most 40 messages, 30000 characters in total, 12000 per message, `max_tokens` <= 4096 (default 4096).

`POST /api/studio/ai/image` `{prompt, size}`; `size` in `512x512 | 768x768 | 1024x1024 | 1024x768 | 768x1024 | 1280x720 | 720x1280` (default `1024x1024`), prompt <= 2000 characters.
- `200 {image_base64, data_url, media_type: "image/png", width, height, provider, model}`; use `data_url` wherever the old browser-side image call returned a data URL. `provider` is `pollinations`. `POST ...?format=png` returns the bytes. Image generation takes a while (timeout 120 s): show a spinner and do not retry blindly.

`GET /api/studio/ai/status` -> what is configured and today's use: `{chat: {configured, providers, used_today, daily_limit}, image: {configured, used_today, daily_limit, sizes}, limits}`. Use it to hide the image tab when `image.configured` is false.

Limits per user: 20 AI requests a minute (chat and image together), 200 text and 50 image calls a day (UTC).

## 6. Error format and status codes

Every error is JSON with `detail`:

```json
{ "detail": "Incorrect email or password" }
```
or, for `422` validation, `{"detail": [{"loc": ["body", "email"], "msg": "...", "type": "..."}]}` (join the `msg` values; `loc[-1]` names the field). `BrandShield`'s `mapError` in `client.ts` already does this; reuse it. The password is never echoed.

| Status | Meaning in this API |
|---|---|
| 400 | bad input |
| 401 | missing, invalid or expired token: refresh once (section 2) |
| 403 | your role may not do this (`viewer` writing; non-admin on an admin route); sign-up disabled |
| 404 | not found **or not yours** (the same answer on purpose); `"No brand profile yet. Create one first."` when the account has no brand |
| 409 | duplicate: email taken, brand already exists, 500 items reached; scan already running |
| 413 / 415 | file or JSON too large / wrong file type |
| 422 | validation |
| 429 | rate limit or daily AI allowance reached; honour `Retry-After` (seconds) when present |
| 502 / 503 | the AI provider failed / is not configured / ran out of credits: the `detail` is safe to show to the user. A provider `402` (credits exhausted) reaches the browser as **`503` "The AI service has run out of credits..."**, never as `402`; the Studio treats both as "image generation unavailable" and offers manual logo upload |
| 500 | `{"detail": "Internal server error"}` |

Network failure (no HTTP answer) is a client-side error ("Cannot reach the server...").

## 7. Things Studio must not do

- Never put a provider key in the browser build; never call Groq, Pollinations or Gemini directly.
- Never store the tokens under other keys, and never log them.
- Never assume a brand id from another account works: always use `default_brand_id` from `GET /api/me` or the id returned by `GET /api/brands`.
- Never treat `404` on `/api/studio/items/{id}` as "retry later": the item is gone or not yours.

## 8. What the Studio implements (`studio/src/lib`)

- `session.ts` / `api.ts` copy the rules of `frontend/src/api/client.ts`: same storage keys and lookup order, Bearer header, one refresh per 401 with rotation, single flight per tab, and across tabs and apps `navigator.locks.request('scammind-refresh', ...)` (inside the lock the stored tokens are re-read; changed since the failing request means retry with them, otherwise refresh and store). Without Web Locks only the per-tab single flight remains. **For the same guarantee BrandShield's `client.ts` must take the same lock name around its own refresh.** A rejected refresh clears both keys and goes to `/login?next=/studio/`; a 5xx during refresh keeps the session.
- `GET /api/brands` returns a plain array of `{id, name, ...}` (the caller's active brand first and only, one per account); the 409 flow uses `list[0]`.
- Open point for the BrandShield login page: `/login?next=/studio/` is only useful if `LoginPage` navigates to `next` (same origin paths only, never an absolute URL) after sign-in. At the time of writing it always goes to `/protect-brand`.
- Studio sign-out revokes the refresh token with `POST /api/auth/logout`, then clears both keys and goes to `/login`.
- A logo that is picked in Studio (saved item or upload) is normalised in the browser to a 512 x 512 PNG when it violates the logo rules (type stays PNG/JPEG/WebP, <= 2 MB, >= 256 px, ratio 0.8..1.25) before `POST /api/brands/{id}/logo`; the server rules stay authoritative (`413/415/422` are shown).
- Item pictures are fetched as blobs with the Authorization header and shown through object URLs.
