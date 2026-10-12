// Mock & sample data for ScamMind AI (Brand: Acme Bank)

export interface KPICardData {
  title: string;
  value: string;
  change: string;
  isGood: boolean;
  trend: number[];
  color: 'blue' | 'red' | 'violet' | 'green';
}

export const KPI_DATA: KPICardData[] = [
  {
    title: 'Total Investigations',
    value: '2,487',
    change: '↑ 12%',
    isGood: true,
    trend: [1800, 1950, 2100, 2250, 2350, 2410, 2487],
    color: 'blue'
  },
  {
    title: 'Active Threats',
    value: '326',
    change: '↑ 8%',
    isGood: false,
    trend: [260, 275, 290, 285, 310, 318, 326],
    color: 'red'
  },
  {
    title: 'Suspicious Apps',
    value: '1,092',
    change: '↑ 25%',
    isGood: false,
    trend: [720, 780, 850, 910, 990, 1040, 1092],
    color: 'violet'
  },
  {
    title: 'Fake Profiles Found',
    value: '4,586',
    change: '↑ 18%',
    isGood: false,
    trend: [3400, 3650, 3900, 4120, 4300, 4480, 4586],
    color: 'green'
  }
];

export interface StateThreat {
  state: string;
  threats: number;
  change: string;
  severity: 'High' | 'Medium' | 'Low';
}

export const STATE_THREATS: StateThreat[] = [
  { state: 'Maharashtra', threats: 482, change: '↑ 12%', severity: 'High' },
  { state: 'Uttar Pradesh', threats: 398, change: '↑ 18%', severity: 'High' },
  { state: 'Delhi', threats: 356, change: '↑ 25%', severity: 'High' },
  { state: 'Karnataka', threats: 290, change: '↑ 14%', severity: 'Medium' },
  { state: 'Tamil Nadu', threats: 268, change: '↑ 11%', severity: 'Low' }
];

export interface ThreatCategory {
  label: string;
  percentage: number;
  color: string;
}

export const THREAT_CATEGORIES: ThreatCategory[] = [
  { label: 'Fake Profiles', percentage: 38, color: '#FF5C5C' },
  { label: 'Phishing Websites', percentage: 26, color: '#5AA9FF' },
  { label: 'Suspicious Apps', percentage: 18, color: '#A855F7' },
  { label: 'Impersonation', percentage: 12, color: '#FF9A4D' },
  { label: 'Others', percentage: 6, color: '#34D399' }
];

export interface CampaignSummary {
  name: string;
  entities: number;
  risk: 'Critical' | 'High' | 'Medium';
}

export const SCAM_CAMPAIGNS: CampaignSummary[] = [
  { name: 'Acme Bank KYC Scam', entities: 17, risk: 'Critical' },
  { name: 'UPI Reward Scam', entities: 12, risk: 'High' },
  { name: 'Banking Support Scam', entities: 9, risk: 'High' },
  { name: 'Government Scheme Scam', entities: 8, risk: 'Medium' }
];

export interface CriticalAlert {
  id: string;
  title: string;
  timeAgo: string;
  severity: 'Critical' | 'High' | 'Medium';
}

export const CRITICAL_ALERTS: CriticalAlert[] = [
  { id: '1', title: 'Fake Acme Bank support account detected', timeAgo: '2 minutes ago', severity: 'High' },
  { id: '2', title: 'Malicious Android app found', timeAgo: '18 minutes ago', severity: 'High' },
  { id: '3', title: 'Phishing website detected', timeAgo: '1 hour ago', severity: 'Medium' },
  { id: '4', title: 'Fraudulent phone number', timeAgo: '3 hours ago', severity: 'Medium' },
  { id: '5', title: 'Impersonation campaign', timeAgo: '5 hours ago', severity: 'High' }
];

export interface RecentInvestigation {
  id: number;
  input: string;
  type: string;
  result: string;
  riskScore: number;
  status: 'Malicious' | 'Suspicious' | 'Clean';
  dateTime: string;
}

