"""Logo comparison tester (Look-alike Lab). Pure and in-memory: nothing is stored, no detection or score is created.

Uploads are validated like every other image upload (type from the magic bytes via Pillow, size cap, dimension and pixel caps,
decompression-bomb guard); the filename is never read. With the optional CLIP engine the similarity is the calibrated CLIP score
(see engine/logo_similarity.py); otherwise it comes from the SAME engine scans use
(`scan_pipeline._image_impl`, so the IMAGE_SIMILARITY_BACKEND setting applies)
on the same 0-100 scale. Verdict bands reuse the scorer's thresholds, none are new:
    >= 90                    same_logo         (scoring.image_points reaches its maximum at 90)
    >= LIKELY_COPY_MIN (80)  very_similar      (copy, resize, recolour, JPEG recompress measured >= 80)
    >= SIMILAR_MIN (55)      somewhat_similar  (slight crops / light edits; worth a human look; scores points in scans)
    below 55                 different         (no points in scans)
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError

from app.config.config import Settings
from app.core.engine import logo_similarity as ls
from app.core.engine.image_hashes import compare_hashes, compute_hashes
from app.core.engine.logo_similarity import LIKELY_COPY_MIN, SIMILAR_MIN, NotAvailable, load_image
from app.core.pipeline import evidence
from app.core.pipeline.logo import LogoError, sniff_format
from app.core.pipeline.scan_pipeline import _image_impl
from app.models import Brand

SAME_MIN = 90.0
MIN_SIDE = 16
MAX_SIDE = 6000
MAX_PIXELS = 25_000_000
SMALL_SIDE = 64
NOTE = (
    "Hash similarity is a risk signal, not proof of reuse. "
    "A high number means the pictures look alike; it does not show that one was copied from the other."
)
CLIP_NOTE = (
    "The main number is an AI visual-similarity score (CLIP) plus fingerprint checks (pHash, dHash, wHash, colour). "
    "It is still a risk signal, not proof of reuse: a high number means the pictures look alike, not that one was copied from the other."
)
FIRST_USE_NOTE = "First comparison downloads/loads the AI model, so it can take up to half a minute."
SAMPLE_NOTE = (
    "The app is showing sample data. This comparison uses only the logos you give it, "
    "but sample-mode results elsewhere are not real findings."
)
NO_LOGO = "Add an official logo in Brand Registry or upload a reference logo."


def verdict_for(sim: float) -> str:
    if sim >= SAME_MIN:
        return "same_logo"
    if sim >= LIKELY_COPY_MIN:
        return "very_similar"
    if sim >= SIMILAR_MIN:
        return "somewhat_similar"
    return "different"


def read_image(data: bytes, max_bytes: int, what: str) -> Image.Image:
    """Validate and decode an uploaded logo in memory. Raises LogoError(413|415|422)."""
    if len(data) > max_bytes:
        raise LogoError(413, f"The {what} is larger than {max_bytes // (1024 * 1024) or 1} MB")
    if not data or sniff_format(data[:16]) is None:
        raise LogoError(415, f"The {what} must be a PNG, JPEG or WebP picture (SVG and other types are refused)")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        img = load_image(data)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise LogoError(415, f"The {what} is not a valid PNG, JPEG or WebP picture") from exc
    w, h = img.size
    if w < MIN_SIDE or h < MIN_SIDE:
        raise LogoError(422, f"The {what} must be at least {MIN_SIDE} x {MIN_SIDE} pixels")
    if w > MAX_SIDE or h > MAX_SIDE:
        raise LogoError(422, f"The {what} must be at most {MAX_SIDE} x {MAX_SIDE} pixels")
    return img


def official_logos(settings: Settings, brand: Brand) -> list[tuple[str, str, Image.Image]]:
    """[(id, label, image)] for the primary logo ('primary') and every extra one (its id), skipping missing or broken files."""
    rows = [("primary", "Primary logo", brand.logo_path), *[(str(lg.id), lg.label or f"Logo {lg.id}", lg.path) for lg in brand.logos]]
    out = []
    for lid, label, rel in rows:
        path = evidence.safe_path(settings.data_dir, rel)
        if path is None:
            continue
        try:
            out.append((lid, label, load_image(path.read_bytes())))
        except Exception:  # noqa: BLE001 - a broken logo file just means "unavailable"
            continue
    return out


def _flat(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


def _warnings(img: Image.Image, label: str) -> list[str]:
    out = []
    if min(img.size) < SMALL_SIDE:
        out.append(f"The {label} is very small ({img.size[0]} x {img.size[1]} px); "
                   "a larger picture gives a more reliable number.")
    if ImageStat.Stat(_flat(img).convert("L")).stddev[0] < 8:
        out.append(f"The {label} is almost a single colour, so there is little shape to compare.")
    return out


def models_dir(settings: Settings):
    return settings.data_dir / "models"


def clip_status(settings: Settings) -> dict:
    """Cheap status for the page (no model load, no network): is the CLIP engine usable, and are the weights already on disk?"""
    base = {"model": ls.CLIP_MODEL, "mode": settings.logo_compare_clip}
    if settings.logo_compare_clip == "off":
        return {**base, "available": False, "reason": "off", "cached": False, "hint": "Switched off with LOGO_COMPARE_CLIP=off."}
    if not ls.fastembed_installed():
        return {**base, "available": False, "reason": "not_installed", "cached": False, "hint": ls.CLIP_INSTALL_HINT}
    cached = ls.model_cached(models_dir(settings))
    return {**base, "available": True, "reason": None, "cached": cached, "loaded": ls.clip_loaded(),
            "hint": None if cached else "Weights (about 336 MB) are downloaded on the first comparison."}


def _get_embedder(settings: Settings):
    """(embedder | None, unavailable-info | None, first_use)."""
    if settings.logo_compare_clip == "off":
        return None, {"available": False, "reason": "off", "hint": "Switched off with LOGO_COMPARE_CLIP=off."}, False
    first = not ls.clip_loaded()
    try:
        return ls.get_clip_embedder(models_dir(settings)), None, first
    except NotAvailable as exc:
        return None, {"available": False, "reason": exc.reason, "hint": ls.CLIP_INSTALL_HINT}, False


def compare(settings: Settings, candidate: Image.Image, refs: list[tuple[str, str, Image.Image]], manual: bool, sample: bool) -> dict:
    impl, algorithm = _image_impl(settings)
    embedder, unavailable, first_use = _get_embedder(settings)
    cand_vec = None
    if embedder is not None:
        try:
            cand_vec = list(embedder(candidate))
        except NotAvailable as exc:
            embedder, unavailable = None, {"available": False, "reason": exc.reason, "hint": ls.CLIP_INSTALL_HINT}
    ch = compute_hashes(candidate)
    rows = []
    for lid, label, img in refs:
        hash_sim = round(float(impl.similarity(candidate, img)), 1)
        parts = compare_hashes(ch, compute_hashes(img))
        row = {"id": lid, "label": label, "similarity": hash_sim, "hash_similarity": hash_sim, "clip": None,
               "width": img.size[0], "height": img.size[1],
               "algorithms": dict(parts)}
        if cand_vec is not None:
            cos = ls.cosine(cand_vec, list(embedder(img)))
            score = ls.clip_to_score(cos)
            row["clip"] = {"cosine": round(cos, 4), "score": score}
            row["similarity"] = ls.combine_clip_hash(score, hash_sim)
        row["verdict"] = verdict_for(row["similarity"])
        rows.append(row)
    best = max(rows, key=lambda r: r["similarity"])
    best_img = next(img for lid, _, img in refs if lid == best["id"])
    warnings = _warnings(candidate, "candidate logo")
    warnings += _warnings(best_img, "reference logo" if manual else f"official logo \"{best['label']}\"")
    inverted = cand_vec is None and best["similarity"] < SIMILAR_MIN
    if inverted and impl.similarity(ImageOps.invert(_flat(candidate)), best_img) >= SIMILAR_MIN:
        warnings.append(
            "This logo looks like a colour-inverted version of the reference. "
            "Inverted logos score low with these hashes, so check it by eye."
        )
    if cand_vec is not None:
        clip = {"available": True, "cosine": best["clip"]["cosine"], "score": best["clip"]["score"], "model": ls.CLIP_MODEL}
        if first_use:
            warnings.append(FIRST_USE_NOTE)
    else:
        clip = {"available": False, "model": ls.CLIP_MODEL, **(unavailable or {})}
    return {
        "similarity": best["similarity"], "verdict": best["verdict"], "algorithm": algorithm, "mode": "manual" if manual else "official",
        "method": "clip+hash" if cand_vec is not None else "hash", "clip": clip, "hash_similarity": best["hash_similarity"],
        "best": {"id": best["id"], "label": best["label"]}, "algorithms": best["algorithms"], "results": rows,
        "candidate": {"width": candidate.size[0], "height": candidate.size[1]},
        "thresholds": {"same_logo": SAME_MIN, "very_similar": LIKELY_COPY_MIN, "somewhat_similar": SIMILAR_MIN},
        "explanation": CLIP_NOTE if cand_vec is not None else NOTE, "warnings": warnings,
        "is_sample": sample, "sample_note": SAMPLE_NOTE if sample else None,
    }
