# BrandShield: Project Description and Test Access & Evaluation Guide

> **For judges and evaluators.** Everything you need to understand the project, sign in, and test every feature in about 20 minutes.
> Items in `<ANGLE BRACKETS>` are filled in by the team before submission.

---

## 1. Project description

**BrandShield is a Digital Risk Protection platform.** It finds people and apps that pretend to be a brand: fake social-media profiles,
fake mobile apps and look-alike websites, and it shows the evidence so a person can decide what to do.

### The problem
Scammers copy a brand's name, logo and bio to trick customers: a fake "Acme Bank Support" account asking for KYC details, a cloned
banking app, a look-alike domain. Brands find these late, by hand, and rarely have evidence ready for a takedown request.

### What BrandShield does
1. **You describe your brand once:** name, aliases, keywords, domains, logo, and the handles and apps that are genuinely yours.
2. **It searches public sources** (web search, app stores) for suspects, and compares each one with your brand: name look-alikes,
   look-alike domains, logo similarity (AI vision model), and scam wording in bios.
3. **Every suspect gets a score with the reasons behind every point.** "Name looks like your brand (+31), logo is a copy (+24),
   bio asks for KYC (+22)". Nothing is a black box.
4. **A person reviews every detection** (confirm, keep reviewing, dismiss, mark as official) and approves every report.
   **Nothing is ever sent or taken down automatically.**
5. **Your own official assets are never flagged.** They are excluded by exact handle, URL or app id *before* scoring, never by
   name alone (an impersonator can use your exact name).

### What makes it different
| | |
|---|---|
| **Explainable scoring** | Per-signal points and a plain-language note for every detection; signals are marked present, clean or *unavailable* (a missing signal is never read as "clean"). |
| **Does not over-flag** | "Acme Bakery", "Acme Hotels" and "Acme Weather" are *not* flagged for "Acme Bank". Hard negatives are part of the test set. |
| **Honest about its data** | Sample data is labelled "Sample data" everywhere; a failed source never blocks a scan, it is shown as unavailable with its last good result and age. |
| **Human in the loop** | Review actions, resolutions and report approval are manual and audit-logged. |
| **Brand Studio built in** | Create a brand with AI tools (naming, logo, palette, copy), then protect it in one click. One login for both. |
| **Safe by design** | Fetching anything from search results is SSRF-safe; candidate text is treated as untrusted (prompt-injection resistant); per-account data separation; secrets stay server-side. |

### The six pillars of detection
- **Name and handle look-alikes:** homoglyphs (`rn` for `m`, Cyrillic letters), digit swaps (`acm3bank`), separators and spacing
  (`A C M E Bank`), transposed or missing letters, added scam words (`support`, `official`, `helpline`), with typo/combo/fuzzy labels.
- **Domain look-alikes:** public-suffix-aware registrable-domain comparison, punycode/IDN homographs, brand-in-subdomain tricks
  (`brand.com.verify-account.example`), TLD swaps. Google Safe Browsing reputation when a key is configured.
- **Logo and app-icon similarity:** a CLIP vision model (AI similarity) plus perceptual-hash fingerprints.
- **Bio and description analysis:** scam-intent signals (KYC lures, fees, "DM us", cashback, urgency) and optional Gemini analysis.
- **Account and app signals:** account age, activity, publisher mismatch, store signals.
- **Official-asset exclusion and a false-positive guard list.**

### Screens
Overview (dashboard) · Brand Registry · Social Threats · App Threats · Web Threats (domain lab) · Investigations · Look-alike Lab
(name tester, test cases, logo comparison) · Source Health · Reports (CSV and printable HTML) · Model Evaluation · Settings ·
**Brand Studio** (naming, logo designer, palette, content, audit, sentiment, assistant, "Protect in BrandShield").

### Technology
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (Supabase) / SQLite, JWT auth, RQ worker (optional).
- **Frontend:** React 19 + TypeScript + Vite (BrandShield); React + Tailwind (Brand Studio).
- **AI / ML:** CLIP ViT-B/32 image embeddings (ONNX, runs locally), RapidFuzz, tldextract, perceptual hashes, Groq / Gemini for Studio
  text and optional bio analysis, Hugging Face image route for logo generation.
- **Sources:** Tavily web search, Apple iTunes Search API, Google Play (optional package), SearXNG (optional), Google Safe Browsing.
- **Quality:** pytest, Vitest, Playwright, GitHub Actions CI, Docker, Vercel (multi-service) deployment files.

---

## 2. Test access

