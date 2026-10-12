// Advanced datasets for Threat Graph, Evolution, DNA, Apps, Brand, Simulator, Reports, Watchlist

export const THREAT_GRAPH_DATA = {
  brandNode: { id: 'acme-bank', label: 'Acme Bank (official)', type: 'brand', x: 450, y: 55 },
  nodes: [
    { id: 'payment-1', label: 'acmerefund@okaxis', type: 'identifier', risk: 'critical', x: 330, y: 270 },
    { id: 'domain-1', label: 'acrnebank-refund.com', type: 'website', risk: 'critical', x: 590, y: 250 },
    { id: 'telegram-1', label: 't.me/acme_refund_desk', type: 'social', risk: 'high', x: 450, y: 420 },
    { id: 'logo-1', label: 'same edited logo', type: 'identifier', risk: 'high', x: 230, y: 400 },
    { id: 'social-1', label: '@acme_refund_help', type: 'social', risk: 'critical', x: 200, y: 200 },
    { id: 'social-2', label: '@acmebank.support.official', type: 'social', risk: 'high', x: 210, y: 280 },
    { id: 'social-3', label: '@acme_bank_care', type: 'social', risk: 'high', x: 340, y: 170 },
    { id: 'social-4', label: '@AcmeBankHelp24', type: 'social', risk: 'medium', x: 120, y: 350 },
    { id: 'social-5', label: 'acmebankrefundcenter', type: 'social', risk: 'high', x: 260, y: 480 },
    { id: 'social-6', label: '@acrnebank_care', type: 'social', risk: 'high', x: 580, y: 430 },
    { id: 'social-7', label: 'acme_refund_desk', type: 'social', risk: 'high', x: 470, y: 490 },
    { id: 'social-8', label: '@acme.refunds.now', type: 'social', risk: 'medium', x: 360, y: 450 },
    { id: 'website-2', label: 'acrnebank-refund.com', type: 'website', risk: 'critical', x: 640, y: 370 },
    { id: 'app-1', label: 'Acme Refund Assistant', type: 'app', risk: 'critical', x: 780, y: 380 },
    // Ghost predicted nodes
    { id: 'ghost-1', label: 'predicted (estimate)', type: 'ghost', risk: 'medium', x: 730, y: 230 },
    { id: 'ghost-2', label: 'predicted (estimate)', type: 'ghost', risk: 'medium', x: 780, y: 480 },
    { id: 'ghost-3', label: 'predicted (estimate)', type: 'ghost', risk: 'medium', x: 670, y: 490 }
  ],
  edges: [
    { from: 'acme-bank', to: 'social-1', dashed: true },
    { from: 'acme-bank', to: 'domain-1', dashed: true },
    { from: 'social-1', to: 'payment-1', attackPath: true },
    { from: 'social-1', to: 'telegram-1', attackPath: true },
    { from: 'telegram-1', to: 'domain-1', attackPath: true },
    { from: 'domain-1', to: 'app-1', attackPath: true },
    { from: 'app-1', to: 'payment-1', attackPath: true },
    { from: 'social-2', to: 'payment-1' },
    { from: 'social-3', to: 'payment-1' },
    { from: 'social-4', to: 'logo-1' },
    { from: 'social-5', to: 'logo-1' },
    { from: 'logo-1', to: 'payment-1' },
    { from: 'social-6', to: 'domain-1' },
    { from: 'social-7', to: 'telegram-1' },
    { from: 'social-8', to: 'telegram-1' },
    { from: 'domain-1', to: 'website-2' },
    { from: 'domain-1', to: 'ghost-1', dashed: true },
    { from: 'app-1', to: 'ghost-2', dashed: true },
    { from: 'website-2', to: 'ghost-3', dashed: true }
  ],
  attackSteps: [
    { step: 1, name: 'Lure', detail: '@acme_refund_help on Instagram', sub: 'Posing as the brand' },
    { step: 2, name: 'Hand-off', detail: 'Moves the victim to Telegram', sub: 'Leaves the platform' },
    { step: 3, name: 'Redirect', detail: 'acrnebank-refund.com', sub: 'Registered 4 days ago' },
    { step: 4, name: 'Install', detail: 'Fake app: Acme Refund Assistant', sub: 'Sideloaded, asks for SMS access' },
    { step: 5, name: 'Payment', detail: 'Victim pays acmerefund@okaxis', sub: '6 entities share this ID', current: true },
    { step: 6, name: 'Victim', detail: 'Money or credentials are taken', sub: 'The customer blames the brand' }
  ],
  linksTable: [
    { type: 'Payment ID', value: 'acmerefund@okaxis', count: 6 },
    { type: 'Domain', value: 'acrnebank-refund.com', count: 6 },
    { type: 'Telegram handle', value: 'acme_refund_desk', count: 3 },
    { type: 'Edited logo', value: 'same edited copy of the official logo', count: 8 }
  ]
};

