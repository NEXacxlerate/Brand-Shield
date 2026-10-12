"""Contract tests: every endpoint's response validates against its Pydantic schema, and every JSON route declares one."""
import pytest
from pydantic import TypeAdapter

from app import schemas as S
from app.main import app

GETS = [
    ("/api/health", S.HealthOut), ("/api/me", S.MeOut), ("/api/dashboard", S.DashboardOut), ("/api/dashboard?brand_id=1", S.DashboardOut),
    ("/api/campaigns", list[S.CampaignOut]), ("/api/campaigns/1", S.CampaignDetail), ("/api/campaigns/9", S.CampaignDetail),
    ("/api/campaigns/1/graph", S.GraphOut), ("/api/campaigns/9/graph", S.GraphOut),
    ("/api/campaigns/1/evolution", S.EvolutionOut), ("/api/campaigns/9/evolution", S.EvolutionOut),
    ("/api/campaigns/1/dna", S.DnaOut), ("/api/campaigns/9/dna", S.DnaOut),
    ("/api/entities", list[S.EntityRow]), ("/api/entities/1", S.EntityDetail), ("/api/entities/2", S.EntityDetail),
    ("/api/brands", list[S.BrandOut]), ("/api/brands/1", S.BrandOut), ("/api/brands/1/monitor", S.MonitorOut),
    ("/api/investigations", S.InvestigationPage), ("/api/investigations?q=acme&status=open", S.InvestigationPage),
    ("/api/reports", list[S.ReportOut]), ("/api/watchlist", list[S.WatchOut]), ("/api/alerts", list[S.AlertOut]),
    ("/api/alerts?unread=true", list[S.AlertOut]), ("/api/evidence", list[S.EvidenceOut]), ("/api/audit?limit=10", list[S.AuditOut]),
    ("/api/settings/integrations", list[S.IntegrationOut]), ("/api/users", list[S.UserOut]),
]


@pytest.mark.parametrize("url,schema", GETS)
def test_get_matches_schema(client, H, url, schema):
    r = client.get(url, headers=H)
    assert r.status_code == 200, r.text
    TypeAdapter(schema).validate_python(r.json())


def test_detail_endpoints_for_every_investigation_shape(client, H):
    ids = [i["id"] for i in client.get("/api/investigations", headers=H).json()["items"][:5]]
    for iid in ids:
        TypeAdapter(S.InvestigationDetail).validate_python(client.get(f"/api/investigations/{iid}", headers=H).json())


def test_post_responses_match_schema(client, H):
    inv = client.post("/api/investigations", headers=H, json={"type": "url", "value": "contract-check.example"})
    TypeAdapter(S.InvestigationCreated).validate_python(inv.json())
    sim = client.post("/api/simulator", headers=H, json={"campaign_id": 1, "horizon_days": 30, "assumption": "slow", "assumed_drop_pct": 25})
    TypeAdapter(S.SimOut).validate_python(sim.json())
    app_r = client.post("/api/apps/analyze", headers=H, json={"package": "com.contract.check", "title": "Check"})
    TypeAdapter(S.AppAnalysisOut).validate_python(app_r.json())
    act = client.post("/api/entities/14/action", headers=H, json={"action": "confirm"})
    TypeAdapter(S.EntityActionOut).validate_python(act.json())
    client.post("/api/entities/14/action", headers=H, json={"action": "reopen"})
    job = client.post("/api/scan", headers=H, json={"mode": "demo"})
    jid = TypeAdapter(S.JobCreated).validate_python(job.json()).job_id
    TypeAdapter(S.JobOut).validate_python(client.get(f"/api/jobs/{jid}", headers=H).json())


def test_every_json_route_declares_a_response_model():
    html_or_file = {"/api/campaigns/{cid}/report", "/api/reports/{rid}/preview", "/api/reports/{rid}/download", "/api/evidence/{eid}/download"}
    openapi = app.openapi()
    for path, methods in openapi["paths"].items():
        if not path.startswith("/api") or path in {p.replace("{cid}", "{cid}") for p in html_or_file}:
            continue
        for method, spec in methods.items():
            ok = spec["responses"].get("200") or spec["responses"].get("201") or spec["responses"].get("202")
            content = ok["content"]["application/json"]["schema"]
            assert content != {} and content.get("type") != "object" or "properties" in content or "$ref" in content, (method, path)


def test_html_preview_and_unknown_ids(client, H):
    r = client.get("/api/campaigns/1/report", headers=H)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html") and "Takedown dossier" in r.text
    for url in ("/api/campaigns/999", "/api/campaigns/999/graph", "/api/campaigns/999/evolution", "/api/campaigns/999/dna", "/api/entities/99999",
                "/api/brands/99", "/api/brands/99/monitor", "/api/reports/99999", "/api/evidence/99999/download", "/api/campaigns/999/report"):
        assert client.get(url, headers=H).status_code == 404, url