### Hosted version
| | |
|---|---|
| **App URL** | `<DEPLOYED URL, e.g. https://brandshield.vercel.app>` |
| **API health** | `<DEPLOYED URL>/health` (should show `status: ok`) |
| **Brand Studio** | `<DEPLOYED URL>/studio/` (same login, opened from the app) |
| **Source code** | https://github.com/NEXacxlerate/Brand-Shield |

### Credentials: use the demo account
On the sign-in page press **Use demo credentials** (it fills the form), then **Sign in**.

| | |
|---|---|
| Email | `<DEMO_EMAIL, default demo@brandshield.app>` |
| Password | `<DEMO_PASSWORD>` |
| Role | Analyst: can create a brand, scan, review detections, create and approve reports |

Notes for evaluators:
- The demo account is **shared**. Other evaluators may be using it, so the brand you create can be seen or changed by them.
  **To test in isolation, press "Create an account"** and register your own (any email, password of 10+ characters). Each account gets its
  own private brand and workspace.
- Administrator-only controls (global settings, data mode) are shown read-only for these accounts. This is intentional.
- The hosted deployment runs in **Sample data mode**: results come from a built-in generator that creates realistic look-alike
  profiles, apps and domains *for your brand's name*, all clearly labelled "Sample data". No real person or company is accused.
  Live mode (real web and app-store search) is supported and was verified, but is off for the public demo to protect API quotas.

### Run it yourself (optional, no cloud account needed)
Needs Python 3.11+ and Node 22+. With no API keys it runs entirely on sample data.
```powershell
# terminal 1: backend
cd backend
python -m venv .venv ; .\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env     # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD; optionally DEMO_EMAIL and DEMO_PASSWORD
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m uvicorn app.main:create_app --factory --port 8000

# terminal 2: BrandShield          # terminal 3: Brand Studio
cd frontend ; npm install ; npm run dev        cd studio ; npm install ; npm run dev
```
Open **http://localhost:5173**. (BrandShield forwards `/studio` to Brand Studio, so both share one origin and one login.)
Full details and Docker: `README.md`.

---

## 3. Evaluation guide: a 20-minute walk-through

Use **your own account** (Create an account) for a clean start, or the demo account if you prefer. "Expected" is what you should see.

### A. Sign-in and the brand flow (3 min)
1. Open the app, press **Use demo credentials**, **Sign in**. *Expected:* the **Protect Your Brand** page with two cards.
2. Press **Create a Brand**. *Expected:* **Brand Studio** opens already signed in (your name in the sidebar, "Back to BrandShield" link). No second login.
3. In Studio open **Protect in BrandShield**. Enter name `Zenith Pay`, industry `Payments`, a short description, then
   **Create brand & protect it in BrandShield**. *Expected:* "Brand registered in BrandShield" with buttons for Setup and the dashboard.
   (AI generation in Studio needs server API keys. If the badge says AI is unavailable, the form still works by typing details and uploading a logo.)
4. Press **Add official accounts & start protection**. *Expected:* the Setup wizard (3 steps). Add official handles, e.g. Instagram
   `zenithpay`, X `zenithpay`, and finish with **Start First Scan & Open Dashboard**.

### B. Detections and explainability (5 min)
5. **Overview:** *Expected:* a "Sample data" badge, KPI cards (total, social, apps, web), "Where we found them", "Needs review", and a "Why it was flagged" panel.
6. **Social Threats:** open the top detection. *Expected:* a score ring, **Risk band + severity (LOW to CRITICAL)**, an official-vs-suspect comparison
   and **"Why it scored"** with one line and one bar per signal, plus evidence with a SHA-256 hash.
7. Try the review actions: **Confirm**, **Keep reviewing**, **Dismiss**, and **Mark as official** on a different row. *Expected:* status changes at
   once and persists after a refresh; a marked-official asset moves to the allowlist and disappears from the list.
8. **App Threats** and **Web Threats:** *Expected:* fake apps with publisher-mismatch notes, and look-alike domains with severity chips.
9. **Investigations:** set a status and a resolution (e.g. *true positive*) with a note. *Expected:* it persists after a refresh.

### C. The look-alike labs (5 min)
10. **Look-alike Lab, name tester:** type each name and check the verdict (for brand "Zenith Pay"):

    | Type | Expected |
    |---|---|
    | `zenithpay_official` | **Flagged** (brand + scam word) |
    | `Zenith-Pay` | **Flagged** (separator) |
    | `zenithpаy` (with a Cyrillic `а`) | **Flagged** (homoglyph) |
    | `Zenith Bakery` | **Not flagged** (a different business) |
    | `Zenith Pay` | **Official** in the Lab (the Lab treats the exact brand name as the brand itself; real scans never exclude a candidate by name alone) |
    | `@zenithpay` | **Official**, because you registered that exact handle in step 4 |

    Press **Run test cases**: *Expected:* "N of M pass" using cases generated from *your* brand's name.
