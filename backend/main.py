"""FastAPI backend service for ScamMind AI."""
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any

app = FastAPI(title="ScamMind AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/overview")
def get_overview(brand_id: int = 1):
    return {
        "brand_id": brand_id,
        "kpi": [
            {
                "title": "Total Investigations",
                "value": "2,487",
                "change": "↑ 12%",
                "isGood": True,
                "trend": [1800, 1950, 2100, 2250, 2350, 2410, 2487],
                "color": "blue"
            },
            {
                "title": "Active Threats",
                "value": "326",
                "change": "↑ 8%",
                "isGood": False,
                "trend": [260, 275, 290, 285, 310, 318, 326],
                "color": "red"
            },
            {
                "title": "Suspicious Apps",
                "value": "1,092",
                "change": "↑ 25%",
                "isGood": False,
                "trend": [720, 780, 850, 910, 990, 1040, 1092],
                "color": "violet"
            },
            {
                "title": "Fake Profiles Found",
                "value": "4,586",
                "change": "↑ 18%",
                "isGood": False,
                "trend": [3400, 3650, 3900, 4120, 4300, 4480, 4586],
                "color": "green"
            }
        ],
        "stateThreats": [
            {"state": "Maharashtra", "threats": 482, "change": "↑ 12%", "severity": "High"},
            {"state": "Uttar Pradesh", "threats": 398, "change": "↑ 18%", "severity": "High"},
            {"state": "Delhi", "threats": 356, "change": "↑ 25%", "severity": "High"},
            {"state": "Karnataka", "threats": 290, "change": "↑ 14%", "severity": "Medium"},
            {"state": "Tamil Nadu", "threats": 268, "change": "↑ 11%", "severity": "Low"}
        ],
        "categories": [
            {"label": "Fake Profiles", "percentage": 38, "color": "#FF5C5C"},
            {"label": "Phishing Websites", "percentage": 26, "color": "#5AA9FF"},
            {"label": "Suspicious Apps", "percentage": 18, "color": "#A855F7"},
            {"label": "Impersonation", "percentage": 12, "color": "#FF9A4D"},
            {"label": "Others", "percentage": 6, "color": "#34D399"}
        ],
        "campaigns": [
            {"name": "Acme Bank KYC Scam", "entities": 17, "risk": "Critical"},
            {"name": "UPI Reward Scam", "entities": 12, "risk": "High"},
            {"name": "Banking Support Scam", "entities": 9, "risk": "High"},
            {"name": "Government Scheme Scam", "entities": 8, "risk": "Medium"}
        ],
        "criticalAlerts": [
            {"id": "1", "title": "Fake Acme Bank support account detected", "timeAgo": "2 minutes ago", "severity": "High"},
            {"id": "2", "title": "Malicious Android app found", "timeAgo": "18 minutes ago", "severity": "High"},
            {"id": "3", "title": "Phishing website detected", "timeAgo": "1 hour ago", "severity": "Medium"},
            {"id": "4", "title": "Fraudulent phone number", "timeAgo": "3 hours ago", "severity": "Medium"},
            {"id": "5", "title": "Impersonation campaign", "timeAgo": "5 hours ago", "severity": "High"}
        ],
        "recentInvestigations": [
            {
                "id": 1,
                "input": "acme-support-help.com",
                "type": "Website",
                "result": "Phishing Domain",
                "riskScore": 92,
                "status": "Malicious",
                "dateTime": "11 Oct 2026, 10:42 AM"
            },
            {
                "id": 2,
                "input": "com.acme.support.help.apk",
                "type": "Android App",
                "result": "Suspicious App",
                "riskScore": 88,
                "status": "Malicious",
                "dateTime": "11 Oct 2026, 09:58 AM"
            },
            {
                "id": 3,
                "input": "+91 98765 43210",
                "type": "Phone Number",
                "result": "Fraudulent Contact",
                "riskScore": 84,
                "status": "Suspicious",
                "dateTime": "11 Oct 2026, 08:03 AM"
            },
            {
                "id": 4,
                "input": "@acme_support_india",
                "type": "Social Profile",
                "result": "Fake Profile",
                "riskScore": 94,
                "status": "Malicious",
                "dateTime": "10 Oct 2026, 07:41 PM"
            },
            {
                "id": 5,
                "input": "upi-reward-offer.in",
                "type": "Website",
                "result": "Scam Page",
                "riskScore": 86,
                "status": "Malicious",
                "dateTime": "10 Oct 2026, 05:12 PM"
            }
        ]
    }

@app.get("/api/entities")
def get_entities():
    return [
        {"id": 1, "entity": "acrnebank-refund.com", "type": "Domain", "status": "Changed", "active": True, "dateAdded": "07 Oct 2026"},
        {"id": 2, "entity": "@acme_refund_help", "type": "Social Profile", "status": "Spreading", "active": True, "dateAdded": "08 Oct 2026"},
        {"id": 3, "entity": "acmerefund@okaxis", "type": "Payment ID", "status": "Stable", "active": True, "dateAdded": "09 Oct 2026"},
        {"id": 4, "entity": "com.acrnebank.refund", "type": "Android APK", "status": "Changed", "active": True, "dateAdded": "09 Oct 2026"},
        {"id": 5, "entity": "t.me/acme_refund_desk", "type": "Telegram", "status": "Spreading", "active": True, "dateAdded": "10 Oct 2026"},
        {"id": 6, "entity": "+91 90000 12345", "type": "Phone Number", "status": "Stable", "active": True, "dateAdded": "10 Oct 2026"}
    ]

