"""Demo seed -> clustering, scoring, aggregates, dismiss/reopen."""


def _campaigns(client, H):
    return client.get("/api/campaigns", headers=H).json()


def test_two_campaigns_of_ten_and_six(client, H):
    cs = _campaigns(client, H)
    assert sorted(c["size"] for c in cs) == [6, 10]
    big = next(c for c in cs if c["size"] == 10)
    assert big["counts"] == {"social": 8, "website": 1, "app": 1}
    assert {"payment", "domain", "telegram", "logo"} <= {s["kind"] for s in big["shared"]}
    assert big["hypothesis"]["label"] == "Refund scam"
    assert big["id"] == 1 and next(c for c in cs if c["size"] == 6)["id"] == 9
    assert all(c["sample"] for c in cs)


def test_benign_official_and_lone_accounts(client, H):
    ents = {e["label"]: e for e in client.get("/api/entities?min_score=0", headers=H).json()}
    assert ents["@acmebank_fans"]["score"] < 30                      # declares itself a fan page
    assert ents["@acme_bakery"]["score"] < 30                        # shares only the short name "Acme"
    assert "@acmebank" not in ents                                   # the brand's own account is allow-listed
    assert "Acme Bank" not in ents                                   # ...and so is its official app
    assert ents["@acmebank_giveaway_2026"]["campaign_id"] is None    # the lone giveaway is unclustered
    assert ents["@acmebank_fans"]["campaign_id"] is None and ents["@acme_bakery"]["campaign_id"] is None
    assert ents["@acmebank_giveaway_2026"]["score"] >= 40            # but it is still a suspect


def test_every_score_is_bounded_and_explained(client, H):
    for e in client.get("/api/entities?min_score=0", headers=H).json():
        d = client.get(f"/api/entities/{e['id']}", headers=H).json()
        assert 0 <= d["entity"]["score"] <= 100
        assert d["signals"] and all(s["reason"] for s in d["signals"])
        total = sum(s["points"] for s in d["signals"])
        assert abs(min(100, max(0, total)) - d["entity"]["score"]) < 1.5
    for sev, lo in (("critical", 80), ("high", 60), ("medium", 40)):
        for e in client.get("/api/entities?min_score=0", headers=H).json():
            if e["score"] >= lo:
                assert e["severity"] in {"critical", "high", "medium", "low"}
    assert all((e["severity"] == "critical") == (e["score"] >= 80) for e in client.get("/api/entities?min_score=0", headers=H).json())


def test_dashboard_aggregates_match_the_brief(client, H):
    d = client.get("/api/dashboard", headers=H).json()
    k = {x["key"]: x["value"] for x in d["kpis"]}
    assert k == {"investigations": 2487, "active_threats": 326, "suspicious_apps": 1092, "fake_profiles": 4586}
    st = {s["code"]: s["threats"] for s in d["states"]}
    assert st == {"MH": 482, "UP": 398, "DL": 356, "KA": 290, "TN": 268}
    assert [c["pct"] for c in d["categories"]] == [38, 26, 18, 12, 6]
    assert all(len(x["trend"]) == 7 for x in d["kpis"])
    assert {c["name"].split()[0] for c in d["campaigns"]} == {"C-1", "C-9"}
    assert d["ai_summary"]["source"] == "rules" and d["ai_summary"]["counts"]["social"] == 8
    assert len(d["recent"]) == 5 and all(r["sample"] for r in d["recent"])


def test_dismiss_then_reopen_changes_campaign_size_and_restores_it(client, analyst_H):
    before = client.get("/api/campaigns/1", headers=analyst_H).json()["size"]
    r = client.post("/api/entities/8/action", headers=analyst_H, json={"action": "dismiss"})
    assert r.status_code == 200 and r.json()["status"] == "dismissed"
    assert client.get("/api/campaigns/1", headers=analyst_H).json()["size"] == before - 1
    client.post("/api/entities/8/action", headers=analyst_H, json={"action": "reopen"})
    assert client.get("/api/campaigns/1", headers=analyst_H).json()["size"] == before


