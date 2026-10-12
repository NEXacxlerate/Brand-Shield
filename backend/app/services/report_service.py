"""Takedown dossiers (HTML preview, PDF via WeasyPrint, full JSON) and the human approval step.

The report is a DRAFT until a named person approves it. The AI prepares the case; a human files it.
Nothing is marked "reported" except through approve_report().
"""
import json
from datetime import datetime
from html import escape as h

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..engine import explain
from ..models import Brand, Entity, Evidence, Investigation, Report, Signal, User, utcnow
from . import analysis_service as svc
from . import evidence_service
from .common import write_audit

POLICY = {
    "instagram": "Impersonation / pretending to be someone else",
    "facebook": "Impersonation / fraud or scam",
    "x": "Impersonation and deceptive identities",
    "telegram": "Scam and impersonation (report channel to abuse@telegram.org)",
    "web": "Phishing and brand impersonation (registrar / hosting abuse)",
    "android": "Malicious or counterfeit app",
}


class ReportError(RuntimeError):
    pass


def _ts(dt) -> str:
    return dt.strftime("%d %b %Y %H:%M UTC") if isinstance(dt, datetime) else str(dt)


def in_scope(member: dict, scope: str) -> bool:
    if member["status"] == "dismissed":
        return False
    return scope in (None, "", "all") or member["platform"] == scope or member["type"] == scope


def new_code(db: Session) -> str:
    year = utcnow().year
    prefix = f"REP-{year}-"
    last = db.scalar(select(func.max(Report.code)).where(Report.code.like(prefix + "%")))
    return f"{prefix}{(int(last.split('-')[-1]) + 1) if last else 1:03d}"


def _approvals(db: Session, campaign_id=None, investigation_id=None):
    q = select(Report, User).join(User, User.id == Report.approved_by).where(Report.status == "approved")
    q = q.where(Report.campaign_id == campaign_id) if campaign_id else q.where(Report.investigation_id == investigation_id)
    return db.execute(q.order_by(Report.approved_at.desc())).all()


def _entity_rows(db: Session, members: list[dict], scope: str):
    rows = []
    for m in members:
        if not in_scope(m, scope):
            continue
        sigs = db.scalars(select(Signal).where(Signal.entity_id == m["id"], Signal.points > 0).order_by(Signal.points.desc()).limit(4)).all()
        rows.append((m, sigs))
    return rows


def campaign_dossier_html(db: Session, cid: int, scope: str = "all") -> str | None:
    c = svc.get_campaign(db, cid, full=True)
    if not c:
        return None
    brand = svc.brand_dict(db.get(Brand, c["brand_id"]))
    summary = explain.campaign_summary(c, brand)
    acts = explain.recommended_actions(c, c["members"])
    ents = {m["id"]: m for m in c["members"]}
    rows_html = []
    for m, sigs in _entity_rows(db, c["members"], scope):
        fs = db.scalar(select(Entity.first_seen).where(Entity.id == m["id"]))
        rows_html.append(f"""<tr><td><b>{h(m['label'])}</b><br><span class="m">{h(m['platform'])} · {h(m['type'])}</span><br><span class="u">{h(m['url'])}</span></td>
<td class="n">{round(m['score'])}</td>
<td><ul>{''.join(f"<li>{h(s.reason)} <span class='m'>(+{s.points:g})</span></li>" for s in sigs)}</ul></td>
<td class="m">First seen {_ts(fs)}<br>Source: {h(m['source'])}{' (sample data)' if m['source'] == 'sample' else ''}</td></tr>""")
    in_scope_members = [m for m in c["members"] if in_scope(m, scope)]
    shared = "".join(f"<tr><td>{h(s['label'])}</td><td>{h(s['display'])}</td><td class='n'>{s['count']}</td></tr>" for s in c["shared"])
    path = "".join(f"<li><b>{h(s['stage'])}:</b> {h(s['title'])}<br><span class='m'>{h(s['detail'])}</span></li>" for s in c["path"])
    groups: dict = {}
    for m in in_scope_members:
        groups.setdefault(m["platform"], []).append(m)
    per_platform = "".join(
        f"<h3>{h(p.title())}</h3><p><b>Category:</b> {h(POLICY.get(p, 'Impersonation'))}</p>"
        f"<p>These {len(ms)} item(s) impersonate <b>{h(brand['name'])}</b> and are part of one coordinated campaign ({h(c['label'])}). "
        f"Please review and remove: {', '.join(h(x['label']) for x in ms)}.</p>" for p, ms in groups.items())
    appr = _approvals(db, campaign_id=cid)
    approvals = ("".join(f"<p class='ok'>Approved by <b>{h(u.name)}</b> on {_ts(r.approved_at)} (scope: {h(r.scope or 'all')})</p>" for r, u in appr)
                 or "<p class='draft'>DRAFT. Not approved. A named analyst must approve before this is filed anywhere.</p>")
    sample_note = ("<p class='m'>Data note: items marked sample come from the synthetic demonstration dataset. </p>" if any(m["source"] == "sample" for m in in_scope_members) else "")
    return _page(f"{c['label']} dossier", f"""
<h1>Takedown dossier: {h(c['label'])}</h1>
<p class="m">Brand: {h(brand['name'])} · Generated {_ts(utcnow())} · Risk {c['risk']}/100 ({h(c['severity'])}) · Stage: {h(c['stage_name'])} · Scope: {h(scope or 'all')}</p>
{approvals}
<h2>Summary</h2><p>{h(summary['text'])}</p>
<p class="m">Summary source: {'AI-written from the computed facts' if summary['source'] == 'ai' else 'rule-based from the computed facts'}. Predictions and exposure figures are estimates.</p>
<h2>Entities and evidence</h2>
<table><tr><th>Entity</th><th class="n">Risk</th><th>Why (points)</th><th>Capture</th></tr>{''.join(rows_html)}</table>
<h2>What links them</h2><table><tr><th>Type</th><th>Value</th><th class="n">Entities</th></tr>{shared or '<tr><td colspan=3>No shared identifiers (linked by content similarity).</td></tr>'}</table>
<h2>How a victim is drawn in</h2><ol>{path}</ol>
<h2>Report text by platform</h2>{per_platform}
<h2>Recommended next steps (each needs human approval)</h2><ul>{''.join(f"<li>{h(a['action'])}</li>" for a in acts)}</ul>
{sample_note}<p class="m">Scores are computed from the listed signals; they are indicators for human review, not legal findings.</p>""")


