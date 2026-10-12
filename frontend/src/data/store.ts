import React, { createContext, useContext, useState, useEffect } from 'react';

export interface OfficialAccount {
  id: string;
  platform: 'Instagram' | 'X' | 'Facebook' | 'LinkedIn' | 'YouTube';
  handle: string;
  url: string;
  status: 'Verified' | 'Unreachable';
}

export interface OfficialApp {
  id: string;
  name: string;
  packageId: string;
  publisher: string;
  stores: string[];
  status: 'Verified';
}

export interface DetectionReason {
  label: string;
  points: number;
}

export interface DetectionEvidence {
  screenshot?: string;
  url: string;
  timestamp: string;
  sha256: string;
}

export interface Detection {
  id: string;
  type: 'fake_profile' | 'fake_brand_page' | 'scam_account' | 'fake_app';
  category: 'social' | 'apps';
  platform: 'Instagram' | 'X' | 'Facebook' | 'Telegram' | 'LinkedIn' | 'Google Play' | 'App Store' | 'Third-party APK';
  name: string;
  handleOrPackage: string;
  score: number;
  status: 'New' | 'Reviewing' | 'Confirmed' | 'Dismissed' | 'Marked official';
  summary: string;
  publisher?: string;
  reasons: DetectionReason[];
  tags: string[];
  evidence: DetectionEvidence;
  foundAt: string;
  followers?: string;
  joined?: string;
  downloads?: string;
  released?: string;
  bioSnippet?: string;
  descriptionSnippet?: string;
  descriptionKeywords?: string[];
  overlapPercent?: number;
  logoMatchPercent?: number;
  iconMatchPercent?: number;
}

export interface SourceItem {
  id: string;
  name: string;
  description: string;
  status: 'Online' | 'Slow' | 'Unavailable';
  isMonitored: boolean;
  lastSync: string;
  syncDetail: string;
  statusMessage?: string;
  retryMinutes?: number;
}

export interface AuditLogItem {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
}

export interface BrandProfile {
  name: string;
  industry: string;
  aliases: string[];
  keywords: string[];
  domains: string[];
  logo: {
    format: string;
    dimensions: string;
    size: string;
    isSquare: boolean;
  };
}

const INITIAL_BRAND: BrandProfile = {
  name: 'Acme Bank',
  industry: 'Banking and financial services',
  aliases: ['Acme', 'AcmeBank', 'Acme Bank India'],
  keywords: ['acme', 'acmebank', '#AcmeBank'],
  domains: ['acmebank.com', 'acmebank.in'],
  logo: {
    format: 'PNG',
    dimensions: '512 × 512 px',
    size: '84 KB (max 2 MB)',
    isSquare: true,
  },
};

const INITIAL_ACCOUNTS: OfficialAccount[] = [
  { id: 'acc-1', platform: 'Instagram', handle: '@acmebank', url: 'instagram.com/acmebank', status: 'Verified' },
  { id: 'acc-2', platform: 'X', handle: '@AcmeBank', url: 'x.com/AcmeBank', status: 'Verified' },
  { id: 'acc-3', platform: 'Facebook', handle: 'acmebank', url: 'facebook.com/acmebank', status: 'Verified' },
  { id: 'acc-4', platform: 'LinkedIn', handle: 'company/acmebank', url: 'linkedin.com/company/acmebank', status: 'Verified' },
  { id: 'acc-5', platform: 'YouTube', handle: '@acmebank', url: 'youtube.com/@acmebank', status: 'Unreachable' },
];

const INITIAL_APPS: OfficialApp[] = [
  { id: 'app-1', name: 'Acme Bank Mobile', packageId: 'com.acmebank.mobile', publisher: 'Acme Bank Ltd', stores: ['Google Play', 'App Store'], status: 'Verified' },
  { id: 'app-2', name: 'Acme UPI', packageId: 'com.acmebank.upi', publisher: 'Acme Bank Ltd', stores: ['Google Play'], status: 'Verified' },
];

