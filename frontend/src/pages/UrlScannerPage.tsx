import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle, ExternalLink } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { ErrorBox, Loading, NoBrand } from '../components/common/States';
import { ApiError } from '../api/client';
import { sm } from '../api/sm';
import { useBrand } from '../hooks/useBrand';
import type { UrlTestResult, UrlVerdict } from '../api/types';
import './UrlScannerPage.css';

const VERDICT_META: Record<
  UrlVerdict,
  { label: string; cls: string; icon: React.ReactNode; desc: string }
> = {
  official: {
    label: 'Trusted — Official domain',
    cls: 'us-verdict-official',
    icon: <ShieldCheck size={28} />,
    desc: 'This domain is one of the registered official domains of the brand.',
  },
  lookalike: {
    label: 'Lookalike — High risk',
    cls: 'us-verdict-lookalike',
    icon: <ShieldAlert size={28} />,
    desc: 'This domain closely resembles the brand but is not official. It is likely used for phishing or impersonation.',
  },
  related: {
    label: 'Suspicious — Review needed',
    cls: 'us-verdict-related',
    icon: <AlertTriangle size={28} />,
    desc: 'This domain shares signals with the brand. It may be suspicious — review before trusting.',
  },
  unrelated: {
    label: 'No threat detected',
    cls: 'us-verdict-unrelated',
    icon: <ShieldCheck size={28} />,
    desc: 'This domain does not resemble the brand. No look-alike signals were found.',
  },
  not_comparable: {
    label: 'Cannot be analysed',
    cls: 'us-verdict-neutral',
    icon: <ShieldQuestion size={28} />,
    desc: 'The address could not be parsed into a domain, or is an IP address. Check that it is a valid URL.',
  },
};