def investigation_dossier_html(db: Session, inv: Investigation) -> str:
    r = inv.result or {}
    appr = _approvals(db, investigation_id=inv.id)
    approvals = ("".join(f"<p class='ok'>Approved by <b>{h(u.name)}</b> on {_ts(rp.approved_at)}</p>" for rp, u in appr)
                 or "<p class='draft'>DRAFT. Not approved. A named analyst must approve before this is filed anywhere.</p>")
    rel = "".join(f"<tr><td>{h(x['entity'])}</td><td>{h(x['type'])}</td><td>{h(x['risk'])}</td><td>{h(x['link'])}</td></tr>" for x in r.get("related", []))
    cls = "".join(f"<tr><td>{h(x['label'])}</td><td class='n'>{x['pct']}%</td></tr>" for x in r.get("classification", []))
    steps = "".join(f"<li><b>{h(s['name'])}</b> ({h(s['status'])}): {h(s['detail'])}</li>" for s in r.get("steps", []))
    return _page(f"{inv.id} dossier", f"""
<h1>Investigation dossier: {h(inv.id)}</h1>
<p class="m">Input: {h(inv.input_value[:200])} · Type: {h(inv.input_type)} · Depth: {h(inv.depth)} · Generated {_ts(utcnow())} ·
Risk {round(inv.risk_score)}/100 ({h(r.get('risk', {}).get('severity', ''))})</p>
{approvals}
<h2>Summary</h2><p>{h((r.get('summary') or {}).get('text', ''))}</p>
<p class="m">Method: {h(r.get('method', ''))}</p>
<h2>Key findings</h2><ul>{''.join(f'<li>{h(f)}</li>' for f in r.get('findings', []))}</ul>
<h2>Classification</h2><table>{cls}</table>
<h2>Related entities</h2><table><tr><th>Entity</th><th>Type</th><th>Risk</th><th>Link</th></tr>{rel}</table>
<h2>Steps performed</h2><ol>{steps}</ol>
<p class="m">Scores are computed from the listed signals; they are indicators for human review, not legal findings.</p>""")


