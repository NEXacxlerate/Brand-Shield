"""Logo / icon similarity from perceptual hashes (pHash + dHash), implemented over Pillow.

Score 0-100. Hash similarity is `1 - hamming/64`; two unrelated images sit near 0.5 (random bits), so the
raw similarity is rescaled with `(sim - 0.5) / 0.5` and clamped at 0. The final score is a weighted mean
of the pHash and dHash scores (pHash is robust to resize/recolor/JPEG; dHash catches gradient structure).

Thresholds (see `docs/DECISIONS.md` and tests/engine/test_logo_similarity.py):
    LIKELY_COPY_MIN  = 80  -> copy, resize, grayscale, recolor, JPEG recompress (q30) all measured >= 80
    SIMILAR_MIN      = 55  -> slight crops / light edits (3% crop measured 69-80+); worth a human look
    below SIMILAR_MIN        -> unrelated (300 random unrelated pairs: median 6, max 39), no points
Known gaps: colour-inverted logos score ~0 and larger crops (>=10%) fall below SIMILAR_MIN. The numbers come
from synthetic shape logos, not real brand logos: re-tune on labelled data. A CLIP-style embedder can replace the
hashes through the `ImageSimilarity` protocol (cosine similarity scaled 0-100).
"""

from __future__ import annotations

import importlib.util
import logging
import math
import os
import threading
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from PIL import Image, ImageOps

log = logging.getLogger(__name__)

LIKELY_COPY_MIN = 80.0
SIMILAR_MIN = 55.0

_HASH_BITS = 64
_DCT_SIZE = 32
_LOW = 8


class NotAvailable(RuntimeError):
    """An optional similarity backend (e.g. CLIP) is not installed or its weights are missing.

    `reason` is "not_installed" (package missing) or "model_unavailable" (package present, weights not loadable).
    """

    def __init__(self, message: str = "", reason: str = "not_installed") -> None:
        super().__init__(message)
        self.reason = reason


@runtime_checkable
class ImageSimilarity(Protocol):
    def similarity(self, a: Image.Image, b: Image.Image) -> float:
        """Return 0-100 (100 = identical)."""
        ...