def test_graph_layout_is_deterministic(client, H):
    a = client.get("/api/campaigns/1/graph", headers=H).json()
    b = client.get("/api/campaigns/1/graph", headers=H).json()
    assert a["nodes"] == b["nodes"]
    assert any(n["kind"] == "brand" and (n["x"], n["y"]) == (450, 55) for n in a["nodes"])
    assert any(n["predicted"] for n in a["nodes"])                       # forecast ghosts are marked
    assert all(0 <= n["x"] <= 900 and 0 <= n["y"] <= 560 for n in a["nodes"])
    assert a["attack_path"][-1]["stage"] == "Victim" and "Payment" in [s["stage"] for s in a["attack_path"]]


def test_evolution_labels_forecast_as_estimate(client, H):
    e = client.get("/api/campaigns/1/evolution", headers=H).json()
    assert e["forecast"]["is_estimate"] and e["growth"]["is_estimate"]
    assert [s["name"] for s in e["stages"]] == ["Normal", "Anomaly", "Suspicious", "Impersonation", "Campaign", "Active scam"]
    g = e["growth"]
    assert len(g["days"]) == len(g["observed"]) == len(g["forecast"]) == len(g["band"])
    i0 = g["days"].index(0)
    assert g["observed"][i0] == 10 and g["forecast"][i0] == 10
    assert all(g["band"][i][0] <= g["forecast"][i] <= g["band"][i][1] for i in range(i0, len(g["days"])))
    assert e["stage_changes"] and e["timeline"]


def test_dna_has_six_families_and_closest_playbooks(client, H):
    d = client.get("/api/campaigns/1/dna", headers=H).json()
    assert [f["name"] for f in d["families"]] == ["Identity", "Visual", "Language", "Behaviour", "Infrastructure", "Network"]
    assert d["closest"][0]["playbook"] == "Refund scam" and d["closest"][0]["similarity"] >= d["closest"][-1]["similarity"]
    assert "similarity is a text comparison" in d["note"].lower()
    assert d["side_by_side"]["shared_tokens"]
    assert {p["kind"] for p in d["map"]} == {"playbook", "campaign"} and sum(p["current"] for p in d["map"]) == 1
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in d["map"])


def test_learning_loop_adds_knowledge_and_reanalyses(client, analyst_H):
    r = client.post("/api/campaigns/9/confirm", headers=analyst_H)
    assert r.status_code == 200 and r.json()["learned"] is True
    assert r.json()["campaigns"] == 2
    again = client.post("/api/campaigns/9/confirm", headers=analyst_H)       # idempotent: refreshes, does not duplicate
    assert again.status_code == 200
    camps = client.get("/api/campaigns", headers=analyst_H).json()
    assert sorted(c["size"] for c in camps) == [6, 10]


def test_simulator_follows_the_stated_formulas(client, H):
    body = {"campaign_id": 1, "horizon_days": 14, "assumption": "accelerate", "actions": ["report profiles"], "assumed_drop_pct": 40}
    s = client.post("/api/simulator", headers=H, json=body).json()
    assert s["is_estimate"] and "assumption you entered" in s["assumption_note"]
    pace, now = s["pace_per_week"], s["now"]
    assert len(s["baseline"]) == 15 and s["baseline"][0] == now
    expected = now + pace / 7 * 7 * 1 + pace / 7 * 7 * 1.5           # week 1 x1, week 2 x1.5
    assert abs(s["no_action"] - expected) < 0.2
    assert abs((s["if_act"] - now) - (s["no_action"] - now) * 0.6) < 0.2
    slow = client.post("/api/simulator", headers=H, json={**body, "assumption": "slow", "assumed_drop_pct": 0}).json()
    assert slow["no_action"] <= s["no_action"] and slow["if_act"] == slow["no_action"]
    assert client.post("/api/simulator", headers=H, json={**body, "campaign_id": 9999}).status_code == 404
    assert client.post("/api/simulator", headers=H, json={**body, "horizon_days": 10}).status_code == 422
