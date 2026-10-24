import { useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  FileText,
  FlaskConical,
  Globe,
  LayoutGrid,
  ListChecks,
  Lock,
  Mic,
  Palette,
  ScanText,
  Search,
  ShieldCheck,
  SlidersVertical,
  Smartphone,
  Upload,
  Users,
} from 'lucide-react';

interface Feature {
  title: string;
  role: string;
  summary: string;
  points: string[];
  hue: number;
  icon: LucideIcon;
}

const FEATURES: Feature[] = [
  {
    title: 'Overview dashboard',
    role: 'Everyone signed in',
    summary: 'How exposed the brand is right now: detections found, where they were found, and what needs a decision.',
    points: ['Four headline numbers with this week\'s change', 'A needs-review list you can open straight from the page', 'Source health at a glance'],
    hue: 210,
    icon: LayoutGrid,
  },
  {
    title: 'Brand registry',
    role: 'Set up once, switch any time',
    summary: 'Describe the brand you protect: its names, keywords, official domains, social accounts, apps and logo.',
    points: ['Aliases, keywords and official domains', 'Official accounts and apps are never flagged', 'Up to 10 brands per account; switch from the sidebar'],
    hue: 175,
    icon: ShieldCheck,
  },
  {
    title: 'Guided setup',
    role: 'First run',
    summary: 'A three-step start: confirm the brand, add its official assets, then run the first scan.',
    points: ['Step 1: brand identity and logo', 'Step 2: official social accounts and apps', 'Step 3: choose what to scan and start it'],
    hue: 145,
    icon: ListChecks,
  },
  {
    title: 'Social threats',
    role: 'Analysts review',
    summary: 'Fake profiles, fake brand pages and scam accounts on social platforms, each with a score and reason.',
    points: ['Filter by type, platform, risk band and severity', 'Evidence: profile link, capture time and SHA-256 hash', 'Confirm, keep reviewing, dismiss or mark as official'],
    hue: 345,
    icon: Users,
  },
  {
    title: 'App threats',
    role: 'Analysts review',
    summary: 'Look-alike apps from the App Store and Google Play, compared with your official apps, publishers and logo.',
    points: ['The app icon is compared with your logo', 'Publisher and package checks against your official apps', 'Dismiss as a false positive or confirm'],
    hue: 270,
    icon: Smartphone,
  },
  {
    title: 'Web threats',
    role: 'Analysts review',
    summary: 'Look-alike domains, checked against your registered domains. Your own domain is verified first.',
    points: ['Registrable-domain comparison: typos, swapped endings, added words', 'Google Safe Browsing reputation when a key is configured', 'Addresses are compared, never opened by the app'],
    hue: 235,
    icon: Globe,
  },
  {
    title: 'Look-alike Lab',
    role: 'Test before you scan',
    summary: 'Try a name, a web address or a logo against your brand and see the reasons before anything reaches a scan.',
    points: ['Name tester with handle and platform rules', 'Domain tester with official and look-alike examples', 'Logo comparison with perceptual hashes, and CLIP AI when installed'],
    hue: 40,
    icon: ScanText,
  },
  {
    title: 'Investigations',
    role: 'Analysts',
    summary: 'Turn detections into cases: set the status, record a resolution and a note, and keep every change in the audit log.',
    points: ['Statuses: new, reviewing, confirmed, dismissed', 'Resolutions: true positive, false positive, resolved, monitoring', 'Every change is audited'],
    hue: 28,
    icon: Search,
  },
  {
    title: 'Reports',
    role: 'Analysts',
    summary: 'Evidence-backed reports for detections over a period. A person approves each report before it is shared.',
    points: ['Evidence lists the SHA-256 hash, capture time and page URL', 'Exports as printable HTML or CSV', 'Nothing is sent or taken down automatically'],
    hue: 220,
    icon: FileText,
  },
  {
    title: 'Source health',
    role: 'Administrators only',
    summary: 'Every data source the scans use, with its status, latency and last error, plus the monthly search-credit counter.',
    points: ['Online, slow or unavailable, with a retry', 'Switch monitoring on or off per source', 'Search credits used this month'],
    hue: 152,
    icon: Activity,
  },
  {
    title: 'Model evaluation',
    role: 'Administrators only',
    summary: 'How accurate the detector is: precision, recall and F1 for each technique, measured on the built-in test set.',
    points: ['Results broken down by technique', 'Run it again after a change to the rules'],
    hue: 285,
    icon: FlaskConical,
  },
  {
    title: 'Settings',
    role: 'Administrators only',
    summary: 'How scans run: schedule, sensitivity, notification rules, the data mode and the AI provider.',
    points: ['Monitoring schedule and a sensitivity preview', 'Sample or live data, always labelled as such', 'Every change is written to the audit log'],
    hue: 215,
    icon: SlidersVertical,
  },
  {
    title: 'Brand Studio',
    role: 'Built in, one sign-in',
    summary: 'AI tools for naming, logos, colour palettes and copy. Register a new brand in BrandShield in one step.',
    points: ['Name ideas with availability checks', 'Logo generation and colour palettes', 'Protect the new brand in BrandShield with one click'],
    hue: 320,
    icon: Palette,
  },
  {
    title: 'Voice assistant',
    role: 'Chrome or Edge',
    summary: 'Press the button or say "Hey Elva". It greets you by name and can work the page for you.',
    points: ['Say "open reports" or "scroll down"', 'Fills fields by voice, including emails and phone numbers', 'Asks one question when a value is missing; never fills passwords'],
    hue: 190,
    icon: Mic,
  },
  {
    title: 'Candidate import',
    role: 'Analysts',
    summary: 'Add a suspicious profile, app or web address by hand, or import a file when you already have a list.',
    points: ['Single entries for social, app and web', 'CSV or JSON import with a row-by-row report', 'Imported rows are scored and reviewed like scan results'],
    hue: 85,
    icon: Upload,
  },
  {
    title: 'Accounts and roles',
    role: 'Everyone',
    summary: 'Each account owns its own brands. Viewers read, analysts review and scan, administrators change settings.',
    points: ['Roles: viewer, analyst, administrator', 'Create an account, or try the demo account', 'Sign-ins and changes are written to an audit log'],
    hue: 200,
    icon: Lock,
  },
];