11. **Look-alike Lab, Compare a logo** (top of the page): upload a logo to compare with your official logo; then tick
    **Use a different reference logo** and upload two images of your choice. *Expected:* a similarity percentage and verdict
    (same / very similar / somewhat similar / different), side-by-side previews, and the CLIP "AI vision" bar plus fingerprint bars.
    A resized or cropped copy of the same logo scores high; an unrelated logo scores near 0. *It is a risk signal, not proof.*
12. **Web Threats lab** (register `zenithpay.com` as an official domain in Brand Registry first): type these. *The tester never opens the URL.*

    | Type | Expected |
    |---|---|
    | `zenithpay.com.verify-account.example` | **Look-alike** (brand name hidden in a subdomain of another site) |
    | `zenithpay-support.com` | **Look-alike** (added word) |
    | `zenithpay.com` | **Official** (your registered domain) |
    | `zenithbakery.com` | **No look-alike signal** (unrelated) |

### D. Operations and evidence (3 min)
13. **Reports:** choose filters, **Generate report** (CSV and Printable HTML), download, **Approve**. *Expected:* a Draft that becomes Approved; the preview shows
    handles for social rows and app names for apps. *Nothing is sent anywhere.*
14. **Source Health:** *Expected:* each source's status, last sync and cached age. Sources that need a key or package that is not
    installed show an honest "unavailable" reason, and scans still finish.
15. **Model Evaluation:** *Expected:* precision, recall, F1, a confusion matrix and false-positive rate per technique, clearly labelled
    **synthetic** (the numbers are optimistic and are not a claim about real-world accuracy).
16. **Settings:** *Expected:* sensitivity preview, schedule and impersonation words; save (administrators only; analysts see it read-only).

### E. Accounts and isolation (2 min)
17. Sign out, press **Create an account**, register a second account. *Expected:* it lands on Protect Your Brand with **no brand**, and cannot see the first
    account's brand, detections or reports anywhere.
18. Open `/studio/` while signed out. *Expected:* you are sent to the sign-in page and returned to Brand Studio afterwards.

---

## 4. Evidence the product works

**Automated tests (last full run):** backend **1227** · BrandShield frontend **130** · Brand Studio **38** · browser end-to-end **24**
(including the full register → Brand Studio → protected-in-BrandShield → second-account-cannot-see-it flow). CI runs on every push (GitHub Actions).
`<UPDATE: CI status at submission time>`

**Verified against real services:** Tavily web search and Apple App Store search (real results, credit budget guard), Google Safe Browsing (a
known test URL flagged as malware), Gemini and Groq (real calls), SSRF-safe fetch of real app icons, CLIP weights on real logos.

**Detection quality (synthetic benchmark):** the 10 required name cases pass, including `acrnebank`, `acm3bank`, `Acme Bank Support`,
`A C M E Bank` (flagged) and `Acme Bakery/Hotels/Weather` (not flagged). The Model Evaluation page shows the full tables.

---

## 5. Known limitations (stated honestly)
- **Public demo uses sample data.** Live search finds what web search and app stores expose: in a real-brand test it found related apps and Facebook
  pages but **no** Instagram, X, LinkedIn or Telegram profiles, because those platforms do not expose profiles to search APIs. A quiet live
  result is not proof of safety. No platform is monitored automatically beyond what the configured sources return.
- **Logo similarity is a risk signal.** A different logo with a very similar layout can still read as "somewhat similar".
- **AI image generation** in Brand Studio needs credits on the provider account; typing details and uploading a logo always work.
- **Self-service sign-up** has no email verification, and its rate limits are per server instance.
- **Global settings** (data mode, source health, credit counters) are shared across accounts by design for this version.
- **No takedown submission:** reports are prepared for a human to send. Notification settings are stored but nothing is delivered.
- Short brand names (under 5 letters) get no typo matching, to avoid false alarms.

## 6. Where to read more
`README.md` (run and deploy) · `docs/USER_GUIDE.md` (every page, with sample inputs) · `docs/FEATURE_STATUS.md` (what was verified on real data) ·
`docs/API.md` · `docs/DATABASE_SCHEMA.md` · `docs/SECURITY.md` · `docs/DECISIONS.md` · `docs/STUDIO.md` · `docs/DEPLOY_VERCEL.md`.

**Team / contact:** `<NAMES AND CONTACT>`