def _to_gray(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        bg.alpha_composite(rgba)
        img = bg
    gray = img.convert("L")
    gray = ImageOps.autocontrast(gray)  # makes recolored / low-contrast copies comparable
    return gray.resize(size, Image.Resampling.LANCZOS)


def _dct_matrix(n: int) -> list[list[float]]:
    return [[math.cos(math.pi * (2 * x + 1) * u / (2 * n)) * (math.sqrt(1 / n) if u == 0 else math.sqrt(2 / n)) for x in range(n)] for u in range(n)]


_C = _dct_matrix(_DCT_SIZE)


def phash(img: Image.Image) -> int:
    """64-bit perceptual hash: 2-D DCT of a 32x32 grayscale image, low 8x8 block vs its median."""
    g = _to_gray(img, (_DCT_SIZE, _DCT_SIZE))
    px = list(g.getdata())
    rows = [px[r * _DCT_SIZE : (r + 1) * _DCT_SIZE] for r in range(_DCT_SIZE)]
    # only the first _LOW frequency rows/cols are needed: T = C[:LOW] * X * C[:LOW]^T
    cl = _C[:_LOW]
    tmp = [[sum(cl[u][k] * rows[k][x] for k in range(_DCT_SIZE)) for x in range(_DCT_SIZE)] for u in range(_LOW)]
    block = [[sum(tmp[u][x] * cl[v][x] for x in range(_DCT_SIZE)) for v in range(_LOW)] for u in range(_LOW)]
    flat = [block[u][v] for u in range(_LOW) for v in range(_LOW)]
    median = sorted(flat[1:])[(len(flat) - 1) // 2]  # median without the DC term
    bits = 0
    for i, val in enumerate(flat):
        if val > median:
            bits |= 1 << i
    return bits


def dhash(img: Image.Image) -> int:
    """64-bit difference hash: 9x8 grayscale, left pixel brighter than right neighbour."""
    g = _to_gray(img, (9, 8))
    px = list(g.getdata())
    bits = 0
    i = 0
    for r in range(8):
        for c in range(8):
            if px[r * 9 + c] > px[r * 9 + c + 1]:
                bits |= 1 << i
            i += 1
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def _hash_score(a: int, b: int) -> float:
    sim = 1 - hamming(a, b) / _HASH_BITS
    return max(0.0, (sim - 0.5) / 0.5) * 100


class HashSimilarity:
    """Default ImageSimilarity: weighted pHash + dHash."""

    def __init__(self, phash_weight: float = 0.6) -> None:
        self.wp = phash_weight

    def similarity(self, a: Image.Image, b: Image.Image) -> float:
        return round(self.wp * _hash_score(phash(a), phash(b)) + (1 - self.wp) * _hash_score(dhash(a), dhash(b)), 1)


def logo_similarity(a: Image.Image, b: Image.Image) -> float:
    return HashSimilarity().similarity(a, b)


def best_logo_similarity(candidate: Image.Image, official: Sequence[Image.Image], impl: ImageSimilarity | None = None) -> float:
    """Highest similarity of `candidate` against any official logo."""
    impl = impl or HashSimilarity()
    return max((impl.similarity(candidate, o) for o in official), default=0.0)


class ClipSimilarity:
    """CLIP-style embedding cosine similarity, scaled 0-100. Optional and lazily imported.

    Pass `embedder` (image -> vector) to use any backend (also how tests exercise it); without one it
    tries `open_clip` + `torch` and raises NotAvailable when they are not installed.
    """

    def __init__(self, embedder: Callable[[Image.Image], Sequence[float]] | None = None, model: str = "ViT-B-32", pretrained: str = "openai") -> None:
        if embedder is None:
            embedder = self._load_open_clip(model, pretrained)
        self._embed = embedder

    @staticmethod
    def _load_open_clip(model_name: str, pretrained: str) -> Callable[[Image.Image], Sequence[float]]:
        try:
            import open_clip  # type: ignore[import-not-found]
            import torch  # type: ignore[import-not-found]
        except ImportError as exc:
            raise NotAvailable("CLIP similarity needs the optional packages 'open_clip_torch' and 'torch'.") from exc
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)  # pragma: no cover
        model.eval()  # pragma: no cover

        def embed(img: Image.Image) -> Sequence[float]:  # pragma: no cover
            with torch.no_grad():
                vec = model.encode_image(preprocess(img.convert("RGB")).unsqueeze(0))[0]
            return vec.tolist()

        return embed  # pragma: no cover

    def similarity(self, a: Image.Image, b: Image.Image) -> float:
        va, vb = list(self._embed(a)), list(self._embed(b))
        na, nb = math.sqrt(sum(x * x for x in va)), math.sqrt(sum(x * x for x in vb))
        if na == 0 or nb == 0:
            return 0.0
        cos = sum(x * y for x, y in zip(va, vb, strict=True)) / (na * nb)
        return round(max(0.0, cos) * 100, 1)


def load_image(data: Any) -> Image.Image:
    """bytes or file-like -> RGBA/RGB PIL image (decoded fully)."""
    import io

    img = Image.open(io.BytesIO(data) if isinstance(data, bytes | bytearray) else data)
    img.load()
    return img

# ---- CLIP image embeddings through fastembed (ONNX, no torch). Optional: the hashes above remain the default.

CLIP_MODEL = "Qdrant/clip-ViT-B-32-vision"
CLIP_INSTALL_HINT = "pip install fastembed  (or: pip install -r requirements-extra.txt). The first use downloads about 336 MB of model weights."
# Cosine similarity of two CLIP image embeddings -> 0..100 so the EXISTING bands (55 / 80 / 90) apply unchanged. Measured on real logos:
# copies, resizes, crops up to 20%, mirrored, blurred, JPEG q30 and inverted logos all >= 0.92; unrelated logos 0.53-0.79; a similar-composition
# but different logo 0.82. See docs/DECISIONS.md.
CLIP_KNOTS: tuple[tuple[float, float], ...] = ((0.62, 0.0), (0.80, 55.0), (0.88, 80.0), (0.97, 90.0), (1.00, 100.0))
HASH_SAME_MIN = 90.0


def clip_to_score(cosine_value: float) -> float:
    """Piecewise-linear calibration of a CLIP cosine to a 0-100 score (clamped outside the first and last knot)."""
    if cosine_value <= CLIP_KNOTS[0][0]:
        return 0.0
    if cosine_value >= CLIP_KNOTS[-1][0]:
        return 100.0
    for (x0, y0), (x1, y1) in zip(CLIP_KNOTS, CLIP_KNOTS[1:], strict=False):
        if cosine_value <= x1:
            return round(y0 + (y1 - y0) * (cosine_value - x0) / (x1 - x0), 1)
    return 100.0  # pragma: no cover


def combine_clip_hash(clip_score: float, hash_score: float) -> float:
    """Final tester score. CLIP leads; a very high hash score only lifts an already-similar CLIP score
    (same shape recoloured stays high) and never rescues a low one."""
    if hash_score >= HASH_SAME_MIN and clip_score >= SIMILAR_MIN:
        return round(max(clip_score, hash_score), 1)
    return round(clip_score, 1)


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True)) / (na * nb)


