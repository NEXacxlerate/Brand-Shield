"""Round 2 service: adapter, risk scoring engine, investigation CRUD, alerts.

Read-only with respect to Round 1 data.  All writes target the r2_* tables.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.time import iso_z, utcnow
from app.models.detection import Detection
from app.models.r2 import (
    HIGH_RISK_THRESHOLD,
    R2_LEVELS,
    R2_STATUSES,
    R2Alert,
    R2Investigation,
    R2InvestigationEvent,
)
from app.models.user import User

# ---------------------------------------------------------------------------
# Risk scoring engine — configurable weights
# ---------------------------------------------------------------------------

WEIGHTS: dict[str, int] = {
    "name_similarity": 25,
    "logo_similarity": 30,
    "description_overlap": 15,
    "publisher_mismatch": 15,
    "other_signals": 15,
}


def compute_r2_score(detection: Detection) -> dict:
    """Compute a Round 2 risk score from evidence stored on a Round 1 detection.

    This is fully independent of the Round 1 scoring algorithm.
    """
    details = detection.details or {}
    reasons = detection.reasons or []

    # --- Name similarity (0–25 pts) ---
    name_match = details.get("name_match") or {}
    name_pct = float(name_match.get("pct") or 0)
    name_pts = min(WEIGHTS["name_similarity"], round(name_pct / 100 * WEIGHTS["name_similarity"]))

    # --- Logo / icon similarity (0–30 pts) ---
    logo = details.get("logo") or {}
    if logo.get("status") == "compared" and logo.get("similarity") is not None:
        logo_sim = float(logo["similarity"])
    else:
        logo_sim = 0.0
    logo_pts = min(WEIGHTS["logo_similarity"], round(logo_sim / 100 * WEIGHTS["logo_similarity"]))

    # --- Description / text overlap (0–15 pts) ---
    desc_keys = {"description", "text", "keyword", "bio", "overlap"}
    desc_pts_raw = sum(
        int(r.get("points", 0))
        for r in reasons
        if any(k in r.get("signal", "").lower() for k in desc_keys)
    )
    desc_pts = min(WEIGHTS["description_overlap"], desc_pts_raw)

    # --- Publisher mismatch (0–15 pts, binary) ---
    pub_keys = {"publisher", "mismatch", "developer"}
    pub_signals = [r for r in reasons if any(k in r.get("signal", "").lower() for k in pub_keys)]
    pub_mismatch = bool(pub_signals)
    pub_pts = WEIGHTS["publisher_mismatch"] if pub_mismatch else 0

    # --- Other signals (0–15 pts) ---
    accounted = {"name", "logo", "icon", "description", "text", "keyword", "bio", "overlap", "publisher", "mismatch", "developer"}
    other_signals = [r for r in reasons if not any(k in r.get("signal", "").lower() for k in accounted)]
    other_pts = min(WEIGHTS["other_signals"], sum(int(r.get("points", 0)) for r in other_signals))

    total = max(0, min(100, name_pts + logo_pts + desc_pts + pub_pts + other_pts))

    if total >= 80:
        level = "CRITICAL"
    elif total >= 60:
        level = "HIGH"
    elif total >= 40:
        level = "MEDIUM"
    else:
        level = "LOW"

    # --- Natural-language explanation ---
    phrases: list[str] = []
    if name_pts >= 18:
        phrases.append(f"name is {round(name_pct)}% similar to the brand")
    if logo_pts >= 20:
        phrases.append(f"logo is {round(logo_sim)}% similar to the brand logo")
    if desc_pts >= 8:
        phrases.append("description overlaps significantly with the brand")
    if pub_mismatch:
        phrases.append("published by a different entity than the legitimate brand")
    if other_pts >= 5:
        phrases.append(f"{len(other_signals)} additional impersonation signal{'s' if len(other_signals) != 1 else ''} detected")

    if phrases:
        joined = "; ".join(phrases[:-1])
        last = phrases[-1]
        sep = " and " if len(phrases) > 1 else ""
        explanation = f"This asset closely resembles the legitimate brand: its {joined}{',' if len(phrases) > 2 else ''}{sep}{last}."
    else:
        explanation = f"This asset was flagged by Round 1 with {len(reasons)} impersonation signal{'s' if len(reasons) != 1 else ''}."

    def _item(value, pts: int, key: str, label_yes: str, label_no: str) -> dict:
        return {
            "value": value,
            "points": pts,
            "weight": WEIGHTS[key],
            "label": label_yes if pts > 0 else label_no,
            "contributing": pts > 0,
        }

    return {
        "score": total,
        "level": level,
        "explanation": explanation,
        "breakdown": {
            "name_similarity": _item(
                round(name_pct, 1), name_pts, "name_similarity",
                f"Name is {round(name_pct)}% similar", "Name similarity not available",
            ),
            "logo_similarity": _item(
                round(logo_sim, 1), logo_pts, "logo_similarity",
                f"Logo is {round(logo_sim)}% similar", "Logo not compared",
            ),
            "description_overlap": _item(
                desc_pts_raw, desc_pts, "description_overlap",
                f"Description overlap ({desc_pts_raw} pts)", "No description overlap",
            ),
            "publisher_mismatch": _item(
                pub_mismatch, pub_pts, "publisher_mismatch",
                "Different publisher / developer", "Publisher check N/A",
            ),
            "other_signals": _item(
                len(other_signals), other_pts, "other_signals",
                f"{len(other_signals)} additional signal{'s' if len(other_signals) != 1 else ''}",
                "No additional signals",
            ),
        },
    }


# ---------------------------------------------------------------------------
# Round 1 → Round 2 adapter (read-only)
# ---------------------------------------------------------------------------

def adapt_detection(detection: Detection) -> dict:
    """Convert a R1 Detection to the R2 evidence snapshot format."""
    details = detection.details or {}
    cand = details.get("candidate") or {}
    name_match = details.get("name_match") or {}
    logo = details.get("logo") or {}
    ev = detection.evidence or {}
    logo_pct = round(float(logo.get("similarity") or 0), 1) if logo.get("status") == "compared" else None
    return {
        "detection_id": detection.id,
        "platform": detection.platform,
        "category": detection.category,
        "type": detection.type,
        "source_url": detection.profile_url or ev.get("page_url"),
        "suspected_asset": {
            "name": detection.name,
            "handle": detection.handle,
            "package_id": detection.package_id,
            "publisher": detection.publisher,
            "url": detection.profile_url,
            "bio": cand.get("bio"),
            "followers": cand.get("followers"),
            "verified": cand.get("verified"),
        },
        "evidence": {
            "name_similarity_pct": round(float(name_match.get("pct") or 0), 1),
            "logo_similarity_pct": logo_pct,
            "page_url": ev.get("page_url"),
            "captured_at": ev.get("captured_at"),
        },
        "r1_score": detection.score,
        "r1_band": detection.band,
        "r1_severity": detection.severity,
        "reasons": detection.reasons or [],
        "found_at": iso_z(detection.found_at) if detection.found_at else None,
        "last_seen_at": iso_z(detection.last_seen_at) if detection.last_seen_at else None,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _event(db: Session, inv: R2Investigation, *, action: str, from_status: str | None,
           to_status: str | None, actor: str, note: str = "") -> None:
    db.add(R2InvestigationEvent(
        investigation_id=inv.id, action=action, from_status=from_status,
        to_status=to_status, actor=actor, note=note, created_at=utcnow(),
    ))


def _maybe_alert(db: Session, inv: R2Investigation) -> None:
    """Create a high-risk alert exactly once per investigation."""
    if inv.alerted or inv.risk_score < HIGH_RISK_THRESHOLD:
        return
    db.add(R2Alert(
        investigation_id=inv.id, detection_id=inv.detection_id, brand_id=inv.brand_id,
        risk_score=inv.risk_score, risk_level=inv.risk_level,
        platform=inv.platform, name=inv.name, dismissed=False, created_at=utcnow(),
    ))
    inv.alerted = True


def _inv_row(inv: R2Investigation) -> dict:
    return {
        "id": inv.id,
        "detection_id": inv.detection_id,
        "risk_score": inv.risk_score,
        "risk_level": inv.risk_level,
        "status": inv.status,
        "assigned_to": inv.assigned_to,
        "platform": inv.platform,
        "name": inv.name,
        "handle": inv.handle,
        "category": inv.category,
        "r1_score": inv.r1_score,
        "r1_band": inv.r1_band,
        "alerted": inv.alerted,
        "created_at": iso_z(inv.created_at) if inv.created_at else None,
        "updated_at": iso_z(inv.updated_at) if inv.updated_at else None,
    }


def _alert_row(a: R2Alert) -> dict:
    return {
        "id": a.id,
        "investigation_id": a.investigation_id,
        "detection_id": a.detection_id,
        "risk_score": a.risk_score,
        "risk_level": a.risk_level,
        "platform": a.platform,
        "name": a.name,
        "dismissed": a.dismissed,
        "dismissed_by": a.dismissed_by,
        "dismissed_at": iso_z(a.dismissed_at) if a.dismissed_at else None,
        "created_at": iso_z(a.created_at) if a.created_at else None,
    }


# ---------------------------------------------------------------------------
# Sync: import R1 detections into R2
# ---------------------------------------------------------------------------

def _ensure_investigation(db: Session, detection: Detection) -> tuple[R2Investigation, bool]:
    """Return (investigation, created). Creates if missing; idempotent."""
    existing = db.scalar(select(R2Investigation).where(R2Investigation.detection_id == detection.id))
    if existing is not None:
        return existing, False

    score_data = compute_r2_score(detection)
    now = utcnow()
    inv = R2Investigation(
        detection_id=detection.id,
        brand_id=detection.brand_id,
        risk_score=score_data["score"],
        risk_level=score_data["level"],
        status="new",
        score_breakdown=score_data,
        platform=detection.platform or "",
        name=detection.name or "",
        handle=detection.handle,
        category=detection.category or "",
        r1_score=detection.score,
        r1_band=detection.band or "",
        alerted=False,
        created_at=now,
        updated_at=now,
    )
    db.add(inv)
    db.flush()
    _event(db, inv, action="imported", from_status=None, to_status="new", actor="system",
           note=f"Imported from R1 detection #{detection.id}. R2 risk: {score_data['score']}/100 ({score_data['level']}).")
    _maybe_alert(db, inv)
    return inv, True


def sync_brand(db: Session, brand_id: int) -> dict:
    """Import all active R1 detections that don't yet have an R2 investigation."""
    r1_rows = list(db.scalars(
        select(Detection)
        .where(Detection.brand_id == brand_id, Detection.status.in_(("new", "reviewing", "confirmed")))
        .order_by(Detection.id)
    ))
    imported = already = 0
    for det in r1_rows:
        _, created = _ensure_investigation(db, det)
        if created:
            imported += 1
        else:
            already += 1
    db.commit()
    return {"imported": imported, "already_present": already, "total_r1": len(r1_rows)}


