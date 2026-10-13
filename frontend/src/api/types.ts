// Wire types of the ScamMind server (docs/API.md section 18 is authoritative). Only fields the UI reads are listed.

export type Platform = 'instagram' | 'facebook' | 'x' | 'telegram' | 'linkedin' | 'youtube' | 'google_play' | 'app_store' | 'third_party_apk';
export type DetectionType = 'fake_profile' | 'fake_brand_page' | 'scam_account' | 'fake_app';
export type DetectionStatus = 'new' | 'reviewing' | 'confirmed' | 'dismissed' | 'marked_official';
export type RiskBand = 'high' | 'medium' | 'low';
export type SourceStatus = 'online' | 'slow' | 'unavailable';
export type DataMode = 'live' | 'sample' | 'auto';
export type Category = 'social' | 'apps' | 'web';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Resolution = 'true_positive' | 'false_positive' | 'resolved' | 'monitoring';
export type ScanScope = 'all' | 'social' | 'apps';

export interface SampleFlags {
  data_mode?: 'live' | 'sample';
  is_sample?: boolean;
  includes_sample?: boolean;
}

// ---- brand -----------------------------------------------------------------
export interface LogoInfo {
  url: string;
  format: string;
  width: number;
  height: number;
  size_bytes: number;
  square: boolean;
  meets_requirements: boolean;
  sha256: string;
}
export interface OfficialAccount {
  id: number;
  platform: Platform;
  handle: string;
  url: string;
  status: 'verified' | 'unreachable';
  last_checked_at: string | null;
  source: string;
  warning?: string | null;
}
export interface OfficialApp {
  id: number;
  name: string;
  package_id: string;
  publisher: string;
  stores: string[];
  status: string;
  source: string;
}
export interface HealthCheck {
  key: string;
  label: string;
  ok: boolean;
  weight: number;
  points: number;
  why: string | null;
}
export interface Verification {
  asset_type: string;
  asset_key: string;
  status: 'unverified' | 'verified';
  method: string | null;
  note: string;
  verified_at: string | null;
  verified_by: string | null;
}
export interface Brand {
  id: number;
  name: string;
  description?: string | null;
  verifications?: Verification[];
  industry: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  logo: LogoInfo | null;
  official_accounts: OfficialAccount[];
  official_apps: OfficialApp[];
  profile_health: { percent: number; message: string; checks: HealthCheck[]; missing: { key: string; label: string; why: string | null }[] };
  allowlist: { accounts: number; apps: number; domains: number };
  official_assets: number;
  updated_at: string;
  source: string;
}
export interface BrandIdentityInput {
  name: string;
  description?: string;
  industry: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
}