export const THREAT_EVOLUTION_DATA = {
  stages: [
    { name: 'Normal', count: 2, color: '#34D399', desc: 'Looks normal' },
    { name: 'Anomaly', count: 1, color: '#5AA9FF', desc: 'Slightly unusual' },
    { name: 'Suspicious', count: 1, color: '#F5C542', desc: 'Several signals' },
    { name: 'Impersonation', count: 0, color: '#FF9A4D', desc: 'Strong resemblance' },
    { name: 'Campaign', count: 9, color: '#FF5C5C', desc: 'Linked to others' },
    { name: 'Active scam', count: 8, color: '#FF5C5C', desc: 'Money or data asked' }
  ],
  growthTimeline: [
    { day: '-11d', observed: 1 },
    { day: '-9d', observed: 1 },
    { day: '-7d', observed: 2 },
    { day: '-5d', observed: 2 },
    { day: '-3d', observed: 4 },
    { day: '-1d', observed: 7 },
    { day: 'today', observed: 10, forecast: 10, lower: 10, upper: 10 },
    { day: '+1d', forecast: 12, lower: 11, upper: 13 },
    { day: '+3d', forecast: 14, lower: 12, upper: 16 },
    { day: '+5d', forecast: 16, lower: 13, upper: 19 },
    { day: '+7d', forecast: 18, lower: 14, upper: 22 }
  ],
  stageChanges: [
    { entity: '@acme_refund_help', from: 'Suspicious', to: 'Active scam', when: '3 days ago' },
    { entity: 'acrnebank-refund.com', from: 'Impersonation', to: 'Active scam', when: '3 days ago' },
    { entity: 'Acme Refund Assistant', from: 'Impersonation', to: 'Campaign', when: '3 days ago' },
    { entity: '@acme.refunds.now', from: 'Anomaly', to: 'Campaign', when: '1 day ago' }
  ],
  timeline: [
    { time: '1 day ago', title: '@acme.refunds.now appears', desc: 'Links to the Telegram channel' },
    { time: '2 days ago', title: 'Telegram channel and @acrnebank_care appear', desc: 'Both point to the look-alike domain' },
    { time: '3 days ago', title: '@acme_refund_help and the fake app appear', desc: 'First profile with the payment ID' },
    { time: '4 days ago', title: 'acrnebank-refund.com registered', desc: 'Reads as the brand once rn is read as m' },
    { time: '5 days ago', title: '@acmebank.support.official appears', desc: 'Shares the payment ID and Telegram handle' },
    { time: '11 days ago', title: 'Facebook page acmebankrefundcenter appears', desc: 'First entity in the campaign' }
  ]
};