# ---------------------------------------------------------------------------
# List / detail
# ---------------------------------------------------------------------------

def list_investigations(
    db: Session,
    brand_id: int,
    *,
    status: str | None = None,
    risk_level: str | None = None,
    platform: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    base = select(R2Investigation).where(R2Investigation.brand_id == brand_id)
    if status:
        base = base.where(R2Investigation.status == status)
    if risk_level:
        base = base.where(R2Investigation.risk_level == risk_level)
    if platform:
        base = base.where(R2Investigation.platform == platform)
    if category:
        base = base.where(R2Investigation.category == category)
    if q:
        t = q.strip()
        base = base.where(
            R2Investigation.name.icontains(t, autoescape=True)
            | R2Investigation.handle.icontains(t, autoescape=True)
        )

    rows = list(db.scalars(base.order_by(R2Investigation.risk_score.desc(), R2Investigation.id.desc())))

    all_rows = list(db.scalars(select(R2Investigation).where(R2Investigation.brand_id == brand_id)))
    status_counts: dict[str, int] = {s: 0 for s in R2_STATUSES}
    level_counts: dict[str, int] = {lv: 0 for lv in R2_LEVELS}
    for r in all_rows:
        if r.status in status_counts:
            status_counts[r.status] += 1
        if r.risk_level in level_counts:
            level_counts[r.risk_level] += 1

    total = len(rows)
    return {
        "total": total,
        "items": [_inv_row(r) for r in rows[offset: offset + limit]],
        "counts": {"by_status": status_counts, "by_level": level_counts},
    }


def get_investigation_detail(db: Session, inv: R2Investigation) -> dict:
    detection = db.get(Detection, inv.detection_id)
    events = list(db.scalars(
        select(R2InvestigationEvent)
        .where(R2InvestigationEvent.investigation_id == inv.id)
        .order_by(R2InvestigationEvent.id)
    ))
    out = _inv_row(inv)
    out["score_breakdown"] = inv.score_breakdown or {}
    out["history"] = [
        {
            "id": e.id,
            "action": e.action,
            "from_status": e.from_status,
            "to_status": e.to_status,
            "actor": e.actor,
            "note": e.note,
            "created_at": iso_z(e.created_at) if e.created_at else None,
        }
        for e in events
    ]
    out["detection"] = adapt_detection(detection) if detection else None
    return out


# ---------------------------------------------------------------------------
# Analyst workflow
# ---------------------------------------------------------------------------

class ActionError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "new": ("under_review",),
    "under_review": ("confirmed", "false_positive"),
    "confirmed": ("closed", "under_review"),
    "false_positive": ("under_review",),
    "closed": ("under_review",),
}


