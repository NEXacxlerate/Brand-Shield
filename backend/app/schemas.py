"""Pydantic v2 schemas. Every route declares one of these as its response_model, and tests validate responses against them."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["critical", "high", "medium", "low"]
Role = Literal["admin", "analyst", "viewer"]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------- auth ---
class UserOut(Out):
    id: int
    name: str
    email: str
    role: Role
    active: bool
    created_at: datetime


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)
    role: Role = "viewer"


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class Ok(BaseModel):
    ok: bool = True
    detail: str = ""


class UserPatch(BaseModel):
    name: str | None = None
    role: Role | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


# -------------------------------------------------------------- dashboard ---
class Kpi(BaseModel):
    key: str
    label: str
    value: int
    change_pct: float
    trend: list[float]
    good: bool


class StateRow(BaseModel):
    code: str
    name: str
    threats: int
    change_pct: float
    level: Literal["high", "medium", "low"]


class Category(BaseModel):
    label: str
    pct: int
    color: str
    count: int


class CampaignBrief(BaseModel):
    id: int
    name: str
    entities: int
    risk: Severity
    sample: bool = False


class AlertBrief(BaseModel):
    id: int
    kind: str
    title: str
    ago: str
    severity: str
    sample: bool = False


class RecentRow(BaseModel):
    id: str
    input: str
    type: str
    result: str
    risk: int
    status: str
    created_at: str | None
    sample: bool = False


class AiCounts(BaseModel):
    social: int
    websites: int
    apps: int
    phones: int
    payment_ids: int


class AiSummary(BaseModel):
    text: str
    source: Literal["rules", "ai"]
    counts: AiCounts
    campaign_id: int | None = None


class DashboardOut(BaseModel):
    kpis: list[Kpi]
    states: list[StateRow]
    categories: list[Category]
    campaigns: list[CampaignBrief]
    alerts: list[AlertBrief]
    recent: list[RecentRow]
    ai_summary: AiSummary


# ---------------------------------------------------------- investigations ---
class InvestigationCreate(BaseModel):
    type: str = Field(min_length=1, max_length=24)
    value: str = Field(default="", max_length=5000)
    depth: Literal["quick", "deep"] = "quick"
    brand_id: int | None = None
    state_code: str | None = Field(default=None, max_length=4)


class Step(BaseModel):
    name: str
    status: str
    detail: str


class InvestigationCreated(BaseModel):
    id: str
    steps: list[Step]
    status: str


class InvestigationRow(BaseModel):
    id: str
    input: str
    type: str
    result: str
    risk: int
    status: str
    lifecycle: str
    assigned_to: str | None
    created_at: str | None
    sample: bool


class InvestigationPage(BaseModel):
    items: list[InvestigationRow]
    page: int
    page_size: int
    total: int


class Risk(BaseModel):
    score: float
    severity: Severity
    label: str


class ClassRow(BaseModel):
    label: str
    pct: int


class SummaryOut(BaseModel):
    text: str
    source: Literal["rules", "ai"]


class RelatedRow(BaseModel):
    entity: str
    type: str
    risk: str
    link: Literal["verified", "inferred"]
    entity_id: int | None = None


class ActionRow(BaseModel):
    key: str
    label: str
    detail: str


class NoteOut(BaseModel):
    id: int
    author: str | None
    text: str
    created_at: str


class InvestigationDetail(BaseModel):
    id: str
    input: str
    type: str
    depth: str
    lifecycle: str
    assigned_to: str | None
    risk: Risk
    classification: list[ClassRow]
    findings: list[str]
    summary: SummaryOut
    related: list[RelatedRow]
    actions: list[ActionRow]
    notes: list[NoteOut]
    evidence_count: int
    steps: list[Step]
    method: str
    campaign_id: int | None = None
    created_at: str | None
    sample: bool


class InvestigationPatch(BaseModel):
    status: Literal["open", "investigating", "on_hold", "resolved"] | None = None
    assigned_to: int | None = None


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


# ------------------------------------------------------------------- apps ---
class AppMetadataIn(BaseModel):
    brand_id: int | None = None
    package: str = Field(min_length=3, max_length=200)
    title: str = ""
    developer: str = ""
    cert_sha256: str = ""
    permissions: list[str] = []
    urls: list[str] = []
    store: Literal["play", "sideload"] = "sideload"
    installs: int | None = None
    released_days_ago: int | None = None
    version: str = ""


class AppIndicator(BaseModel):
    check: str
    finding: str
    flag: str


class AppPermission(BaseModel):
    name: str
    risky: bool
    reason: str


class AppUrl(BaseModel):
    url: str
    note: str
    flag: str


class AppProfile(BaseModel):
    name: str
    package: str
    developer: str = ""
    cert_sha256: str = ""
    source: str = ""
    version: str = ""


class AppVerdict(BaseModel):
    score: float
    severity: Severity


class AppAnalysisOut(BaseModel):
    verdict: AppVerdict
    official: AppProfile
    app: AppProfile
    icon_similarity: int | None
    indicators: list[AppIndicator]
    permissions: list[AppPermission]
    urls: list[AppUrl]
    evidence_id: int | None = None
    investigation_id: str | None = None


# -------------------------------------------------------------- campaigns ---
class Shared(BaseModel):
    kind: str
    value: str
    label: str
    display: str
    count: int
    ids: list[int]


class Hypothesis(BaseModel):
    label: str
    match: float


class BlastRadius(BaseModel):
    entities: int
    channels: int
    followers: int
    installs: int
    is_estimate: bool
    note: str


class CampaignOut(BaseModel):
    id: int
    brand_id: int
    label: str
    name: str
    size: int
    counts: dict[str, int]
    platforms: dict[str, int]
    risk: int
    severity: Severity
    stage: int
    stage_name: str
    status: str
    first_seen_days: float
    last_seen_days: float
    shared: list[Shared]
    hypothesis: Hypothesis
    blast_radius: BlastRadius
    sample: bool


class MemberOut(BaseModel):
    id: int
    type: str
    platform: str
    label: str
    url: str
    score: float
    severity: Severity
    stage: int
    stage_name: str
    status: str
    campaign_id: int | None
    source: str
    age_days: float
    logo: str | None = None


class PathStep(BaseModel):
    stage: str
    title: str
    ids: list[int]
    detail: str


class ForecastOut(BaseModel):
    window_days: int
    recent: int
    previous: int
    predicted: dict[str, int]
    predicted_total: int
    next7: int
    trend: str
    is_estimate: bool
    basis: str


class RecAction(BaseModel):
    action: str
    kind: str
    needs_approval: bool


class CampaignDetail(CampaignOut):
    members: list[MemberOut]
    path: list[PathStep]
    forecast: ForecastOut
    timeline: dict[str, Any]
    summary: SummaryOut
    recommended_actions: list[RecAction]


class GraphNode(BaseModel):
    id: str
    kind: str
    label: str
    severity: str
    x: int
    y: int
    predicted: bool = False
    sub: str = ""
    entity_id: int | None = None
    score: float | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    kind: str
    predicted: bool = False


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    attack_path: list[PathStep]
    shared: list[Shared]
    campaign_id: int


class StageCount(BaseModel):
    name: str
    count: int


class GrowthOut(BaseModel):
    days: list[int]
    labels: list[str]
    observed: list[int | None]
    forecast: list[float | None]
    band: list[list[float] | None]
    is_estimate: bool
    basis: str


class ForecastBrief(BaseModel):
    next7: int
    recent: int
    previous: int
    trend: str
    is_estimate: bool
    basis: str


class StageChange(BaseModel):
    entity: str
    entity_id: int
    from_: str = Field(alias="from")
    to: str
    at: str
    when: str
    model_config = ConfigDict(populate_by_name=True)


class TimelineEvent(BaseModel):
    at: str
    days_ago: float
    time: str
    title: str
    desc: str
    entity_id: int
    kind: str


class EvolutionOut(BaseModel):
    stages: list[StageCount]
    growth: GrowthOut
    forecast: ForecastBrief
    stage_changes: list[StageChange]
    timeline: list[TimelineEvent]
    campaign_id: int
    brand: str


class DnaFamily(BaseModel):
    name: str
    strength: float
    label: Literal["Strong", "Medium", "Weak"]
    evidence: str


class DnaClosest(BaseModel):
    playbook: str
    similarity: float
    risk: Severity
    traits: list[str]


class SideBySide(BaseModel):
    known: str
    case: str
    shared_tokens: list[str]
    case_label: str = ""
    known_label: str | None = None


class DnaMapPoint(BaseModel):
    x: float
    y: float
    cluster: str
    label: str
    kind: str
    current: bool


class DnaOut(BaseModel):
    families: list[DnaFamily]
    closest: list[DnaClosest]
    side_by_side: SideBySide
    map: list[DnaMapPoint]
    note: str
    campaign_id: int


class ConfirmOut(BaseModel):
    ok: bool
    campaign_id: int
    learned: bool
    campaigns: int


# --------------------------------------------------------------- entities ---
class EntityRow(MemberOut):
    brand_id: int
    state_code: str | None = None
    sample: bool = False


class EntityActionIn(BaseModel):
    action: Literal["confirm", "dismiss", "reopen"]


class EntityActionOut(BaseModel):
    ok: bool
    id: int
    status: str
    campaigns: list[int]


class SignalOut(BaseModel):
    name: str
    label: str
    strength: float
    weight: float
    points: float
    reason: str
    evidence: dict[str, Any]


class IdentOut(BaseModel):
    kind: str
    value: str


class EntityDetail(BaseModel):
    entity: dict[str, Any]
    signals: list[SignalOut]
    identifiers: list[IdentOut]
    campaign: CampaignOut | None
    summary: SummaryOut
    sample: bool


# ----------------------------------------------------------------- brands ---
class BrandOut(BaseModel):
    id: int
    name: str
    aliases: list[str]
    domains: list[str]
    handles: dict[str, str]
    app_ids: list[str]
    developers: list[str]
    cert_sha256: str
    permissions: list[str]
    phones: list[str]
    official_text: str
    logo_path: str | None
    logo_hash: str | None
    is_demo: bool
    entities: int = 0


# ---------------------------------------------------------------- monitor ---
class Grade(BaseModel):
    letter: Literal["A", "B", "C", "D", "F"]
    score: int


class LabelCount(BaseModel):
    label: str
    count: int


class Activity(BaseModel):
    weeks: list[str]
    new: list[float]
    confirmed: list[float]
    reported: list[float]
    includes_sample_history: bool


class SevPct(BaseModel):
    label: str
    pct: int
    count: int


class PlatformRow(BaseModel):
    name: str
    count: int
    change_pct: float
    trend: list[int]


class QueueRow(BaseModel):
    id: int
    label: str
    type: str
    platform: str
    score: float
    severity: str
    campaign_id: int | None
    first_seen: str | None


class CoverageRow(BaseModel):
    channel: str
    entities: int
    mode: str


class MonitorOut(BaseModel):
    grade: Grade
    takedown_status: list[LabelCount]
    activity: Activity
    severity: list[SevPct]
    platforms: list[PlatformRow]
    alerts: list[AlertBrief]
    queue: list[QueueRow]
    coverage: list[CoverageRow]


# -------------------------------------------------------------- simulator ---
class SimIn(BaseModel):
    campaign_id: int
    horizon_days: Literal[7, 14, 30] = 7
    assumption: Literal["repeat", "accelerate", "slow"] = "repeat"
    actions: list[str] = []
    assumed_drop_pct: float = Field(default=0, ge=0, le=100)


class SimOut(BaseModel):
    observed: list[int]
    baseline: list[float]
    acted: list[float]
    now: int
    no_action: float
    if_act: float
    pace_per_week: int
    is_estimate: bool
    method: str
    assumption_note: str
    actions: list[str]
    campaign_id: int


# ---------------------------------------------------------------- reports ---
class ReportOut(BaseModel):
    id: int
    code: str
    title: str
    scope: str
    status: Literal["draft", "ready", "approved"]
    format: Literal["pdf", "json"]
    campaign_id: int | None
    investigation_id: str | None
    approved_by: str | None
    approved_at: str | None
    created_at: str
    sample: bool = False


class ReportCreate(BaseModel):
    campaign_id: int | None = None
    investigation_id: str | None = None
    format: Literal["pdf", "json"] = "pdf"
    scope: str = "all"


class ApproveIn(BaseModel):
    scope: str | None = None


class ApproveOut(BaseModel):
    ok: bool
    report: ReportOut
    marked_reported: list[int]


# -------------------------------------------------------------- watchlist ---
class WatchOut(BaseModel):
    id: int
    brand_id: int
    kind: Literal["domain", "profile", "phone", "payment", "app"]
    value: str
    rules: dict[str, Any]
    status: Literal["stable", "changed", "spreading", "offline"]
    last_checked: str | None
    created_at: str


class WatchCreate(BaseModel):
    brand_id: int | None = None
    kind: Literal["domain", "profile", "phone", "payment", "app"]
    value: str = Field(min_length=2, max_length=300)
    rules: dict[str, Any] = {}


class WatchPatch(BaseModel):
    rules: dict[str, Any] | None = None
    status: Literal["stable", "changed", "spreading", "offline"] | None = None
    check_now: bool = False


# ---------------------------------------------------------- alerts / jobs ---
class AlertOut(BaseModel):
    id: int
    brand_id: int
    kind: str
    severity: str
    title: str
    detail: str
    entity_id: int | None
    read: bool
    sample: bool
    ago: str
    created_at: str


class ScanIn(BaseModel):
    brand_id: int | None = None
    mode: Literal["demo", "live"] = "demo"


class JobOut(BaseModel):
    id: str
    kind: str
    state: Literal["running", "done", "error"]
    progress: int
    message: str
    steps: list[Step]
    result: dict[str, Any] | None


class JobCreated(BaseModel):
    job_id: str


# --------------------------------------------------------------- evidence ---
class CustodyOut(BaseModel):
    action: str
    actor: str
    at: str


class EvidenceOut(BaseModel):
    id: int
    investigation_id: str | None
    campaign_id: int | None
    entity_id: int | None
    kind: str
    filename: str
    sha256: str
    size: int
    mime: str
    source: str
    captured_at: str
    custody: list[CustodyOut]


# ------------------------------------------------------------------ admin ---
class AuditOut(BaseModel):
    id: int
    ts: str
    actor: str | None
    action: str
    target: str
    detail: str


class IntegrationOut(BaseModel):
    name: str
    label: str
    enabled: bool
    needs_key: bool
    key_present: bool
    config: dict[str, Any]


class IntegrationIn(BaseModel):
    name: str
    enabled: bool
    config: dict[str, Any] = {}


class HealthOut(BaseModel):
    ok: bool
    time: float
    demo_mode: bool
    version: str


class MeOut(UserOut):
    default_brand_id: int | None = None