const INITIAL_DETECTIONS: Detection[] = [
  {
    id: 'det-1',
    category: 'social',
    type: 'scam_account',
    platform: 'Instagram',
    name: 'Acme Bank Support Care',
    handleOrPackage: '@acrne_bank_support',
    score: 94,
    status: 'New',
    summary: '“rn” reads as “m”, added word “support”',
    tags: ['“rn” reads as “m”', 'Added word: support', 'Logo 91% match', 'Bio asks for KYC'],
    reasons: [
      { label: 'Name similarity · “acrne” reads as “acme” (rn → m)', points: 34 },
      { label: 'Added word · “support”', points: 10 },
      { label: 'Logo match · 91% match with the official logo', points: 25 },
      { label: 'Bio content · Asks for KYC details in DMs', points: 17 },
      { label: 'Account signals · 12 days old, 214 followers', points: 8 },
    ],
    evidence: {
      url: 'instagram.com/acrne_bank_support',
      timestamp: '12 Oct, 11:58 AM',
      sha256: '9f3a8b27c1d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    },
    foundAt: '12 Oct, 11:58 AM',
    followers: '214',
    joined: '12 days ago',
    bioSnippet: 'Official Acme Bank support. DM us your KYC details to avoid account block.',
    logoMatchPercent: 91,
  },
  {
    id: 'det-2',
    category: 'apps',
    type: 'fake_app',
    platform: 'Google Play',
    name: 'Acme Bank Support Help',
    handleOrPackage: 'com.acme.support.help',
    score: 91,
    status: 'Reviewing',
    publisher: 'Quick Tools Studio',
    summary: 'Different publisher, icon 93% match',
    tags: ['Brand name plus "Support Help"', 'Icon 93% match', 'Different publisher', '88% wording match'],
    reasons: [
      { label: 'Name similarity · Brand name plus “Support Help”', points: 22 },
      { label: 'Icon match · 93% match with the official icon', points: 28 },
      { label: 'Publisher differs · Quick Tools Studio, not Acme Bank Ltd', points: 20 },
      { label: 'Description overlap · 88% similar wording', points: 14 },
      { label: 'Store signals · 500+ downloads, released 6 days ago', points: 7 },
    ],
    evidence: {
      url: 'play.google.com/store/apps/details?id=com.acme.support.help',
      timestamp: '12 Oct, 11:42 AM',
      sha256: 'b4a8e23f10928cd94827103abdf928c0192847aef9281734bcdef92837461928',
    },
    foundAt: '12 Oct, 11:42 AM',
    downloads: '500+',
    released: 'released 6 days ago',
    descriptionSnippet: 'Secure mobile banking support from Acme Bank. Check balance, transfer funds and raise a support ticket.',
    descriptionKeywords: ['secure mobile banking', 'check balance', 'transfer funds'],
    overlapPercent: 88,
    iconMatchPercent: 93,
  },
  {
    id: 'det-3',
    category: 'social',
    type: 'fake_brand_page',
    platform: 'Facebook',
    name: 'Acme Bank Official Helpline',
    handleOrPackage: 'AcmeBankOfficialHelpline',
    score: 88,
    status: 'Reviewing',
    summary: 'Added words, logo 84% match',
    tags: ['Added words', 'Logo 84% match'],
    reasons: [
      { label: 'Name similarity · Acme Bank + Official Helpline', points: 28 },
      { label: 'Logo match · 84% match with official assets', points: 24 },
      { label: 'Bio content · Customer support contact numbers', points: 22 },
      { label: 'Account signals · Unofficial phone numbers posted', points: 14 },
    ],
    evidence: {
      url: 'facebook.com/AcmeBankOfficialHelpline',
      timestamp: '12 Oct, 10:55 AM',
      sha256: 'a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01',
    },
    foundAt: '12 Oct, 10:55 AM',
    followers: '1.2K',
    joined: '1 month ago',
    bioSnippet: '24/7 Acme Bank customer helpline desk. Call our toll-free support helpline.',
    logoMatchPercent: 84,
  },
  {
    id: 'det-4',
    category: 'social',
    type: 'fake_profile',
    platform: 'X',
    name: 'Acme Bank India',
    handleOrPackage: '@acmebank.india',
    score: 91,
    status: 'Confirmed',
    summary: 'Added word “india”, logo copied',
    tags: ['Added word "india"', 'Logo copied'],
    reasons: [
      { label: 'Name similarity · Exact brand name + "india"', points: 32 },
      { label: 'Logo match · 95% match with official brand', points: 26 },
      { label: 'Bio content · Mimicking official PR channel', points: 20 },
      { label: 'Account signals · Created this month', points: 13 },
    ],
    evidence: {
      url: 'x.com/acmebank.india',
      timestamp: '11 Oct, 7:30 PM',
      sha256: 'c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01234',
    },
    foundAt: '11 Oct, 7:30 PM',
    followers: '89',
    joined: 'October 2026',
    bioSnippet: 'Updates and news from Acme Bank India regional office.',
    logoMatchPercent: 95,
  },
  {
    id: 'det-5',
    category: 'apps',
    type: 'fake_app',
    platform: 'Google Play',
    name: 'Acme Bnak Mobile',
    handleOrPackage: 'com.mobileappshub.acmebnak',
    score: 93,
    status: 'Confirmed',
    publisher: 'Mobile Apps Hub',
    summary: 'Letters swapped, icon 95% match',
    tags: ['Letters swapped', 'Icon 95% match'],
    reasons: [
      { label: 'Name similarity · "Bnak" transposed from "Bank"', points: 24 },
      { label: 'Icon match · 95% visual replica', points: 30 },
      { label: 'Publisher differs · Mobile Apps Hub', points: 22 },
      { label: 'Description overlap · Exact copies of banking features', points: 17 },
    ],
    evidence: {
      url: 'play.google.com/store/apps/details?id=com.mobileappshub.acmebnak',
      timestamp: '11 Oct, 4:12 PM',
      sha256: 'd4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0123456',
    },
    foundAt: '11 Oct, 4:12 PM',
    downloads: '1K+',
    released: 'released 2 weeks ago',
    descriptionSnippet: 'Official online banking app for Acme Bnak customers.',
    iconMatchPercent: 95,
  },
  {
    id: 'det-6',
    category: 'social',
    type: 'fake_profile',
    platform: 'Telegram',
    name: 'A C M E Bank',
    handleOrPackage: 'acme bank',
    score: 82,
    status: 'New',
    summary: 'Spacing change, asks for loan fees',
    tags: ['Spacing change', 'Asks for loan fees'],
    reasons: [
      { label: 'Name similarity · Spaced letter variation "A C M E Bank"', points: 24 },
      { label: 'Channel content · Loan approval with processing advance fee', points: 28 },
      { label: 'Logo match · Unofficial derivative', points: 18 },
      { label: 'Account signals · Anonymous public channel', points: 12 },
    ],
    evidence: {
      url: 't.me/acmebankloans',
      timestamp: '11 Oct, 9:05 AM',
      sha256: 'e5f67890123456789abcdef0123456789abcdef0123456789abcdef012345678',
    },
    foundAt: '11 Oct, 9:05 AM',
    followers: '450 members',
    joined: '3 weeks ago',
    bioSnippet: 'Instant instant loan sanction for Acme Bank account holders. Contact admin for fees.',
    logoMatchPercent: 78,
  },
  {
    id: 'det-7',
    category: 'social',
    type: 'scam_account',
    platform: 'Instagram',
    name: 'Acme Bank Rewards',
    handleOrPackage: '@acme_bank_rewards',
    score: 90,
    status: 'New',
    summary: 'Added word “rewards”, suspicious cashback links',
    tags: ['Added word "rewards"', 'Suspicious links'],
    reasons: [
      { label: 'Name similarity · Brand name + "rewards"', points: 28 },
      { label: 'Logo match · 89% match with official logo', points: 24 },
      { label: 'Bio content · Cash rewards claim with shortlinks', points: 22 },
      { label: 'Account signals · Low engagement, new registration', points: 16 },
    ],
    evidence: {
      url: 'instagram.com/acme_bank_rewards',
      timestamp: '12 Oct, 8:30 AM',
      sha256: 'f67890123456789abcdef0123456789abcdef0123456789abcdef0123456789a',
    },
    foundAt: '12 Oct, 8:30 AM',
    followers: '512',
    joined: '5 days ago',
    bioSnippet: 'Claim your 5,000 INR Acme Bank festival reward points here: link-claim.cc',
    logoMatchPercent: 89,
  },
  {
    id: 'det-8',
    category: 'apps',
    type: 'fake_app',
    platform: 'Third-party APK',
    name: 'Acme Bank Mobile Lite',
    handleOrPackage: 'com.acme.bank.lite.apk',
    score: 89,
    status: 'New',
    publisher: 'Unknown mirror',
    summary: 'Untrusted APK mirror distributing repackaged app',
    tags: ['Repackaged app', 'Different publisher'],
    reasons: [
      { label: 'Name similarity · Brand name + "Mobile Lite"', points: 22 },
      { label: 'Icon match · 92% match', points: 27 },
      { label: 'Publisher differs · Unknown distributor', points: 22 },
      { label: 'Distribution · APK direct download site', points: 18 },
    ],
    evidence: {
      url: 'apkmirror-vault.xyz/download/acme-lite',
      timestamp: '12 Oct, 7:15 AM',
      sha256: '07890123456789abcdef0123456789abcdef0123456789abcdef0123456789ab',
    },
    foundAt: '12 Oct, 7:15 AM',
    downloads: '100+',
    released: 'released 4 hours ago',
    descriptionSnippet: 'Lightweight banking APK for low RAM smartphones.',
    iconMatchPercent: 92,
  },
  {
    id: 'det-9',
    category: 'apps',
    type: 'fake_app',
    platform: 'Google Play',
    name: 'AcmeBank Rewards UPI',
    handleOrPackage: 'com.finrewards.acmebank',
    score: 87,
    status: 'New',
    publisher: 'FinRewards Dev',
    summary: 'Unauthorized reward app requesting bank permissions',
    tags: ['Added words', 'Third-party publisher'],
    reasons: [
      { label: 'Name similarity · Brand name concatenated + "Rewards UPI"', points: 20 },
      { label: 'Icon match · 85% match', points: 24 },
      { label: 'Publisher differs · FinRewards Dev', points: 21 },
      { label: 'Description overlap · 75% overlap with payment app', points: 14 },
      { label: 'Store signals · Requests SMS & Contacts permissions', points: 8 },
    ],
    evidence: {
      url: 'play.google.com/store/apps/details?id=com.finrewards.acmebank',
      timestamp: '11 Oct, 11:20 PM',
      sha256: '1890123456789abcdef0123456789abcdef0123456789abcdef0123456789abc',
    },
    foundAt: '11 Oct, 11:20 PM',
    downloads: '1K+',
    released: 'released 10 days ago',
    descriptionSnippet: 'Link your Acme Bank account to earn instant cashback on UPI transactions.',
    iconMatchPercent: 85,
  },
  {
    id: 'det-10',
    category: 'apps',
    type: 'fake_app',
    platform: 'App Store',
    name: 'Acme Bank KYC Update',
    handleOrPackage: 'com.kycupdate.acmeapp',
    score: 85,
    status: 'New',
    publisher: 'App Utilities Lab',
    summary: 'Fake utility app posing as mandatory KYC validator',
    tags: ['KYC impersonation', 'Fake publisher'],
    reasons: [
      { label: 'Name similarity · Brand name + "KYC Update"', points: 22 },
      { label: 'Icon match · 82% match', points: 23 },
      { label: 'Publisher differs · App Utilities Lab', points: 20 },
      { label: 'Description overlap · Threatens account suspension', points: 15 },
      { label: 'Store signals · Very recent listing', points: 5 },
    ],
    evidence: {
      url: 'apps.apple.com/app/id9876543210',
      timestamp: '11 Oct, 2:40 PM',
      sha256: '290123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd',
    },
    foundAt: '11 Oct, 2:40 PM',
    downloads: '100+',
    released: 'released 3 days ago',
    descriptionSnippet: 'Mandatory online KYC document upload for Acme Bank account holders.',
    iconMatchPercent: 82,
  },
  {
    id: 'det-11',
    category: 'social',
    type: 'fake_profile',
    platform: 'X',
    name: 'Acme Bnk',
    handleOrPackage: '@acmebnk',
    score: 76,
    status: 'Reviewing',
    summary: 'Vowel omission in handle, asks for login details',
    tags: ['Vowel omission', 'Asks for login details'],
    reasons: [
      { label: 'Name similarity · Vowel omission "bnk" instead of "bank"', points: 22 },
      { label: 'Logo match · 75% match with old corporate branding', points: 19 },
      { label: 'Bio content · Customer support redirection link', points: 20 },
      { label: 'Account signals · 3 followers', points: 15 },
    ],
    evidence: {
      url: 'x.com/acmebnk',
      timestamp: '11 Oct, 1:15 PM',
      sha256: '30123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde',
    },
    foundAt: '11 Oct, 1:15 PM',
    followers: '3',
    joined: 'Yesterday',
    bioSnippet: 'Acme Bnk official direct resolution team for banking problems.',
    logoMatchPercent: 75,
  },
];

const INITIAL_SOURCES: SourceItem[] = [
  {
    id: 'src-1',
    name: 'Instagram',
    description: 'Public profile and page search',
    status: 'Online',
    isMonitored: true,
    lastSync: '11:58 AM',
    syncDetail: '214 profiles checked',
    statusMessage: 'Working normally.',
  },
  {
    id: 'src-2',
    name: 'Facebook',
    description: 'Page and profile search',
    status: 'Online',
    isMonitored: true,
    lastSync: '11:55 AM',
    syncDetail: '96 pages checked',
    statusMessage: 'Working normally.',
  },
  {
    id: 'src-3',
    name: 'X',
    description: 'Profile search',
    status: 'Online',
    isMonitored: true,
    lastSync: '11:57 AM',
    syncDetail: '138 profiles checked',
    statusMessage: 'Working normally.',
  },
  {
    id: 'src-4',
    name: 'Telegram',
    description: 'Public channels and groups',
    status: 'Slow',
    isMonitored: true,
    lastSync: '11:31 AM',
    syncDetail: '41 of about 120 checked',
    statusMessage: 'Rate limited. Partial results are kept. Retrying automatically in 4 minutes.',
    retryMinutes: 4,
  },
  {
    id: 'src-5',
    name: 'LinkedIn',
    description: 'Company page search',
    status: 'Online',
    isMonitored: true,
    lastSync: '11:50 AM',
    syncDetail: '22 pages checked',
    statusMessage: 'Working normally.',
  },
  {
    id: 'src-6',
    name: 'Google Play',
    description: 'Store search and listing details',
    status: 'Online',
    isMonitored: true,
    lastSync: '11:58 AM',
    syncDetail: '310 apps checked',
    statusMessage: 'Working normally.',
  },
  {
    id: 'src-7',
    name: 'Apple App Store',
    description: 'Store search and listing details',
    status: 'Unavailable',
    isMonitored: true,
    lastSync: '9:40 AM',
    syncDetail: 'Cached results shown',
    statusMessage: 'The store could not be reached. Showing cached results from 9:40 AM. They are marked as stale on the app page.',
  },
  {
    id: 'src-8',
    name: 'Third-party APK sites',
    description: 'Mirror and download site lookup',
    status: 'Online',
    isMonitored: true,
    lastSync: '11:40 AM',
    syncDetail: '58 listings checked',
    statusMessage: 'Working normally. Coverage is limited to known mirror sites.',
  },
];

const INITIAL_AUDIT_LOG: AuditLogItem[] = [
  { id: 'log-1', user: 'Harini', action: 'Instagram scan finished', target: '2 new detections', time: '11:58 AM' },
  { id: 'log-2', user: 'Harini', action: 'Telegram rate limited', target: 'partial results kept', time: '11:31 AM' },
  { id: 'log-3', user: 'Harini', action: 'Google Play scan finished', target: '1 new detection', time: '11:42 AM' },
  { id: 'log-4', user: 'System', action: 'Apple App Store unreachable', target: 'using cached results', time: '9:41 AM' },
  { id: 'log-5', user: 'Harini', action: 'Brand profile saved', target: 'allowlist refreshed', time: '9:12 AM' },
];

export interface AppSettings {
  scanSchedule: string;
  sensitivity: number;
  monitoredPlatforms: Record<string, boolean>;
  rules: {
    characterSwaps: boolean;
    digitsAndSymbols: boolean;
    addedWords: boolean;
    spacingAndSeparators: boolean;
    transposedOrMissing: boolean;
  };
  impersonationWords: string[];
  notifications: {
    emailAlerts: boolean;
    highRiskImmediate: boolean;
    weeklyDigest: boolean;
    webhookUrl: string;
  };
}

const INITIAL_SETTINGS: AppSettings = {
  scanSchedule: 'Every 5 minutes',
  sensitivity: 75,
  monitoredPlatforms: {
    Instagram: true,
    Facebook: true,
    X: true,
    Telegram: true,
    LinkedIn: true,
    'Google Play': true,
    'Apple App Store': true,
    'Third-party APK sites': true,
  },
  rules: {
    characterSwaps: true,
    digitsAndSymbols: true,
    addedWords: true,
    spacingAndSeparators: true,
    transposedOrMissing: true,
  },
  impersonationWords: ['support', 'helpline', 'official', 'refund', 'rewards', 'kyc'],
  notifications: {
    emailAlerts: true,
    highRiskImmediate: true,
    weeklyDigest: true,
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXXX',
  },
};

interface AppContextType {
  brand: BrandProfile;
  setBrand: React.Dispatch<React.SetStateAction<BrandProfile>>;
  officialAccounts: OfficialAccount[];
  setOfficialAccounts: React.Dispatch<React.SetStateAction<OfficialAccount[]>>;
  officialApps: OfficialApp[];
  setOfficialApps: React.Dispatch<React.SetStateAction<OfficialApp[]>>;
  detections: Detection[];
  setDetections: React.Dispatch<React.SetStateAction<Detection[]>>;
  sources: SourceItem[];
  setSources: React.Dispatch<React.SetStateAction<SourceItem[]>>;
  auditLog: AuditLogItem[];
  addAuditLog: (action: string, target: string) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  updateDetectionStatus: (id: string, status: Detection['status']) => void;
  markAsOfficial: (detectionId: string) => void;
  addOfficialAccount: (platform: OfficialAccount['platform'], handle: string) => void;
  removeOfficialAccount: (id: string) => void;
  addOfficialApp: (name: string, packageId: string, publisher: string, stores: string[]) => void;
  removeOfficialApp: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_PREFIX = 'scammind_v2_';

function getStored<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(STORAGE_PREFIX + key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, value: T) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [brand, setBrand] = useState<BrandProfile>(() => getStored('brand', INITIAL_BRAND));
  const [officialAccounts, setOfficialAccounts] = useState<OfficialAccount[]>(() =>
    getStored('accounts', INITIAL_ACCOUNTS)
  );
  const [officialApps, setOfficialApps] = useState<OfficialApp[]>(() =>
    getStored('apps', INITIAL_APPS)
  );
  const [detections, setDetections] = useState<Detection[]>(() =>
    getStored('detections', INITIAL_DETECTIONS)
  );
  const [sources, setSources] = useState<SourceItem[]>(() =>
    getStored('sources', INITIAL_SOURCES)
  );
  const [auditLog, setAuditLog] = useState<AuditLogItem[]>(() =>
    getStored('auditLog', INITIAL_AUDIT_LOG)
  );
  const [settings, setSettings] = useState<AppSettings>(() =>
    getStored('settings', INITIAL_SETTINGS)
  );

  useEffect(() => setStored('brand', brand), [brand]);
  useEffect(() => setStored('accounts', officialAccounts), [officialAccounts]);
  useEffect(() => setStored('apps', officialApps), [officialApps]);
  useEffect(() => setStored('detections', detections), [detections]);
  useEffect(() => setStored('sources', sources), [sources]);
  useEffect(() => setStored('auditLog', auditLog), [auditLog]);
  useEffect(() => setStored('settings', settings), [settings]);

  const addAuditLog = (action: string, target: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newEntry: AuditLogItem = {
      id: `log-${Date.now()}`,
      user: 'Harini',
      action,
      target,
      time: timeStr,
    };
    setAuditLog((prev) => [newEntry, ...prev]);
  };

  const updateDetectionStatus = (id: string, status: Detection['status']) => {
    setDetections((prev) =>
      prev.map((det) => (det.id === id ? { ...det, status } : det))
    );
    const item = detections.find((d) => d.id === id);
    if (item) {
      addAuditLog(`Updated detection status to "${status}"`, item.handleOrPackage);
    }
  };

  const markAsOfficial = (detectionId: string) => {
    const item = detections.find((d) => d.id === detectionId);
    if (!item) return;

    if (item.category === 'social') {
      const newAcc: OfficialAccount = {
        id: `acc-${Date.now()}`,
        platform: (item.platform as any) || 'X',
        handle: item.handleOrPackage,
        url: item.evidence.url,
        status: 'Verified',
      };
      setOfficialAccounts((prev) => [...prev, newAcc]);
    } else {
      const newApp: OfficialApp = {
        id: `app-${Date.now()}`,
        name: item.name,
        packageId: item.handleOrPackage,
        publisher: item.publisher || 'Acme Bank Ltd',
        stores: [item.platform],
        status: 'Verified',
      };
      setOfficialApps((prev) => [...prev, newApp]);
    }

    updateDetectionStatus(detectionId, 'Marked official');
    addAuditLog('Added to allowlist (marked official)', item.handleOrPackage);
  };

  const addOfficialAccount = (platform: OfficialAccount['platform'], handle: string) => {
    let cleanHandle = handle.trim();
    if (!cleanHandle.startsWith('@') && platform !== 'Facebook' && platform !== 'LinkedIn') {
      cleanHandle = '@' + cleanHandle;
    }
    const domainMap: Record<string, string> = {
      Instagram: 'instagram.com/',
      X: 'x.com/',
      Facebook: 'facebook.com/',
      LinkedIn: 'linkedin.com/company/',
      YouTube: 'youtube.com/@',
    };
    const url = (domainMap[platform] || '') + cleanHandle.replace(/^@/, '');
    const newAcc: OfficialAccount = {
      id: `acc-${Date.now()}`,
      platform,
      handle: cleanHandle,
      url,
      status: 'Verified',
    };
    setOfficialAccounts((prev) => [...prev, newAcc]);
    addAuditLog('Added official account', `${platform} ${cleanHandle}`);
  };

  const removeOfficialAccount = (id: string) => {
    const item = officialAccounts.find((a) => a.id === id);
    setOfficialAccounts((prev) => prev.filter((a) => a.id !== id));
    if (item) {
      addAuditLog('Removed official account', `${item.platform} ${item.handle}`);
    }
  };

  const addOfficialApp = (name: string, packageId: string, publisher: string, stores: string[]) => {
    const newApp: OfficialApp = {
      id: `app-${Date.now()}`,
      name,
      packageId,
      publisher,
      stores,
      status: 'Verified',
    };
    setOfficialApps((prev) => [...prev, newApp]);
    addAuditLog('Added official app', `${name} (${packageId})`);
  };

  const removeOfficialApp = (id: string) => {
    const item = officialApps.find((a) => a.id === id);
    setOfficialApps((prev) => prev.filter((a) => a.id !== id));
    if (item) {
      addAuditLog('Removed official app', `${item.name}`);
    }
  };

  return React.createElement(
    AppContext.Provider,
    {
      value: {
        brand,
        setBrand,
        officialAccounts,
        setOfficialAccounts,
        officialApps,
        setOfficialApps,
        detections,
        setDetections,
        sources,
        setSources,
        auditLog,
        addAuditLog,
        settings,
        setSettings,
        updateDetectionStatus,
        markAsOfficial,
        addOfficialAccount,
        removeOfficialAccount,
        addOfficialApp,
        removeOfficialApp,
      },
    },
    children
  );
};


export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
};
