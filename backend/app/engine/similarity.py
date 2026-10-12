"""Similarity primitives. Pure Python plus Pillow, no trained models.

Everything here returns numbers that can be explained to an analyst:
  * skeleton()        - collapses look-alike characters ("acrne" -> "acme")
  * dl_distance()     - Damerau-Levenshtein (optimal string alignment) edit distance
  * Corpus            - small TF-IDF / cosine implementation for scam-script text
  * dhash()/hamming() - perceptual hash for logo comparison
"""
import io
import math
import re
import unicodedata
from collections import Counter

# ---------------------------------------------------------------- names ---

CONFUSABLE = {  # common Cyrillic / Greek look-alikes -> latin
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
    "і": "i", "ѕ": "s", "ԁ": "d", "ɡ": "g", "ο": "o", "ν": "v", "ι": "i",
}
MULTI = [("rn", "m"), ("vv", "w"), ("cl", "d")]
SINGLE = {"0": "o", "1": "l", "i": "l", "|": "l", "5": "s", "$": "s",
          "3": "e", "4": "a", "@": "a", "7": "t", "8": "b"}

SCAM_WORDS = {
    "refund", "refunds", "support", "help", "helpdesk", "care", "customer", "kyc",
    "verify", "verification", "login", "secure", "offers", "offer", "giveaway",
    "reward", "rewards", "claim", "update", "official", "service", "desk",
    "center", "centre", "cashback", "loan", "wallet", "team", "now", "online",
}


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def skeleton(s: str) -> str:
    """Lowercase, fold look-alike characters and drop separators."""
    s = _strip_accents(s.lower())
    s = "".join(CONFUSABLE.get(c, c) for c in s)
    for a, b in MULTI:
        s = s.replace(a, b)
    s = "".join(SINGLE.get(c, c) for c in s)
    return re.sub(r"[^a-z0-9]", "", s)


def plain(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _strip_accents(s.lower()))


def name_tokens(s: str):
    return [t for t in re.split(r"[^a-z0-9]+", _strip_accents(s.lower())) if t]


def dl_distance(a: str, b: str) -> int:
    """Damerau-Levenshtein distance (adjacent transposition counts as one edit)."""
    la, lb = len(a), len(b)
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[la][lb]


def ramp(x: float, lo: float, hi: float) -> float:
    """Linear 0..1 ramp between lo and hi."""
    if hi == lo:
        return 1.0 if x >= hi else 0.0
    return max(0.0, min(1.0, (x - lo) / (hi - lo)))


def brand_terms(brand: dict):
    """(full-name skeletons, alias-only skeletons) for a brand."""
    full = {skeleton(brand["name"])}
    for d in brand.get("domains", []):
        full.add(skeleton(registrable_label(d)))
    full = {t for t in full if len(t) >= 4}
    alias = {skeleton(a) for a in brand.get("aliases", [])}
    alias = {t for t in alias if len(t) >= 4 and t not in full}
    return full, alias


def registrable_label(domain: str) -> str:
    parts = domain.lower().strip(".").split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "com", "org", "net", "gov", "ac"} and len(parts[-1]) == 2:
        return parts[-3]
    return parts[-2] if len(parts) >= 2 else parts[0]


def name_match(candidate: str, brand: dict) -> dict:
    """How strongly does `candidate` look like the brand's name?

    Returns {"strength": 0..1, "reason": str, "kind": str, "evidence": {...}}.
    """
    raw = candidate or ""
    cand_plain = plain(raw)
    cand_sk = skeleton(raw)
    full, alias = brand_terms(brand)
    keywords = [t for t in name_tokens(raw) if t in SCAM_WORDS]
    best = {"strength": 0.0, "reason": "No resemblance to the brand name", "kind": "none", "evidence": {}}
    if cand_plain in full or cand_plain in {plain(a) for a in brand.get("aliases", [])}:
        return best   # it IS the brand's own name; official assets are handled by the allow-list

    def consider(strength, reason, kind, ev):
        nonlocal best
        if strength > best["strength"]:
            best = {"strength": min(1.0, strength), "reason": reason, "kind": kind, "evidence": ev}

    for t in full:
        if cand_plain == t:
            continue  # exactly the brand - handled by allowlists
        if cand_sk == t:
            consider(1.0, f"'{raw}' reads as the brand once look-alike characters are normalised (-> '{t}')",
                     "homoglyph", {"normalised": cand_sk, "brand": t})
        elif t in cand_sk:
            bonus = 0.15 if keywords else 0.0
            why = f"Contains the brand name '{t}'" + (f" plus scam keyword '{keywords[0]}'" if keywords else "")
            if t not in cand_plain:
                why = f"Contains the brand name after normalising look-alikes, plus keyword '{keywords[0]}'" if keywords \
                    else "Contains the brand name after normalising look-alike characters"
            consider(0.85 + bonus, why, "contains", {"normalised": cand_sk, "keywords": keywords})
        elif len(cand_sk) >= 6:
            dist = dl_distance(cand_sk, t)
            if dist <= 2:
                consider(0.85 - 0.1 * (dist - 1), f"Within {dist} character edit(s) of the brand name ('{cand_sk}' vs '{t}')",
                         "edit", {"distance": dist})
    for t in alias:
        if t in cand_sk and cand_plain != t:
            consider(0.45 + (0.1 if keywords else 0.0), f"Contains only the brand's short name '{t}'" +
                     (f" plus keyword '{keywords[0]}'" if keywords else ""), "alias", {"keywords": keywords})
    return best


# ----------------------------------------------------------------- text ---

STOP = set("the a an and or to of in on for is are be you your we our us it at by with this that will from as".split())


def toks(text: str):
    return [w for w in re.findall(r"[a-z0-9₹']+", (text or "").lower()) if w not in STOP]


class Corpus:
    """Tiny TF-IDF. Fit on every text we know about, then compare with cosine()."""

    def __init__(self, docs):
        docs = [d or "" for d in docs]
        self.n = max(1, len(docs))
        df = Counter()
        for d in docs:
            df.update(set(toks(d)))
        self.idf = {w: math.log((1 + self.n) / (1 + c)) + 1 for w, c in df.items()}
        self._cache = {}

    def vec(self, text: str):
        if text in self._cache:
            return self._cache[text]
        tf = Counter(toks(text))
        default = math.log(1 + self.n) + 1
        v = {w: (1 + math.log(c)) * self.idf.get(w, default) for w, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        v = {w: x / norm for w, x in v.items()}
        self._cache[text] = v
        return v

    def cosine(self, a: str, b: str) -> float:
        va, vb = self.vec(a), self.vec(b)
        if len(va) > len(vb):
            va, vb = vb, va
        return sum(x * vb.get(w, 0.0) for w, x in va.items())


# ---------------------------------------------------------------- image ---

def dhash(src) -> int:
    """64-bit difference hash. `src` is a path or bytes. Survives resize and re-compression."""
    from PIL import Image
    im = Image.open(io.BytesIO(src) if isinstance(src, (bytes, bytearray)) else src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    resample = getattr(Image, "Resampling", Image).LANCZOS
    im = im.convert("L").resize((9, 8), resample)
    px = list(im.getdata())
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (1 if px[r * 9 + c] > px[r * 9 + c + 1] else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def logo_similarity(a: int, b: int) -> float:
    return 1.0 - hamming(a, b) / 64.0