// ---- detections --------------------------------------------------------------
export interface DetectionRow {
  id: number;
  category: Category;
  type: DetectionType;
  platform: Platform;
  name: string;
  handle: string | null;
  package_id: string | null;
  publisher: string | null;
  profile_url: string | null;
  score: number;
  risk_band: RiskBand;
  severity?: Severity;
  resolution?: Resolution | null;
  origin?: string;
  status: DetectionStatus;
  summary: string;
  tags: string[];
  found_at: string;
  last_seen_at: string;
  stale: boolean;
  cached_at?: string | null;
  source: string;
}
export interface DetectionList extends SampleFlags {
  total: number;
  limit: number;
  offset: number;
  counts: {
    all: number;
    by_type: Record<string, number>;
    by_platform: Record<string, number>;
    by_status: Record<string, number>;
    by_band: Record<string, number>;
  };
  items: DetectionRow[];
}
export interface Reason {
  signal: string;
  label: string;
  detail: string;
  points: number;
  max_points?: number;
}
export interface Signal {
  id: string;
  status: 'present' | 'clean' | 'unavailable';
  value?: unknown;
  points: number;
  max_points: number;
  provenance: string;
  note?: string | null;
}
export interface DetectionDetail extends DetectionRow, SampleFlags {
  signals?: Signal[];
  algorithm_version?: string | null;
  brand_id: number;
  first_seen_at: string;
  raw_total: number;
  capped: boolean;
  threshold: number;
  reasons: Reason[];
  official: {
    name: string | null;
    handle?: string | null;
    url?: string | null;
    bio?: string | null;
    followers?: string | number | null;
    joined?: string | null;
    link?: string | null;
    package_id?: string | null;
    publisher?: string | null;
    stores?: string[];
    downloads?: string | null;
    on_allowlist: boolean;
    official_publishers?: string[];
  } | null;
  suspect?: {
    bio?: string | null;
    followers?: number | string | null;
    following?: number | null;
    posts?: number | null;
    joined?: string | null;
    verified?: boolean;
    link?: string | null;
    logo_match_percent?: number | null;
    stores?: string[];
    downloads?: string | null;
    released?: string | null;
    icon_match_percent?: number | null;
    rating?: number | null;
    rating_count?: number | null;
  } | null;
  logo?: { status: string; similarity: number | null; reason: string | null } | null;
  publisher_differs?: boolean;
  official_publisher?: string | null;
  description?: { snippet: string | null; overlap_points: number } | null;
  evidence: {
    page_url: string | null;
    captured_at: string | null;
    sha256: string | null;
    snapshot_url: string | null;
    screenshot_url: string | null;
    screenshot_sha256: string | null;
  };
  notes: { at: string; actor: string; text: string; kind: string }[];
  history: { at: string; actor: string; kind: string; from: string | null; to: string | null; note: string | null }[];
}
export interface ExcludedItem {
  kind: 'account' | 'app';
  id: number;
  platform: string | null;
  label: string;
  sub?: string;
  status: string;
  reason: string;
  matched_rule?: string;
  times_seen: number;
  source: string;
}
export interface FalsePositiveItem {
  id: number;
  name: string;
  platform: Platform;
  category: Category;
  handle: string | null;
  package_id: string | null;
  publisher: string | null;
  score: number;
  name_match_percent: number | null;
  logo_match_percent: number | null;
  icon_match_percent: number | null;
  logo_note: string | null;
  reason: string;
  status: string;
}

// ---- scans -------------------------------------------------------------------
export type ScanStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';
export interface Scan extends SampleFlags {
  id: number;
  job_id: string;
  scope: ScanScope;
  status: ScanStatus;
  state: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  steps: { source: string; state: string; status?: string; checked: number; new_detections: number; message: string }[];
  result: {
    sources_checked: number;
    sources_online: number;
    accounts_or_apps_checked: number;
    new_detections: number;
    official_excluded?: number;
    partial_sources: string[];
    unavailable_sources: string[];
    finished_at: string;
  } | null;
  source_report: { collector: string; status: string; reason: string | null; message: string; data_source: string }[];
  errors: string[];
  started_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}
export interface ScanStart {
  job_id: string;
  scan_id: number;
  status: ScanStatus;
  scan: Scan;
}
export interface Scheduler {
  enabled: boolean;
  schedule: string;
  interval_minutes: number;
  paused_for_credits: boolean;
  stretched_for_credits: boolean;
  next_scan_at: string | null;
  reason: string;
}
export interface ScanStatusInfo extends SampleFlags {
  last_scan_at: string | null;
  last_scan_status: ScanStatus | null;
  last_full_sync_at: string | null;
  next_scan_at: string | null;
  schedule: string;
  running_job_id: string | null;
  scheduler: Scheduler;
}