def fastembed_installed() -> bool:
    return importlib.util.find_spec("fastembed") is not None


def model_cached(cache_dir: Path) -> bool:
    """True when the CLIP weights are already under cache_dir (an .onnx file inside the model folder)."""
    try:
        folder = Path(cache_dir) / ("models--" + CLIP_MODEL.replace("/", "--"))
        return folder.is_dir() and any(folder.rglob("*.onnx"))
    except OSError:
        return False


def _flatten_rgb(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


class FastembedClipEmbedder:
    """CLIP ViT-B/32 image encoder via fastembed. Lazy: nothing is imported or downloaded until the first embed()/load()."""

    def __init__(self, cache_dir: Path, model_name: str = CLIP_MODEL) -> None:
        self.cache_dir = Path(cache_dir)
        self.model_name = model_name
        self._model: Any = None
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
            try:
                from fastembed import ImageEmbedding  # type: ignore[import-not-found]
            except ImportError as exc:
                raise NotAvailable("The optional package 'fastembed' is not installed.", "not_installed") from exc
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                self._model = ImageEmbedding(model_name=self.model_name, cache_dir=str(self.cache_dir))
            except Exception as exc:  # noqa: BLE001 - offline, disk full, corrupt cache: all mean "weights unavailable"
                raise NotAvailable(f"The CLIP model could not be loaded ({type(exc).__name__}).", "model_unavailable") from exc

    def embed(self, img: Image.Image) -> list[float]:
        self.load()
        rgb = _flatten_rgb(img)
        with self._lock:
            vec = next(iter(self._model.embed([rgb])))
        v = [float(x) for x in vec]
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]

    __call__ = embed


_clip_lock = threading.Lock()
_clip_embedder: FastembedClipEmbedder | None = None
_clip_failure: tuple[float, NotAvailable] | None = None
_FAILURE_TTL = 60.0


def clip_loaded() -> bool:
    return _clip_embedder is not None and _clip_embedder.loaded


def get_clip_embedder(cache_dir: Path) -> FastembedClipEmbedder:
    """The process-wide embedder, loaded once behind a lock. Raises NotAvailable (failures are remembered for a minute so a
    missing package or an offline machine does not retry a download on every request)."""
    global _clip_embedder, _clip_failure
    with _clip_lock:
        if _clip_embedder is not None and _clip_embedder.loaded:
            return _clip_embedder
        if _clip_failure and time.monotonic() - _clip_failure[0] < _FAILURE_TTL:
            raise _clip_failure[1]
        if not fastembed_installed():
            _clip_failure = (time.monotonic(), NotAvailable("The optional package 'fastembed' is not installed.", "not_installed"))
            raise _clip_failure[1]
        emb = _clip_embedder or FastembedClipEmbedder(cache_dir)
        try:
            emb.load()
        except NotAvailable as exc:
            _clip_failure = (time.monotonic(), exc)
            raise
        _clip_embedder, _clip_failure = emb, None
        return emb


def reset_clip_for_tests() -> None:
    global _clip_embedder, _clip_failure
    with _clip_lock:
        _clip_embedder, _clip_failure = None, None


class CalibratedClipSimilarity:
    """ImageSimilarity over CLIP: the calibrated 0-100 score. Used by IMAGE_SIMILARITY_BACKEND=clip."""

    def __init__(self, embedder: Callable[[Image.Image], Sequence[float]]) -> None:
        self._embed = embedder

    def similarity(self, a: Image.Image, b: Image.Image) -> float:
        return clip_to_score(cosine(self._embed(a), self._embed(b)))