export const SCAM_DNA_DATA = {
  radarAxes: [
    { axis: 'Identity', current: 0.92, baseline: 0.50 },
    { axis: 'Visual', current: 0.94, baseline: 0.45 },
    { axis: 'Language', current: 0.88, baseline: 0.60 },
    { axis: 'Behaviour', current: 0.64, baseline: 0.75 },
    { axis: 'Infrastructure', current: 0.90, baseline: 0.40 },
    { axis: 'Network', current: 0.78, baseline: 0.55 }
  ],
  reasons: [
    { name: 'Identity', strength: 'Strong', percent: 92, note: 'Handles repeat the brand name plus words like refund and care' },
    { name: 'Visual', strength: 'Strong', percent: 94, note: 'Eight entities use the same edited copy of the logo' },
    { name: 'Language', strength: 'Strong', percent: 88, note: 'Near-identical refund script across profiles' },
    { name: 'Behaviour', strength: 'Medium', percent: 64, note: 'Bursts of posts, mass following' },
    { name: 'Infrastructure', strength: 'Strong', percent: 90, note: 'One look-alike domain, one payment ID' },
    { name: 'Network', strength: 'Medium', percent: 78, note: 'Shared Telegram handle links accounts' }
  ],
  closestCampaigns: [
    { playbook: 'Refund scam playbook', wording: 'Script wording, payment request, DM for refund', similarity: '48%', risk: 'Critical' },
    { playbook: 'Fake customer-care number', wording: 'Call-us wording, OTP request', similarity: '31%', risk: 'High' },
    { playbook: 'Fake giveaway or reward', wording: 'Processing fee, limited time', similarity: '22%', risk: 'Medium' },
    { playbook: 'KYC / account-update phishing', wording: 'Account will be blocked wording', similarity: '19%', risk: 'Medium' }
  ],
  sideBySide: {
    playbook: 'DM us for your refund. Pay a small verification fee to claim your refund. Send a screenshot of the payment.',
    actual: 'Official Acme Bank refund desk. DM us for your refund. Pay ₹10 verification fee to acmerefund@okaxis to release it within 24 hours.'
  },
  learningLoop: ['Confirmed campaign', 'Extract Attack DNA', 'Update knowledge', 'Compare new activity', 'Detect earlier']
};

export const APP_ANALYSIS_DATA = {
  verdictScore: 89,
  verdictLabel: 'Critical Risk',
  verdictSeverity: 'Critical' as const,
  verdictDesc: 'Counterfeit app that asks for SMS and accessibility access and contacts a look-alike site.',
  officialApp: {
    name: 'Acme Bank',
    pkg: 'com.acmebank.mobile',
    source: 'Google Play, 3M installs'
  },
  thisApp: {
    name: 'Acme Refund Assistant',
    pkg: 'com.acrnebank.refund',
    source: 'Sideloaded, 420 installs'
  },
  iconSimilarity: 94,
  staticIndicators: [
    { check: 'Package name', finding: 'Reads as the brand once rn is read as m', flag: 'Look-alike' },
    { check: 'Developer', finding: 'AcmeRefund Tech, not Acme Bank Ltd', flag: 'Mismatch' },
    { check: 'Signing certificate', finding: 'Differs from the official app', flag: 'Mismatch' },
    { check: 'Distribution', finding: 'Sideloaded from the look-alike site', flag: 'Outside store' },
    { check: 'Released', finding: '3 days ago', flag: 'New' },
    { check: 'Installs', finding: '420', flag: 'Low' }
  ],
  permissions: [
    { name: 'INTERNET', desc: 'Standard network access', status: 'Normal' },
    { name: 'READ_SMS', desc: 'Not requested by the official app. Can read one-time passwords or draw over other apps.', status: 'Risky' },
    { name: 'RECEIVE_SMS', desc: 'Not requested by the official app. Can read one-time passwords or draw over other apps.', status: 'Risky' },
    { name: 'SYSTEM_ALERT_WINDOW', desc: 'Not requested by the official app. Can read one-time passwords or draw over other apps.', status: 'Risky' },
    { name: 'BIND_ACCESSIBILITY_SERVICE', desc: 'Not requested by the official app. Can read one-time passwords or draw over other apps.', status: 'Risky' }
  ],
  embeddedUrls: [
    { url: 'https://acrnebank-refund.com/api/collect', note: 'Matches the look-alike site found in this scan', tag: 'Suspicious' },
    { url: 'https://acrnebank-refund.com/acme-refund.apk', note: 'Where the app was downloaded from', tag: 'Source' }
  ]
};