@app.get("/api/entities/{id}")
def get_entity_by_id(id: str):
    return {
        "caseId": "INV-2026-0142",
        "target": "acrnebank-refund.com",
        "type": "Domain",
        "mode": "Deep investigation",
        "assignedTo": "Harini",
        "riskScore": 78,
        "severity": "High",
        "classifications": [
            {"label": "Phishing", "percentage": 86},
            {"label": "Impersonation", "percentage": 94},
            {"label": "Scam", "percentage": 72},
            {"label": "Suspicious", "percentage": 64},
            {"label": "Malware", "percentage": 18}
        ],
        "keyFindings": [
            "Domain is newly registered (4 days ago)",
            "Name reads as the trusted brand once look-alikes are normalised",
            "Found in malicious URL reports",
            "Page asks for card number, CVV and OTP",
            "Linked to 7 related fake profiles"
        ],
        "evidenceCount": 12,
        "summary": "acrnebank-refund.com is very likely impersonating Acme Bank (risk 78 out of 100).",
        "relatedEntities": [
            {"entity": "acrnebank-refund.com", "type": "Domain", "risk": "High", "link": "Verified"},
            {"entity": "@acme_refund_help", "type": "Instagram profile", "risk": "Critical", "link": "Verified"},
            {"entity": "acme_refund_desk", "type": "Telegram channel", "risk": "High", "link": "Inferred"},
            {"entity": "+91 90000 12345", "type": "Phone number", "risk": "Medium", "link": "Inferred"},
            {"entity": "acrnebank-refund.com/acme-refund.apk", "type": "URL", "risk": "Critical", "link": "Verified"},
            {"entity": "acmerefund@okaxis", "type": "Payment ID", "risk": "Critical", "link": "Verified"}
        ],
        "actions": [
            {"title": "Block / report", "desc": "Report to the registrar and host"},
            {"title": "Monitor for similar activity", "desc": "Watch look-alikes of acmebank.com"},
            {"title": "Verify with official source", "desc": "Confirm with the brand's own team"},
            {"title": "Escalate for analysis", "desc": "Assign to a senior analyst"}
        ]
    }

@app.post("/api/entities/{id}/action")
def take_entity_action(id: str, action: Dict[str, Any] = Body(...)):
    return {"success": True, "id": id, "action": action.get("action")}

@app.get("/api/campaigns")
def get_campaigns():
    return [
        {"name": "Acme Bank KYC Scam", "entities": 17, "risk": "Critical"},
        {"name": "UPI Reward Scam", "entities": 12, "risk": "High"},
        {"name": "Banking Support Scam", "entities": 9, "risk": "High"},
        {"name": "Government Scheme Scam", "entities": 8, "risk": "Medium"}
    ]

@app.get("/api/campaigns/{id}")
def get_campaign_by_id(id: str):
    return {
        "campaignId": id,
        "stages": [
            {"name": "Normal", "count": 2, "color": "#34D399"},
            {"name": "Anomaly", "count": 1, "color": "#5AA9FF"},
            {"name": "Suspicious", "count": 1, "color": "#F5C542"},
            {"name": "Impersonation", "count": 0, "color": "#FF9A4D"},
            {"name": "Campaign", "count": 9, "color": "#FF5C5C"},
            {"name": "Active scam", "count": 8, "color": "#FF5C5C"}
        ]
    }

@app.get("/api/graph")
def get_graph():
    return {
        "brandNode": {"id": "acme-bank", "label": "Acme Bank (official)", "x": 450, "y": 55},
        "nodeCount": 16,
        "edgeCount": 18
    }

@app.get("/api/campaigns/{id}/report")
def get_campaign_report(id: str):
    return {
        "id": "REP-2026-089",
        "title": "Acme Bank Refund Scam Dossier",
        "scope": f"Campaign {id}",
        "status": "Draft",
        "format": "PDF"
    }

@app.post("/api/campaigns/{id}/approve")
def approve_campaign(id: str):
    return {"success": True, "id": id, "status": "Approved"}

@app.post("/api/campaigns/{id}/confirm")
def confirm_campaign(id: str):
    return {"success": True, "id": id, "status": "Confirmed"}

@app.post("/api/investigate")
def investigate(payload: Dict[str, Any] = Body(...)):
    return {"caseId": "INV-2026-0143", "status": "Analyzing", **payload}

@app.post("/api/investigate/add")
def add_to_investigate(payload: Dict[str, Any] = Body(...)):
    return {"success": True, **payload}

@app.post("/api/scan")
def start_scan(payload: Dict[str, Any] = Body(...)):
    return {"jobId": "job-9841", "status": "queued"}

@app.get("/api/jobs/{id}")
def get_job(id: str):
    return {"id": id, "status": "completed"}

@app.get("/api/audit")
def get_audit():
    return [
        {"time": "11 Oct 2026, 10:45 AM", "user": "Harini", "action": "Approved takedown dossier REP-2026-085"},
        {"time": "11 Oct 2026, 10:12 AM", "user": "Harini", "action": "Added acrnebank-refund.com to Campaign C-1"}
    ]