export const UrlScannerPage: React.FC = () => {
  const { brand, missing } = useBrand();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UrlTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    const url = input.trim();
    if (!url) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await sm.lookalikeTestUrl(url);
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not analyse the URL. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <Header
      title="Fake URL Scanner"
      subtitle="Paste any URL to instantly check whether it is trusted, suspicious, or a known lookalike"
    />
  );

  if (missing) {
    return (
      <>
        {header}
        <div className="panel-content">
          <NoBrand />
        </div>
      </>
    );
  }

  const v = result ? VERDICT_META[result.verdict] : null;

  return (
    <>
      {header}
      <div className="panel-content us-page">

        {/* input card */}
        <div className="card us-input-card">
          <div className="us-input-head">
            <Link2 size={18} />
            <span>Enter a URL or domain to scan</span>
            {brand && (
              <span className="us-brand-tag">
                Checking against: <strong>{brand.name}</strong>
                {brand.domains?.length ? ` · ${brand.domains.join(', ')}` : ''}
              </span>
            )}
          </div>
          <div className="us-input-row">
            <input
              type="text"
              className="us-url-input"
              placeholder="https://example-brand.com  or  fakebank.net"
              value={input}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void scan(); }}
            />
            <button
              type="button"
              className="btn-primary us-scan-btn"
              disabled={loading || !input.trim()}
              onClick={() => void scan()}
            >
              {loading ? 'Scanning…' : 'Scan URL'}
            </button>
          </div>
          <p className="us-input-note">
            The URL is never opened. No network request is made to the target site.
            {result?.reputation_checked === false && ' (Reputation check not available — no Safe Browsing key configured.)'}
          </p>
        </div>

        {loading && <Loading what="Analysing URL" />}
        {error && <ErrorBox error={new ApiError(0, error, {})} compact />}

        {result && v && (
          <div className={`card us-result-card ${v.cls}`}>
            <div className="us-verdict-banner">
              <span className="us-verdict-icon">{v.icon}</span>
              <div className="us-verdict-text">
                <div className="us-verdict-label">{v.label}</div>
                <div className="us-verdict-desc">{v.desc}</div>
              </div>
              <div className="us-score-block">
                <div className="us-score-num">{result.score}</div>
                <div className="us-score-lbl">/ 100</div>
              </div>
            </div>

            {/* domain breakdown */}
            <div className="us-domain-row">
              <span className="us-domain-part us-subdomain">{result.parts.subdomain ? `${result.parts.subdomain}.` : ''}</span>
              <span className="us-domain-part us-label">{result.parts.domain_label}</span>
              <span className="us-domain-part us-tld">.{result.parts.tld}</span>
              {result.parts.port != null && <span className="us-domain-part us-port">:{result.parts.port}</span>}
            </div>

            {/* meta chips */}
            <div className="us-chips-row">
              {result.techniques.map((t) => (
                <span key={t} className="chip chip-blue">{t}</span>
              ))}
              {result.name_match_percent != null && (
                <span className="chip chip-purple">Name match {result.name_match_percent}%</span>
              )}
              {result.compared_with && (
                <span className="chip chip-neutral">Compared with {result.compared_with}</span>
              )}
              {result.reputation_note && (
                <span className="chip chip-neutral">{result.reputation_note}</span>
              )}
            </div>

            {/* signals */}
            {result.reasons.length > 0 && (
              <div className="us-signals">
                <div className="us-section-title">Signals found</div>
                {result.reasons.map((r, i) => (
                  <div key={i} className="us-signal-row">
                    <span className="us-signal-note">{r.note}</span>
                    <span className="us-signal-pts">+{r.points} pts</span>
                  </div>
                ))}
              </div>
            )}

            {/* parts */}
            {result.parts.ok && result.parts.registrable_domain && (
              <details className="us-parts-details">
                <summary>How the address was parsed</summary>
                <div className="us-parts-table">
                  {(
                    [
                      ['Input', result.input],
                      ['Hostname', result.parts.hostname],
                      result.parts.is_idn ? ['IDN (shown as)', result.parts.hostname_unicode] : null,
                      ['Subdomain', result.parts.subdomain_labels.length ? result.parts.subdomain_labels.join(' . ') : 'none'],
                      ['Registrable domain', result.parts.registrable_domain],
                      ['Top-level domain', `.${result.parts.tld}`],
                      result.parts.has_credentials ? ['Warning', 'Has user@ credentials (known phishing trick)'] : null,
                    ] as ([string, string | null] | null)[]
                  )
                    .filter((x): x is [string, string | null] => x !== null)
                    .map(([lbl, val]) => (
                      <div key={lbl} className="us-part-row">
                        <span className="us-part-lbl">{lbl}</span>
                        <span className="us-part-val">{val}</span>
                      </div>
                    ))}
                </div>
              </details>
            )}

            {result.verdict === 'lookalike' || result.verdict === 'related' ? (
              <div className="us-warning-note">
                <AlertTriangle size={14} />
                Do not click links to this domain. If you received it in a message, it may be a phishing attempt.
              </div>
            ) : null}

            {result.verdict === 'official' && (
              <div className="us-safe-note">
                <ShieldCheck size={14} />
                This is a registered official domain. You can proceed safely.
              </div>
            )}
          </div>
        )}

        {/* how it works */}
        <div className="card us-info-card">
          <div className="us-info-title">How the scanner works</div>
          <ul className="us-info-list">
            <li>The URL is parsed locally — the target site is never contacted.</li>
            <li>The registrable domain (e.g. <em>acmebank.net</em>) is compared with {brand?.name ?? 'your brand'}'s name and official domains.</li>
            <li>Look-alike techniques checked: TLD swaps, typos, homoglyphs (look-alike letters), added words, deceptive subdomains.</li>
            <li>
              For deeper investigation, go to{' '}
              <Link to="/web" className="us-link">Web Threats</Link> or use the{' '}
              <Link to="/lookalike" className="us-link">Look-alike Lab</Link>.
            </li>
          </ul>
          <p className="us-safe-note" style={{ marginTop: '0.75rem' }}>
            <ExternalLink size={13} />
            A clean result here does not mean the site is safe — it only means the domain does not resemble your brand.
          </p>
        </div>

      </div>
    </>
  );
};