export const RECENT_INVESTIGATIONS: RecentInvestigation[] = [
  {
    id: 1,
    input: 'acme-support-help.com',
    type: 'Website',
    result: 'Phishing Domain',
    riskScore: 92,
    status: 'Malicious',
    dateTime: '11 Oct 2026, 10:42 AM'
  },
  {
    id: 2,
    input: 'com.acme.support.help.apk',
    type: 'Android App',
    result: 'Suspicious App',
    riskScore: 88,
    status: 'Malicious',
    dateTime: '11 Oct 2026, 09:58 AM'
  },
  {
    id: 3,
    input: '+91 98765 43210',
    type: 'Phone Number',
    result: 'Fraudulent Contact',
    riskScore: 84,
    status: 'Suspicious',
    dateTime: '11 Oct 2026, 08:03 AM'
  },
  {
    id: 4,
    input: '@acme_support_india',
    type: 'Social Profile',
    result: 'Fake Profile',
    riskScore: 94,
    status: 'Malicious',
    dateTime: '10 Oct 2026, 07:41 PM'
  },
  {
    id: 5,
    input: 'upi-reward-offer.in',
    type: 'Website',
    result: 'Scam Page',
    riskScore: 86,
    status: 'Malicious',
    dateTime: '10 Oct 2026, 05:12 PM'
  }
];

export const TOOL_CARDS = [
  {
    id: 'profile',
    title: 'Profile Investigation',
    description: 'Analyze social media profiles for impersonation and scam signals.',
    route: '/investigate',
    iconColor: 'blue'
  },
  {
    id: 'website',
    title: 'Website Analysis',
    description: 'Scan and detect phishing websites and malicious domains.',
    route: '/investigate',
    iconColor: 'red'
  },
  {
    id: 'app',
    title: 'App Analysis',
    description: 'Upload APK files to detect suspicious behaviour and permissions.',
    route: '/apps',
    iconColor: 'green'
  },
  {
    id: 'graph',
    title: 'Threat Graph',
    description: 'Discover connected entities and the complete scam network.',
    route: '/graph',
    iconColor: 'violet'
  },
  {
    id: 'simulator',
    title: 'Threat Simulator',
    description: 'Predict how the threat may evolve and simulate future risks.',
    route: '/simulator',
    iconColor: 'amber'
  }
];

// Investigation Detail Data
export const INVESTIGATION_DETAIL = {
  caseId: 'INV-2026-0142',
  target: 'acrnebank-refund.com',
  type: 'Domain',
  mode: 'Deep investigation',
  assignedTo: 'Harini',
  riskScore: 78,
  severity: 'High' as const,
  classifications: [
    { label: 'Phishing', percentage: 86 },
    { label: 'Impersonation', percentage: 94 },
    { label: 'Scam', percentage: 72 },
    { label: 'Suspicious', percentage: 64 },
    { label: 'Malware', percentage: 18 }
  ],
  keyFindings: [
    'Domain is newly registered (4 days ago)',
    'Name reads as the trusted brand once look-alikes are normalised',
    'Found in malicious URL reports',
    'Page asks for card number, CVV and OTP',
    'Linked to 7 related fake profiles'
  ],
  evidenceCount: 12,
  summary:
    'acrnebank-refund.com is very likely impersonating Acme Bank (risk 78 out of 100). Its name reads as the brand once "rn" is read as "m", it was registered 4 days ago, it can send email as the brand, and its page asks for card number, CVV and OTP. It is linked to 7 fake profiles through one payment ID.',
  relatedEntities: [
    { entity: 'acrnebank-refund.com', type: 'Domain', risk: 'High', link: 'Verified' },
    { entity: '@acme_refund_help', type: 'Instagram profile', risk: 'Critical', link: 'Verified' },
    { entity: 'acme_refund_desk', type: 'Telegram channel', risk: 'High', link: 'Inferred' },
    { entity: '+91 90000 12345', type: 'Phone number', risk: 'Medium', link: 'Inferred' },
    { entity: 'acrnebank-refund.com/acme-refund.apk', type: 'URL', risk: 'Critical', link: 'Verified' },
    { entity: 'acmerefund@okaxis', type: 'Payment ID', risk: 'Critical', link: 'Verified' }
  ],
  actions: [
    { title: 'Block / report', desc: 'Report to the registrar and host' },
    { title: 'Monitor for similar activity', desc: 'Watch look-alikes of acmebank.com' },
    { title: 'Verify with official source', desc: "Confirm with the brand's own team" },
    { title: 'Escalate for analysis', desc: 'Assign to a senior analyst' }
  ]
};
