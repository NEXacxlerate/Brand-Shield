"""Manual check of the Brand Studio AI keys (reads backend/.env; prints STATUSES only, never keys, prompts or answers).

Run from backend/:   python -m scripts.studio_ai_check            (model list checks + one tiny chat call + one image call)
                     python -m scripts.studio_ai_check --no-image  (skip the image call: it spends a little Pollinations pollen)
                     python -m scripts.studio_ai_check --models-only

What it does, in order:
  1. says which keys are present (names only);
  2. Groq   GET /openai/v1/models           -> is STUDIO_GROQ_MODEL listed?            (needs GROQ_API_KEY)
  3. Gemini GET /v1beta/models/<model>      -> does GEMINI_MODEL exist?               (needs GEMINI_API_KEY)
  4. one 1-sentence chat call through the same code the API uses (Groq first, Gemini fallback)
  5. one small image call through Pollinations (POLLINATIONS_API_KEY, STUDIO_IMAGE_MODEL); --save-image PATH keeps the PNG
Never part of the test suite (the suite blocks the network).
"""

from __future__ import annotations

import argparse
import sys
import time

import httpx

from app.config.config import Settings
from app.services.studio_ai import GEMINI_URL, StudioAI, StudioAIError


def line(name: str, status: str, extra: str = "") -> None:
    print(f"{name:<34} {status}" + (f"   {extra}" if extra else ""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-image", action="store_true")
    ap.add_argument("--models-only", action="store_true")
    ap.add_argument("--save-image", metavar="PATH")
    args = ap.parse_args()
    s = Settings()  # type: ignore[call-arg]
    ai = StudioAI(s)
    bad = 0

    print("keys present (names only)")
    line("  GROQ_API_KEY", "set" if ai.groq_key else "MISSING (chat falls back to Gemini)")
    line("  GEMINI_API_KEY", "set" if ai.gemini_key else "MISSING")
    line("  POLLINATIONS_API_KEY", "set" if ai.image_key else "MISSING (image generation off)")
    print(f"models: groq={s.studio_groq_model}  gemini={s.gemini_model}  image={s.studio_image_model}")
    print()

    if ai.groq_key:
        try:
            r = httpx.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {ai.groq_key}"}, timeout=20)
            ids = {m.get("id") for m in r.json().get("data", [])} if r.status_code == 200 else set()
            listed = s.studio_groq_model in ids
            line("groq model list", f"HTTP {r.status_code}", f"{s.studio_groq_model} listed: {listed}")
            bad += r.status_code != 200 or not listed
        except Exception as exc:  # noqa: BLE001
            line("groq model list", f"ERROR {type(exc).__name__}")
            bad += 1
    if ai.gemini_key:
        try:
            r = httpx.get(GEMINI_URL.format(model=s.gemini_model).replace(":generateContent", ""), headers={"x-goog-api-key": ai.gemini_key}, timeout=20)
            line("gemini model", f"HTTP {r.status_code}", f"{s.gemini_model} exists: {r.status_code == 200}")
            bad += r.status_code != 200
        except Exception as exc:  # noqa: BLE001
            line("gemini model", f"ERROR {type(exc).__name__}")
            bad += 1
    if args.models_only:
        return 1 if bad else 0

    t0 = time.monotonic()
    try:
        out = ai.chat([{"role": "user", "content": "Reply with the single word: ready"}], json_mode=False, temperature=0, max_tokens=64)
        line("chat call", "OK", f"provider={out['provider']} model={out['model']} chars={len(out['text'])} {time.monotonic() - t0:.1f}s")
    except StudioAIError as exc:
        line("chat call", f"FAILED (maps to HTTP {exc.status_code})", exc.message)
        bad += 1

    if not args.no_image:
        t0 = time.monotonic()
        try:
            png = ai.image("a simple flat blue circle on a white background", 512, 512)
            line("image call", "OK", f"model={s.studio_image_model} png bytes={len(png)} {time.monotonic() - t0:.1f}s")
            if args.save_image:
                with open(args.save_image, "wb") as fh:
                    fh.write(png)
        except StudioAIError as exc:
            line("image call", f"FAILED (maps to HTTP {exc.status_code})", exc.message)
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
