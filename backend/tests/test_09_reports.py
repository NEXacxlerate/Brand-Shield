"""Human-in-the-loop: nothing is filed or marked reported without an analyst's approval. Runs last (it changes entity statuses)."""
import json

from app.db import session_scope
from app.models import Entity, Report


def _statuses(campaign_id):
    with session_scope() as db:
        return [e.status for e in db.query(Entity).filter_by(campaign_id=campaign_id).all()]


def test_seeded_reports_are_drafts_not_approvals(client, H):
    reps = client.get("/api/reports", headers=H).json()
    assert len(reps) >= 2 and all(r["status"] in ("draft", "ready") for r in reps if r["sample"])
    assert all(r["approved_by"] is None for r in reps if r["sample"])


def test_viewer_cannot_approve_and_nothing_is_reported_before_approval(client, H, analyst_H, viewer_H):
    rep = client.post("/api/reports", headers=analyst_H, json={"campaign_id": 9, "format": "json", "scope": "all"}).json()
    assert rep["status"] == "ready" and rep["approved_by"] is None and rep["code"].startswith("REP-")
    assert client.post(f"/api/reports/{rep['id']}/approve", headers=viewer_H, json={}).status_code == 403
    assert client.post(f"/api/reports/{rep['id']}/approve", json={}).status_code == 401
    assert "reported" not in _statuses(9)
    assert client.get("/api/campaigns/9", headers=H).json()["status"] != "reported"
    assert "DRAFT" in client.get(f"/api/reports/{rep['id']}/preview", headers=H).text
    # creating, previewing and downloading a report never files anything
    client.get(f"/api/reports/{rep['id']}/download", headers=H)
    assert "reported" not in _statuses(9)
    assert not any(a["action"] == "approved takedown report" for a in client.get("/api/audit?limit=500", headers=H).json())


def test_approval_uses_the_jwt_identity_marks_entities_and_is_audited(client, H, analyst_H):
    rep = next(r for r in client.get("/api/reports", headers=H).json() if r["campaign_id"] == 9 and r["format"] == "json")
    r = client.post(f"/api/reports/{rep['id']}/approve", headers=analyst_H, json={"approved_by": "Someone Else"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["report"]["status"] == "approved" and body["report"]["approved_by"] == "Analyst"      # from the token, never from the body
    assert len(body["marked_reported"]) == 6 and set(_statuses(9)) == {"reported"}
    assert client.get("/api/campaigns/9", headers=H).json()["status"] == "reported"
    audit = client.get("/api/audit?limit=20", headers=H).json()
    row = next(a for a in audit if a["action"] == "approved takedown report")
    assert row["actor"] == "Analyst" and rep["code"] in row["target"]
    assert "Approved by" in client.get(f"/api/reports/{rep['id']}/preview", headers=H).text
    assert client.post(f"/api/reports/{rep['id']}/approve", headers=analyst_H, json={}).status_code == 409
    j = client.get(f"/api/reports/{rep['id']}/download", headers=H)
    data = json.loads(j.content)
    assert data["approvals"][0]["by"] == "Analyst" and len(data["entities"]) == 6 and data["entities"][0]["signals"]


def test_reported_entities_cannot_be_dismissed_back_silently(client, analyst_H):
    with session_scope() as db:
        eid = db.query(Entity).filter_by(campaign_id=9).first().id
    assert client.post(f"/api/entities/{eid}/action", headers=analyst_H, json={"action": "dismiss"}).status_code == 409


def test_scope_limits_which_entities_are_marked(client, H, analyst_H):
    rep = client.post("/api/reports", headers=analyst_H, json={"campaign_id": 1, "format": "json"}).json()
    before = _statuses(1)
    assert "reported" not in before
    r = client.post(f"/api/reports/{rep['id']}/approve", headers=analyst_H, json={"scope": "instagram"}).json()
    with session_scope() as db:
        rows = db.query(Entity).filter_by(campaign_id=1).all()
        reported = [e for e in rows if e.status == "reported"]
    assert reported and all(e.platform == "instagram" for e in reported) and len(reported) == len(r["marked_reported"])
    assert any(e.status != "reported" for e in rows)
    assert client.get("/api/campaigns/1", headers=H).json()["status"] == "confirmed"       # not every entity is filed yet


def test_investigation_report_and_validation(client, analyst_H):
    inv = client.post("/api/investigations", headers=analyst_H, json={"type": "wallet", "value": "acmerefund@okaxis"}).json()
    rep = client.post("/api/reports", headers=analyst_H, json={"investigation_id": inv["id"], "format": "json"})
    assert rep.status_code == 201 and rep.json()["investigation_id"] == inv["id"]
    assert client.post("/api/reports", headers=analyst_H, json={"format": "pdf"}).status_code == 422
    assert client.post("/api/reports", headers=analyst_H, json={"campaign_id": 1, "investigation_id": inv["id"]}).status_code == 422
    assert client.post("/api/reports", headers=analyst_H, json={"campaign_id": 4242}).status_code == 400


def test_pdf_is_rendered_from_the_same_html(client, H, analyst_H):
    rep = client.post("/api/reports", headers=analyst_H, json={"campaign_id": 1, "format": "pdf"}).json()
    r = client.get(f"/api/reports/{rep['id']}/download", headers=H)
    if r.status_code == 503:        # WeasyPrint's native libraries are not installed on this machine
        assert "PDF engine unavailable" in r.json()["detail"]
        return
    assert r.status_code == 200 and r.content[:5] == b"%PDF-" and r.headers["content-type"] == "application/pdf"


def test_report_html_escapes_untrusted_text(client, H):
    with session_scope() as db:
        e = db.get(Entity, 2)
        original = dict(e.data)
        e.data = {**original, "display_name": "<script>alert(1)</script>", "bio": original["bio"] + " <img src=x onerror=alert(2)>"}
        db.commit()
    try:
        html = client.get("/api/campaigns/1/report", headers=H).text
        assert "<script>alert(1)</script>" not in html and "<img src=x" not in html
    finally:
        with session_scope() as db:
            db.get(Entity, 2).data = original
            db.commit()