def _page(title: str, body: str) -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{h(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14202b;max-width:920px;margin:32px auto;padding:0 20px}}
h1{{font-size:28px;margin:0 0 4px}} h2{{font-size:18px;margin:28px 0 8px;border-top:2px solid #14202b;padding-top:10px}} h3{{margin:14px 0 4px}}
table{{border-collapse:collapse;width:100%}} td,th{{border-bottom:1px solid #d5dce3;padding:8px 6px;vertical-align:top;text-align:left;overflow-wrap:anywhere}}
.n{{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}} .m{{color:#566575;font-size:13px}} .u{{color:#1d4ed8;font-size:13px}} ul{{margin:0;padding-left:18px}}
.draft{{background:#fff3cd;border:1px solid #e0b84a;padding:10px 12px;border-radius:6px}} .ok{{background:#e5f4ec;border:1px solid #7fb99b;padding:10px 12px;border-radius:6px}}
@media print{{body{{margin:0}}}}
</style></head><body>{body}</body></html>"""


# ------------------------------------------------------------------ JSON ---

def campaign_json(db: Session, cid: int) -> dict | None:
    c = svc.get_campaign(db, cid, full=True)
    if not c:
        return None
    members = []
    for m in c["members"]:
        d = svc.entity_detail(db, m["id"])
        members.append({**m, "signals": d["signals"], "identifiers": d["identifiers"], "data": d["entity"]["data"]})
    ev = [evidence_service.to_dict(db, e) for e in db.scalars(select(Evidence).where(Evidence.campaign_id == cid))]
    return {"generated_at": utcnow().isoformat() + "Z", "campaign": {k: v for k, v in c.items() if k != "members"}, "entities": members,
            "evidence": ev, "approvals": [{"by": u.name, "at": r.approved_at.isoformat() + "Z", "scope": r.scope} for r, u in _approvals(db, campaign_id=cid)],
            "notes": ["Scores are sums of the listed signal points (capped at 100).", "Forecast and blast radius are estimates."]}


def investigation_json(db: Session, inv: Investigation) -> dict:
    ev = [evidence_service.to_dict(db, e) for e in db.scalars(select(Evidence).where(Evidence.investigation_id == inv.id))]
    return {"generated_at": utcnow().isoformat() + "Z", "investigation": {"id": inv.id, "input": inv.input_value, "type": inv.input_type, "depth": inv.depth,
            "status": inv.status, "risk_score": inv.risk_score, "created_at": inv.created_at.isoformat() + "Z"}, "result": inv.result, "evidence": ev,
            "approvals": [{"by": u.name, "at": r.approved_at.isoformat() + "Z", "scope": r.scope} for r, u in _approvals(db, investigation_id=inv.id)]}


# ------------------------------------------------------------ lifecycle ---

def render_html(db: Session, report: Report) -> str | None:
    if report.campaign_id:
        return campaign_dossier_html(db, report.campaign_id, report.scope or "all")
    inv = db.get(Investigation, report.investigation_id)
    return investigation_dossier_html(db, inv) if inv else None


def write_file(db: Session, report: Report) -> str:
    """(Re)generate the file on disk. PDF is rendered from the same HTML the preview shows."""
    settings.report_dir.mkdir(parents=True, exist_ok=True)
    ext = "pdf" if report.format == "pdf" else "json"
    path = settings.report_dir / f"{report.code}.{ext}"
    if report.format == "json":
        data = campaign_json(db, report.campaign_id) if report.campaign_id else investigation_json(db, db.get(Investigation, report.investigation_id))
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    else:
        html = render_html(db, report)
        if html is None:
            raise ReportError("Nothing to report on")
        try:
            from weasyprint import HTML
            HTML(string=html).write_pdf(str(path))
        except Exception as ex:
            raise ReportError(f"PDF engine unavailable ({type(ex).__name__}). Use the JSON format or the HTML preview.")
    report.file_path = str(path)
    return str(path)


def create_report(db: Session, user: User, campaign_id: int | None, investigation_id: str | None, fmt: str, scope: str = "all") -> Report:
    brand_id, title = None, ""
    if campaign_id:
        c = svc.get_campaign(db, campaign_id, full=False)
        if not c:
            raise ReportError("Unknown campaign")
        brand_id, title = c["brand_id"], f"{c['label']}: {c['hypothesis']['label']} dossier"
    else:
        inv = db.get(Investigation, investigation_id)
        if not inv:
            raise ReportError("Unknown investigation")
        brand_id, title = inv.brand_id, f"{inv.id} investigation dossier"
    rep = Report(code=new_code(db), title=title, brand_id=brand_id, campaign_id=campaign_id, investigation_id=None if campaign_id else investigation_id,
                 format=fmt, status="draft", scope=scope or "all", created_by=user.id if user else None)
    db.add(rep)
    db.flush()
    try:
        write_file(db, rep)
        rep.status = "ready"
    except ReportError:
        if fmt == "pdf":
            rep.status = "draft"          # file can be generated later; the HTML preview always works
        else:
            raise
    db.commit()
    return rep


def approve_report(db: Session, user: User, rep: Report, scope: str | None = None) -> list[int]:
    """The only path that marks entities 'reported'. Records approved_by from the authenticated user."""
    if rep.status == "approved":
        return []
    rep.scope = scope or rep.scope or "all"
    rep.approved_by, rep.approved_at, rep.status = user.id, utcnow(), "approved"
    if rep.campaign_id:
        members = svc._members(db, rep.campaign_id)
    else:
        inv = db.get(Investigation, rep.investigation_id)
        ids = (inv.result or {}).get("matched_entity_ids", []) if inv else []
        members = [svc.entity_dict(e) for e in db.scalars(select(Entity).where(Entity.id.in_(ids)))] if ids else []
    marked = []
    for m in members:
        if in_scope(m, rep.scope):
            e = db.get(Entity, m["id"])
            if e.status != "reported":
                e.status = "reported"
                marked.append(e.id)
    write_audit(db, user, "approved takedown report", rep.code, f"scope={rep.scope}; entities marked reported: {marked}", commit=False)
    db.flush()          # autoflush is off: the file must be rendered from the approved state
    try:
        write_file(db, rep)
    except ReportError:
        pass
    db.commit()
    return marked