def change_status(db: Session, inv: R2Investigation, user: User, to: str, note: str = "") -> R2Investigation:
    if to not in R2_STATUSES:
        raise ActionError(422, f"Invalid status. Must be one of: {', '.join(R2_STATUSES)}")
    allowed = ALLOWED_TRANSITIONS.get(inv.status, ())
    if to not in allowed:
        raise ActionError(422, f"Cannot go from '{inv.status}' to '{to}'. Allowed: {', '.join(allowed) or 'none'}")
    old = inv.status
    inv.status = to
    inv.updated_at = utcnow()
    _event(db, inv, action="status_changed", from_status=old, to_status=to, actor=user.name, note=note)
    db.commit()
    return inv


def add_note(db: Session, inv: R2Investigation, user: User, note: str) -> R2Investigation:
    if not note.strip():
        raise ActionError(422, "Note cannot be empty.")
    _event(db, inv, action="note_added", from_status=inv.status, to_status=inv.status, actor=user.name, note=note.strip())
    inv.updated_at = utcnow()
    db.commit()
    return inv


def assign_analyst(db: Session, inv: R2Investigation, user: User, analyst_name: str) -> R2Investigation:
    old = inv.assigned_to or "unassigned"
    inv.assigned_to = analyst_name.strip() or None
    inv.updated_at = utcnow()
    _event(db, inv, action="assigned", from_status=inv.status, to_status=inv.status, actor=user.name,
           note=f"Assigned to {analyst_name.strip() or 'nobody'} (was: {old})")
    db.commit()
    return inv


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

