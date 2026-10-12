# Decisions (defaults chosen because the owner did not answer; change any of them)

| # | Decision | Notes |
|---|---|---|
| 1 | Rebuild from scratch in `server/` | Old `backend/` (investigations/campaigns product) is untouched and unused. |
| 2 | Keep old `backend/` and the 9 orphaned frontend pages for now | Revisit later; nothing in `server/` imports them. |
| 3 | Real login errors, no offline bypass | Frontend change (LoginPage / RequireAuth) is Phase 5. The API already returns 401 `Incorrect email or password`. |
| 4 | `/setup` requires admin login first | No public `POST /api/auth/register` is built. The first admin is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. |
| 5 | Data mode setting `live \| sample \| auto`, default `auto`, in `settings`, admin-only to change | API.md only lists `live \| sample`; `auto` is an addition. Endpoint comes in a later phase. Records carry `source` = `live` or `sample`. |
| 6 | Risk bands: 85+ high, 70-84 medium, below 70 low | `app/services/bands.py`. |
| 7 | Audit log and evaluation endpoints are in scope | Audit writer + `GET /api/audit` (+ `export.csv`) in Phase 1; evaluation later. |
| 8 | One brand per organisation for now | `brands` is still a table; `POST /api/brands` returns 409 if one exists. |
| 9 | Evidence = SHA-256 of the saved snapshot; screenshots off by default | Stored in `detections.evidence` JSON. |

## Additional Phase 1 choices (flagged for review)

- Logo formats are PNG, JPEG, WebP (API.md said PNG/SVG). SVG is refused on purpose: it can carry script. Min 256 px both sides, aspect 0.8 to 1.25, max 2 MB, re-encoded on save (strips metadata and appended bytes).
- Handle rule is 3 to 30 of letters, digits, dot, underscore (stricter than API.md examples): LinkedIn company slugs with hyphens or slashes (`company/acme-bank`) are rejected for now.
- Account `handle` is stored bare and returned in display form (`@` prefix for instagram, x, youtube) as in API.md; `url` has no scheme as in API.md.
- A failed reachability check never blocks adding an account: it is saved with `status: "unreachable"` and a `warning` text.
- Refresh tokens are tracked server-side (table `refresh_tokens`), rotated on use; re-using a rotated token revokes all of that user's refresh tokens.
- Login is rate limited in memory (5 failures per email+IP per 15 minutes -> 429). Single process only until Redis arrives.
- Passwords are hashed with bcrypt (72-byte limit enforced at the schema).