// ---- dashboard ---------------------------------------------------------------
export interface Kpi {
  value: number;
  delta_week?: number;
  trend?: number[];
}
export interface Dashboard extends SampleFlags {
  brand: { id: number; name: string };
  kpis: { total_detections: Kpi; social_impersonations: Kpi; suspicious_apps: Kpi; official_assets: Kpi };
  by_type: { type: DetectionType; count: number; percent: number }[];
  by_platform: { platform: Platform; count: number }[];
  total_open: number;
  needs_review: { id: number; name: string; platform: Platform; type: DetectionType; found_at: string; risk_band: RiskBand; score: number }[];
  recent: { id: number; name: string; summary: string; platform: Platform; type: DetectionType; score: number; status: DetectionStatus; found_at: string; source: string }[];
  top_detection: { id: number; name: string; platform: Platform; score: number; risk_band: RiskBand; on_allowlist: boolean; tags: string[]; source: string } | null;
  why_flagged: { detection_id: number; score: number; reasons: { signal: string; label: string; detail: string; points: number }[] } | null;
  sources: SourceItem[];
  sources_online: number;
  sources_total: number;
  last_scan_at: string | null;
  last_scan: Scan | null;
  next_scan_at: string | null;
  schedule: Scheduler | null;
  credits: TavilyCredits | null;
}

// ---- sources -----------------------------------------------------------------
export interface SourceItem {
  id: number;
  slug: Platform;
  name: string;
  kind: 'social' | 'store';
  description: string;
  status: SourceStatus;
  monitored: boolean;
  message: string;
  last_sync_at: string | null;
  detail: string;
  retry_in_minutes: number | null;
  next_retry_at: string | null;
  stale_since: string | null;
  cached_at: string | null;
  cached_age_seconds: number | null;
  collectors: string[];
  source: string;
  /** What a manual retry can cost. Only Tavily-backed sources spend credits (credits > 0). */
  retry_estimate?: RetryEstimate | null;
}
export interface RetryEstimate {
  credits: number;
  provider: string | null;
  remaining: number | null;
  note: string;
}
export interface TavilyCredits {
  provider: string;
  month: string;
  used: number;
  budget: number;
  remaining: number;
  reported_used: number | null;
}
export interface SourceList {
  data_mode: 'live' | 'sample';
  is_sample?: boolean;
  requested_data_mode: DataMode;
  summary: { online: number; slow: number; unavailable: number; total: number; next_scan_at: string | null; schedule: string | null; last_full_sync_at: string | null; retry_policy: string };
  items: SourceItem[];
  reputation?: { provider: string; configured: boolean; note: string } | null;
  tavily_credits: TavilyCredits | null;
}
export interface RetryResult {
  job_id: string;
  source_id: number;
  state: string;
  status: SourceStatus;
  source: SourceItem;
  estimated_credits?: number;
}
export interface DataModeInfo {
  data_mode: DataMode;
  effective_mode: 'live' | 'sample';
  reason: string;
  chain: { name: string; active: boolean; configured: boolean; reason: string }[];
}

// ---- look-alike --------------------------------------------------------------
export type Verdict = 'flagged' | 'not_flagged' | 'official';
export interface LookalikeResult {
  input: string;
  brand: string;
  verdict: Verdict;
  official_basis: string | null;
  match_percent: number;
  headline: string;
  explanation: string;
  reasons: { rule: string; label: string }[];
  normalization: { step: number; label: string; value: string }[];
  on_allowlist: boolean;
  edit_distance: number;
}
export interface TestCaseRun {
  total: number;
  passed: number;
  failed: number;
  summary: string;
  ran_at: string;
  items: { id: number; name: string; expected: Verdict; result: Verdict; pass: boolean; match_percent: number; builtin: boolean }[];
}
export interface TestCaseList {
  total: number;
  items: { id: number; name: string; expected: Verdict; builtin: boolean; source: string }[];
}

// ---- settings ----------------------------------------------------------------
export interface Rules {
  character_swaps: boolean;
  digits_and_symbols: boolean;
  added_words: boolean;
  spacing_and_separators: boolean;
  transposed_or_missing: boolean;
}
export type Schedule = 'off' | '5m' | '15m' | '1h' | '1d';
export interface Settings {
  data_mode: DataMode;
  effective_data_mode: 'live' | 'sample';
  monitoring: {
    schedule: Schedule;
    sources: Record<string, boolean>;
    sensitivity: number;
    threshold: number;
    rules: Rules;
    impersonation_words: string[];
  };
  scheduler: Scheduler | null;
  notifications: { email_alerts: boolean; high_risk_immediate: boolean; weekly_digest: boolean; webhook_url: string; webhook_configured: boolean; delivery: string };
  account: { organization: string; user: { name: string; email: string; role: string } };
  updated_at: string | null;
}
export interface SettingsUpdate {
  monitoring?: Partial<Settings['monitoring']>;
  notifications?: Partial<Pick<Settings['notifications'], 'email_alerts' | 'high_risk_immediate' | 'weekly_digest' | 'webhook_url'>>;
  data_mode?: DataMode;
}
export interface SensitivityPreview extends SampleFlags {
  sensitivity: number;
  threshold: number;
  would_review: number;
  total: number;
  message: string;
}

