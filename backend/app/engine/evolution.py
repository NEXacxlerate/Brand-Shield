"""Growth series, stage counts and the what-if simulator. Everything forward-looking is an estimate and says so."""
import math

from .analysis import DAY, STAGES


def stage_counts(entities):
    """[{name, count}] for the six stages (entities are dicts with a 'stage' 1..6)."""
    counts = [0] * 6
    for e in entities:
        counts[e["stage"] - 1] += 1
    return [{"name": n, "count": c} for n, c in zip(STAGES, counts)]


def _cumulative(members, now, offset_days):
    """Entities already seen `offset_days` days from now (negative = past)."""
    cutoff = now + offset_days * DAY
    return sum(1 for m in members if m["first_seen"] <= cutoff)


def growth(members, now, past_days=12, horizon=7):
    """Observed cumulative size per day, plus a 7-day forecast with a band.

    forecast(d) = size_now + pace * d / 7, where pace = entities added in the last 7 days.
    band: the same with the pace scaled by 0.6 and 1.4. It is an estimate, not a model.
    """
    live = [m for m in members if m["status"] != "dismissed"]
    now_size = len(live)
    pace = sum(1 for m in live if (now - m["first_seen"]) / DAY <= 7)
    days = list(range(-past_days, horizon + 1))
    observed, fcst, band = [], [], []
    for d in days:
        observed.append(_cumulative(live, now, d) if d <= 0 else None)
        if d < 0:
            fcst.append(None)
            band.append(None)
        else:
            mid = now_size + pace * d / 7
            fcst.append(round(mid, 1))
            band.append([round(now_size + 0.6 * pace * d / 7, 1), round(now_size + 1.4 * pace * d / 7, 1)])
    labels = [f"{d}d" if d < 0 else "today" if d == 0 else f"+{d}d" for d in days]
    return {"days": days, "labels": labels, "observed": observed, "forecast": fcst, "band": band,
            "is_estimate": True, "basis": f"Assumes the last 7 days' pace ({pace} new entities) repeats; band is the pace x0.6 to x1.4."}


def simulate(members, now, horizon_days, assumption, assumed_drop_pct, past_days=14):
    """What-if projection of campaign size.

    baseline: entities added per week = the last-7-day pace, scaled each following week by x1.5 (accelerate) or x0.5 (slow).
    acted:    baseline additions x (1 - assumed_drop_pct/100). The drop percentage is the USER'S ASSUMPTION, not a measurement.
    """
    live = [m for m in members if m["status"] != "dismissed"]
    now_size = len(live)
    pace = sum(1 for m in live if (now - m["first_seen"]) / DAY <= 7)
    mult = {"repeat": 1.0, "accelerate": 1.5, "slow": 0.5}[assumption]
    observed = [_cumulative(live, now, -d) for d in range(past_days, -1, -1)]
    baseline, acted = [float(now_size)], [float(now_size)]
    added = 0.0
    for day in range(1, horizon_days + 1):
        week = (day - 1) // 7
        added += pace / 7 * (mult ** week)
        baseline.append(round(now_size + added, 2))
        acted.append(round(now_size + added * (1 - assumed_drop_pct / 100), 2))
    return {
        "observed": observed, "baseline": baseline, "acted": acted, "now": now_size,
        "no_action": round(baseline[-1], 1), "if_act": round(acted[-1], 1), "pace_per_week": pace,
        "is_estimate": True,
        "method": (f"Baseline = the last-7-day pace ({pace} new entities/week)"
                   + (" x1.5 each following week" if assumption == "accelerate" else " x0.5 each following week" if assumption == "slow" else " repeated")
                   + f". 'If you act' = baseline additions x (1 - {assumed_drop_pct:g}%)."),
        "assumption_note": (f"The {assumed_drop_pct:g}% drop is an assumption you entered. It is not measured and not a prediction of what "
                            "any takedown will achieve."),
    }