export const BRAND_MONITOR_DATA = {
  grade: 'D',
  score: 72,
  takedowns: [
    { label: 'Awaiting review', count: 12 },
    { label: 'Confirmed', count: 5 },
    { label: 'Reported', count: 8 },
    { label: 'In progress at platform', count: 10 },
    { label: 'Removed by platform', count: 6 },
    { label: 'Dismissed as safe', count: 4 }
  ],
  activityWeeks: [
    { week: 'W1', newThreats: 14, inReview: 10, takenDown: 8 },
    { week: 'W2', newThreats: 18, inReview: 12, takenDown: 9 },
    { week: 'W3', newThreats: 15, inReview: 14, takenDown: 11 },
    { week: 'W4', newThreats: 22, inReview: 16, takenDown: 13 },
    { week: 'W5', newThreats: 25, inReview: 19, takenDown: 14 },
    { week: 'W6', newThreats: 20, inReview: 17, takenDown: 16 },
    { week: 'W7', newThreats: 28, inReview: 21, takenDown: 18 },
    { week: 'W8', newThreats: 32, inReview: 24, takenDown: 20 },
    { week: 'W9', newThreats: 30, inReview: 22, takenDown: 22 },
    { week: 'W10', newThreats: 36, inReview: 28, takenDown: 24 },
    { week: 'W11', newThreats: 41, inReview: 31, takenDown: 26 },
    { week: 'W12', newThreats: 45, inReview: 34, takenDown: 29 }
  ],
  severities: [
    { label: 'Info', count: 15, color: '#5AA9FF' },
    { label: 'Low', count: 25, color: '#34D399' },
    { label: 'Medium', count: 30, color: '#F5C542' },
    { label: 'High', count: 20, color: '#FF9A4D' },
    { label: 'Critical', count: 10, color: '#FF5C5C' }
  ],
  platforms: [
    { name: 'Facebook', count: 16, change: '↑ 8%', bars: [8, 10, 11, 13, 12, 14, 15, 15, 16] },
    { name: 'Instagram', count: 35, change: '↑ 14%', bars: [18, 20, 22, 25, 27, 29, 31, 33, 35] },
    { name: 'X', count: 12, change: '↑ 4%', bars: [9, 9, 10, 10, 11, 11, 12, 12, 12] },
    { name: 'Telegram', count: 16, change: '↑ 22%', bars: [7, 8, 9, 11, 12, 13, 14, 15, 16] },
    { name: 'Websites', count: 45, change: '↑ 18%', bars: [24, 27, 30, 32, 35, 38, 40, 42, 45] }
  ]
};

export const SIMULATOR_DATA = {
  observed: [2, 3, 4, 5, 7, 8, 10],
  doNothing: [10, 11, 13, 14, 16, 17, 18],
  actToday: [10, 9, 8, 7, 6, 5, 4],
  comparison: {
    now: { profiles: 8, websites: 1, apps: 1 },
    doNothing: { profiles: 14, websites: 2, apps: 2 },
    actToday: { profiles: 9, websites: 1, apps: 1 }
  }
};

export const REPORTS_DATA = [
  { id: 'REP-2026-089', title: 'Acme Bank Refund Scam Dossier', scope: 'Campaign C-1', status: 'Draft', format: 'PDF', date: '11 Oct 2026' },
  { id: 'REP-2026-088', title: 'Mobile APK Forensic Extract', scope: 'com.acrnebank.refund', status: 'Ready', format: 'JSON', date: '11 Oct 2026' },
  { id: 'REP-2026-085', title: 'Look-alike Domain Threat Advisory', scope: 'acrnebank-refund.com', status: 'Approved', format: 'PDF', date: '10 Oct 2026' },
  { id: 'REP-2026-082', title: 'Weekly Brand Protection Digest', scope: 'Acme Bank Ecosystem', status: 'Approved', format: 'PDF', date: '08 Oct 2026' },
  { id: 'REP-2026-079', title: 'Telegram Scam Syndicate Dossier', scope: 'Synd-44', status: 'Draft', format: 'PDF', date: '05 Oct 2026' }
];

export const WATCHLIST_DATA = [
  { id: 1, entity: 'acrnebank-refund.com', type: 'Domain', status: 'Changed', active: true, dateAdded: '07 Oct 2026' },
  { id: 2, entity: '@acme_refund_help', type: 'Social Profile', status: 'Spreading', active: true, dateAdded: '08 Oct 2026' },
  { id: 3, entity: 'acmerefund@okaxis', type: 'Payment ID', status: 'Stable', active: true, dateAdded: '09 Oct 2026' },
  { id: 4, entity: 'com.acrnebank.refund', type: 'Android APK', status: 'Changed', active: true, dateAdded: '09 Oct 2026' },
  { id: 5, entity: 't.me/acme_refund_desk', type: 'Telegram', status: 'Spreading', active: true, dateAdded: '10 Oct 2026' },
  { id: 6, entity: '+91 90000 12345', type: 'Phone Number', status: 'Stable', active: true, dateAdded: '10 Oct 2026' }
];