// ---- reports -----------------------------------------------------------------
export interface ReportPreview extends SampleFlags {
  title: string;
  brand: string;
  from: string | null;
  to: string | null;
  stats: { detections: number; social: number; apps: number; confirmed: number; official_excluded: number };
  include_evidence: boolean;
  rows: { n: number; id: number; name: string; platform: Platform; type: DetectionType; score: number; status: DetectionStatus }[];
}
export interface Report {
  id: number;
  title: string;
  filename: string;
  format: 'csv' | 'html';
  status: 'draft' | 'approved';
  size_bytes: number;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  count: number;
  detection_ids: number[];
  stats: ReportPreview['stats'];
  includes_sample: boolean;
  source: string;
  download_url: string;
  preview_url: string;
  csv_url: string;
  html_url: string;
}
export interface ReportCreate {
  detection_ids?: number[];
  from?: string | null;
  to?: string | null;
  types?: DetectionType[];
  status?: string | null;
  include_evidence: boolean;
  format: 'csv' | 'html';
  title?: string;
}

// ---- evaluation --------------------------------------------------------------
export interface TechniqueScore {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  n_pos: number;
  label_ok: number;
}
export interface Evaluation extends SampleFlags {
  label: string;
  synthetic: {
    seed: number;
    per_technique: number;
    brands: number;
    computed_at: string;
    cached: boolean;
    by_technique: (TechniqueScore & { technique: string })[];
    overall: TechniqueScore;
    false_positives: unknown[];
    confusion?: {
      matrix: { tp: number; fp: number; fn: number; tn: number };
      false_positive_rate: number;
      false_negative_rate: number;
      accuracy: number;
      total_cases: number;
      negative_groups: { group: string; n: number; flagged: number; false_positive_rate: number }[];
    };
    dataset?: { name: string; version: string; size: number; synthetic: boolean; brands: string[]; split: string; banner: string };
    algorithm_version?: { social_app: string; web: string };
    ml_classifier?: string;
  };
  by_category?: { category: string; total: number; confirmed: number; dismissed: number; precision: number | null }[];
  lookalike_tests: TestCaseRun & {
    true_positives: number;
    false_negatives: number;
    false_positives: number;
    true_negatives: number;
    precision: number | null;
    recall: number | null;
    flagged_expected: number;
    not_flagged_expected: number;
    official_expected: number;
  };
  reviewed: { confirmed: number; dismissed: number; marked_official: number; pending: number };
  detection: { true_positives: number; false_positives: number; precision: number | null; definition: string };
  by_type: { type: string; confirmed: number; dismissed: number; precision: number | null }[];
}

export type Me = ApiMe;
interface ApiMe {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  active?: boolean;
  default_brand_id?: number | null;
}

// ---- providers / import ----------------------------------------------------------
export interface ProviderInfo {
  name: string;
  label: string;
  configured: boolean;
  model: string | null;
  needs_key: boolean;
  reason: string | null;
  active: boolean;
}
export interface Providers {
  active_text_provider: string;
  hosted_text_analysis_enabled: boolean;
  text_providers: ProviderInfo[];
  image_similarity_backend: string;
  note: string;
}
export interface ImportRow {
  row: number;
  status: string;
  detection_id: number | null;
  score?: number | null;
  severity?: string | null;
  message: string | null;
}
export interface ImportReport {
  dry_run: boolean;
  total: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  created: number;
  updated: number;
  official: number;
  results: ImportRow[];
}