export function FeatureCarousel() {
  const track = useRef<HTMLDivElement>(null);

  const slide = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.fc-card');
    const gap = 20;
    el.scrollBy({ left: direction * ((card?.offsetWidth ?? 360) + gap), behavior: 'smooth' });
  };

  return (
    <section id="features" className="fc" aria-labelledby="fc-title">
      <div className="fc-head">
        <span className="eyebrow">Everything in the app</span>
        <h2 id="fc-title" className="fc-h2">Every feature, in one place</h2>
        <p className="fc-lead">Swipe the cards or use the arrows. Pages only administrators can open are labelled.</p>
      </div>
      <div className="fc-track" ref={track} role="region" aria-label="BrandShield features" tabIndex={0}>
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <article className="fc-card" key={f.title}>
              <div className="fc-media">
                <div
                  className="fc-tile"
                  aria-hidden="true"
                  style={{ '--fc-hue': f.hue } as React.CSSProperties}
                >
                  <Icon size={64} strokeWidth={1.4} />
                </div>
              </div>
              <div className="fc-body">
                <span className="fc-role">{f.role}</span>
                <h3 className="fc-title">{f.title}</h3>
                <p className="fc-text">{f.summary}</p>
                <ul className="fc-list">
                  {f.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
      <div className="fc-nav">
        <button type="button" className="fc-btn" aria-label="Previous feature" onClick={() => slide(-1)}>
          <ArrowLeft size={18} />
        </button>
        <button type="button" className="fc-btn" aria-label="Next feature" onClick={() => slide(1)}>
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
