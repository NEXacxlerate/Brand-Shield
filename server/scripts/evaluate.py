"""Run the name matcher over synthetic cases and print precision / recall / F1 per technique.

Usage (from server/):  .venv/Scripts/python -m scripts.evaluate [--json] [--seed 7] [--per-technique 25]

Definitions (flagged == predicted positive; review/safe/brand_name == predicted negative):
* Per technique: positives = generated cases using that technique; negatives = ALL hard negatives and
  unrelated names. recall = TP / positives; precision = TP / (TP + flagged negatives).
* label_ok = of the true positives, the share whose reported techniques include the generated technique
  (for `mixed`: the matcher reported two or more techniques).
* Overall: every positive and every negative.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict

from app.engine.name_match import TECHNIQUES, NameMatcher
from app.engine.synthetic import MIXED, generate_cases

BRANDS = ["Acme Bank", "Zenith Pay", "Orbit Telecom", "Zoho", "Northern Lights Mutual Insurance"]


def _prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(p, 3), "recall": round(r, 3), "f1": round(f1, 3)}


def evaluate_brand(brand: str, seed: int, per_technique: int) -> dict:
    others = [b for b in BRANDS if b != brand]
    cases = generate_cases(brand, seed=seed, per_technique=per_technique, other_brands=others)
    matcher = NameMatcher(brand)
    tp = defaultdict(int)
    fn = defaultdict(int)
    label_ok = defaultdict(int)
    fp_neg: list[str] = []
    misses: dict[str, list[str]] = defaultdict(list)
    n_neg = 0
    for c in cases:
        r = matcher.match(c.text)
        if c.expect_flagged:
            if r.verdict == "flagged":
                tp[c.technique] += 1
                if (len(r.techniques) >= 2) if c.technique == MIXED else (c.technique in r.techniques):
                    label_ok[c.technique] += 1
            else:
                fn[c.technique] += 1
                misses[c.technique].append(f"{c.text!r} -> {r.verdict}")
        else:
            n_neg += 1
            if r.verdict == "flagged":
                fp_neg.append(c.text)
    rows = {}
    for t in (*TECHNIQUES, MIXED):
        row = _prf(tp[t], len(fp_neg), fn[t])
        row["n_pos"] = tp[t] + fn[t]
        row["label_ok"] = round(label_ok[t] / tp[t], 3) if tp[t] else 0.0
        rows[t] = row
    overall = _prf(sum(tp.values()), len(fp_neg), sum(fn.values()))
    overall["n_pos"] = sum(tp.values()) + sum(fn.values())
    overall["n_neg"] = n_neg
    overall["label_ok"] = round(sum(label_ok.values()) / sum(tp.values()), 3) if tp else 0.0
    return {"brand": brand, "techniques": rows, "overall": overall, "false_positives": fp_neg, "misses": {k: v[:5] for k, v in misses.items()}}


def merge(results: list[dict]) -> dict:
    agg: dict[str, dict] = {}
    for t in (*TECHNIQUES, MIXED, "overall"):
        tp = fp = fn = lab = 0
        for r in results:
            row = r["overall"] if t == "overall" else r["techniques"][t]
            tp += row["tp"]
            fp += row["fp"]
            fn += row["fn"]
            lab += round(row.get("label_ok", 0) * row["tp"])
        agg[t] = {**_prf(tp, fp, fn), "n_pos": tp + fn, "label_ok": round(lab / tp, 3) if tp else 0.0}
    return agg


def format_table(title: str, rows: dict) -> str:
    lines = [title, f"{'technique':<26}{'n_pos':>6}{'prec':>8}{'recall':>8}{'F1':>8}{'label_ok':>10}"]
    for name, r in rows.items():
        lines.append(f"{name:<26}{r['n_pos']:>6}{r['precision']:>8.3f}{r['recall']:>8.3f}{r['f1']:>8.3f}{r.get('label_ok', 0):>10.3f}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="print JSON instead of tables")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--per-technique", type=int, default=25)
    ap.add_argument("--brand", action="append", help="brand name (repeatable); default is the built-in set")
    args = ap.parse_args(argv)
    brands = args.brand or BRANDS
    results = [evaluate_brand(b, args.seed, args.per_technique) for b in brands]
    combined = merge(results)
    if args.json:
        print(json.dumps({"seed": args.seed, "brands": results, "combined": combined}, indent=2, ensure_ascii=False))
        return 0
    for r in results:
        print(format_table(f"Brand: {r['brand']}  (negatives: {r['overall']['n_neg']}, false positives: {len(r['false_positives'])})", {**r["techniques"], "OVERALL": r["overall"]}))
        for t, ex in r["misses"].items():
            print(f"  misses [{t}]: " + "; ".join(ex))
        if r["false_positives"]:
            print("  false positives: " + "; ".join(map(repr, r["false_positives"][:8])))
        print()
    print(format_table(f"COMBINED over {len(brands)} brands (seed {args.seed})", {**{k: v for k, v in combined.items() if k != 'overall'}, "OVERALL": combined["overall"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