def list_alerts(db: Session, brand_id: int, *, include_dismissed: bool = False) -> list[dict]:
    q = select(R2Alert).where(R2Alert.brand_id == brand_id)
    if not include_dismissed:
        q = q.where(R2Alert.dismissed.is_(False))
    rows = list(db.scalars(q.order_by(R2Alert.risk_score.desc(), R2Alert.id.desc())))
    return [_alert_row(a) for a in rows]


def dismiss_alert(db: Session, alert: R2Alert, user: User) -> R2Alert:
    if alert.dismissed:
        return alert
    alert.dismissed = True
    alert.dismissed_at = utcnow()
    alert.dismissed_by = user.name
    db.commit()
    return alert


# ---------------------------------------------------------------------------
# Takedown report
# ---------------------------------------------------------------------------

def generate_takedown_report(db: Session, inv: R2Investigation) -> dict:
    detection = db.get(Detection, inv.detection_id)
    events = list(db.scalars(
        select(R2InvestigationEvent)
        .where(R2InvestigationEvent.investigation_id == inv.id)
        .order_by(R2InvestigationEvent.id)
    ))

    det_data = adapt_detection(detection) if detection else {}
    bd = inv.score_breakdown or {}
    breakdown = bd.get("breakdown") or {}

    def pts(key: str) -> int:
        return breakdown.get(key, {}).get("points", 0)

    def val(key: str):
        return breakdown.get(key, {}).get("value")

    history_lines = "\n".join(
        f"  {e.created_at.strftime('%Y-%m-%d %H:%M UTC') if e.created_at else '—'}  "
        f"{e.action.replace('_', ' ').title()}"
        f"{': ' + e.note if e.note else ''}"
        for e in events
    )

    suspected = det_data.get("suspected_asset") or {}
    evidence = det_data.get("evidence") or {}
    contributing = [v["label"] for v in breakdown.values() if isinstance(v, dict) and v.get("contributing")]

    report_text = f"""INTELLECTUAL PROPERTY INFRINGEMENT INVESTIGATION REPORT
Round 2 — BrandShield

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — INVESTIGATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reference         : R2-{inv.id:06d} / R1-DET-{inv.detection_id}
Status            : {inv.status.replace('_', ' ').upper()}
Platform          : {inv.platform or 'N/A'}
Category          : {inv.category or 'N/A'}
R2 Risk Score     : {inv.risk_score}/100 ({inv.risk_level})
R1 Risk Score     : {inv.r1_score}/100 ({inv.r1_band})
Assigned Analyst  : {inv.assigned_to or 'Unassigned'}
Created           : {inv.created_at.strftime('%Y-%m-%d %H:%M UTC') if inv.created_at else 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — SUSPECTED ASSET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name              : {suspected.get('name') or 'N/A'}
Handle / Package  : {suspected.get('handle') or suspected.get('package_id') or 'N/A'}
Publisher         : {suspected.get('publisher') or 'N/A'}
URL               : {suspected.get('url') or evidence.get('page_url') or 'N/A'}
Platform          : {inv.platform or 'N/A'}
First detected    : {det_data.get('found_at') or 'N/A'}
Last seen         : {det_data.get('last_seen_at') or 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — EVIDENCE AND RISK ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score Explanation:
{bd.get('explanation') or 'No explanation available.'}

Contributing Signals:
{chr(10).join('  ✓ ' + s for s in contributing) or '  (none identified)'}

Detailed Breakdown:
  Name Similarity      : {val('name_similarity') or 'N/A'}% → {pts('name_similarity')}/{WEIGHTS['name_similarity']} pts
  Logo Similarity      : {val('logo_similarity') or 'N/A'}% → {pts('logo_similarity')}/{WEIGHTS['logo_similarity']} pts
  Description Overlap  : {pts('description_overlap')}/{WEIGHTS['description_overlap']} pts
  Publisher Mismatch   : {'YES' if val('publisher_mismatch') else 'NO'} → {pts('publisher_mismatch')}/{WEIGHTS['publisher_mismatch']} pts
  Other Signals        : {pts('other_signals')}/{WEIGHTS['other_signals']} pts
  ─────────────────────────────────────────────────
  Total R2 Score       : {inv.risk_score}/100 ({inv.risk_level})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — INVESTIGATION HISTORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{history_lines or '  (no events recorded)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISCLAIMER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This report is based on automated similarity analysis of publicly available
information. Findings represent evidence of potential impersonation. No claims
of criminal activity, fraud, or malicious intent are made unless separately
established by competent authority. For use by the brand owner and their legal
representatives only.

Report generated: {utcnow().strftime('%Y-%m-%d %H:%M UTC')}
"""
    return {"investigation_id": inv.id, "detection_id": inv.detection_id, "text": report_text}
