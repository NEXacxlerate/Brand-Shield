import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sm } from '../../api/sm';
import { isAbortError } from '../../api/client';
import type { Brand, LogoAlgorithms, LogoCompareResult, LogoEngineStatus, LogoVerdict } from '../../api/types';
import { setBrandCache } from '../../hooks/useBrand';
import { LOGO_MAX_BYTES, sniffImageFormat } from '../../utils/logoCheck';
import { Notice } from './States';
import './LogoCompareCard.css';

const VERDICT_LABEL: Record<LogoVerdict, string> = {
  same_logo: 'Same logo',
  very_similar: 'Very similar',
  somewhat_similar: 'Somewhat similar',
  different: 'Different',
};
const VERDICT_TONE: Record<LogoVerdict, 'red' | 'orange' | 'green'> = { same_logo: 'red', very_similar: 'red', somewhat_similar: 'orange', different: 'green' };
const ALGO_LABEL: { key: keyof LogoAlgorithms; label: string }[] = [
  { key: 'phash', label: 'pHash (overall shape)' },
  { key: 'dhash', label: 'dHash (edges and gradients)' },
  { key: 'whash', label: 'wHash (coarse structure)' },
  { key: 'colorhash', label: 'Colour mix' },
];

const CLIP_HINT = 'pip install fastembed';

/** Type and size check before upload; the server stays the authority and its own message is always shown. */
export async function precheckImage(file: File, what: string): Promise<string> {
  if (file.size > LOGO_MAX_BYTES) return `The ${what} is larger than 2 MB`;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!file.size || !sniffImageFormat(head)) return `The ${what} must be a PNG, JPEG or WebP picture`;
  return '';
}

/** An object URL for a file, revoked when the file changes and on unmount. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

interface Thumb {
  id: string;
  label: string;
  url: string;
}

/** The brand's official logos as blob URLs (the files sit behind the Bearer header, so <img src> cannot load them directly). */
function useOfficialThumbs(brand: Brand | null): { thumbs: Thumb[]; loading: boolean } {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [loading, setLoading] = useState(false);
  const key = brand ? `${brand.id}|${brand.logo?.sha256 ?? ''}|${(brand.extra_logos ?? []).map((l) => `${l.id}:${l.sha256}`).join(',')}` : '';
  useEffect(() => {
    if (!brand || (!brand.logo && !(brand.extra_logos ?? []).length)) {
      setThumbs([]);
      return;
    }
    const ctl = new AbortController();
    const made: string[] = [];
    setLoading(true);
    const jobs: Promise<Thumb | null>[] = [];
    const grab = (id: string, label: string, p: Promise<Blob>) =>
      jobs.push(
        p.then((b) => {
          if (ctl.signal.aborted) return null;
          const url = URL.createObjectURL(b);
          made.push(url);
          return { id, label, url };
        }).catch(() => null),
      );
    if (brand.logo) grab('primary', 'Primary logo', sm.logoBlob(brand.id, ctl.signal));
    for (const lg of brand.extra_logos ?? []) grab(String(lg.id), lg.label || `Logo ${lg.id}`, sm.extraLogoBlob(brand.id, lg.id, ctl.signal));
    void Promise.all(jobs).then((all) => {
      if (ctl.signal.aborted) return;
      setThumbs(all.filter((t): t is Thumb => t !== null));
      setLoading(false);
    });
    return () => {
      ctl.abort();
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { thumbs, loading };
}

const Bar: React.FC<{ value: number; tone: 'red' | 'orange' | 'green' | 'blue' }> = ({ value, tone }) => (
  <div className="lc-bar" role="presentation">
    <div className={`lc-bar-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

const Picker: React.FC<{
  id: string;
  file: File | null;
  url: string | null;
  prompt: string;
  disabled?: boolean;
  onFile: (f: File | null) => void;
}> = ({ id, file, url, prompt, disabled, onFile }) => {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`lc-drop ${over ? 'over' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFile(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        type="file"
        className="lc-file"
        data-testid={id}
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {url ? <img src={url} alt="" className="lc-drop-img" /> : <span className="lc-drop-icon" aria-hidden="true">+</span>}
      <span className="lc-drop-text">{file ? 'Click or drop to replace' : prompt}</span>
      <span className="lc-drop-hint">PNG, JPEG or WebP, up to 2 MB</span>
    </label>
  );
};

export const LogoCompareCard: React.FC<{ brand: Brand | null; missing: boolean; canWrite: boolean }> = ({ brand, missing, canWrite }) => {
  const [candidate, setCandidate] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [useManual, setUseManual] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LogoCompareResult | null>(null);
  const [usedRef, setUsedRef] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const candUrl = useObjectUrl(candidate);
  const refUrl = useObjectUrl(reference);
  const usedRefUrl = useObjectUrl(usedRef);
  const { thumbs, loading: thumbsLoading } = useOfficialThumbs(brand);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [brand?.id]);

  const [engine, setEngine] = useState<LogoEngineStatus | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    sm.logoEngine(ctl.signal).then(setEngine).catch(() => undefined); // the hint is optional: a failure just hides it
    return () => ctl.abort();
  }, []);
  const clipOn = result ? result.clip?.available === true : engine?.available === true;
  const showHint = (result ? result.clip?.available === false : engine?.available === false) && !busy;
  const hint = (result ? result.clip?.hint : engine?.hint) || CLIP_HINT;

  const hasOfficial =thumbs.length > 0 || thumbsLoading || !!brand?.logo || (brand?.extra_logos ?? []).length > 0;
  const noLogo = !!brand && !hasOfficial;
  const manual = useManual && !!reference;

  const pick = async (which: 'candidate' | 'reference', f: File | null) => {
    if (!f) return;
    const msg = await precheckImage(f, which === 'candidate' ? 'logo' : 'reference logo');
    setFileError(msg || null);
    if (msg) return;
    setResult(null);
    setError(null);
    setAdded(null);
    if (which === 'candidate') setCandidate(f);
    else setReference(f);
  };

  const compare = async () => {
    if (!candidate || busy) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy(true);
    setError(null);
    setAdded(null);
    setAddError(null);
    try {
      const sent = manual ? reference : null;
      const res = await sm.compareLogo(candidate, sent, brand?.id, ctl.signal);
      setResult(res);
      setUsedRef(sent);
    } catch (e) {
      if (isAbortError(e)) return;
      setResult(null);
      setError(e instanceof Error ? e.message : 'Could not compare the logos.');
    } finally {
      if (abortRef.current === ctl) setBusy(false);
    }
  };

  const addOfficial = async () => {
    if (!brand || !usedRef) return;
    setAdding(true);
    setAddError(null);
    try {
      await sm.addExtraLogo(brand.id, usedRef, 'Added from Look-alike Lab');
      setBrandCache(await sm.brand(brand.id));
      setAdded('Added to your official logos. New scans will compare against it.');
      setResult(null);
      setReference(null);
      setUsedRef(null);
      setUseManual(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add the logo.');
    } finally {
      setAdding(false);
    }
  };

  const bestThumb = result && result.mode === 'official' ? thumbs.find((t) => t.id === result.best.id) : null;
  const bestUrl = result ? (result.mode === 'manual' ? usedRefUrl : (bestThumb?.url ?? null)) : null;
  const tone = result ? VERDICT_TONE[result.verdict] : 'blue';
  const canCompare = !!candidate && !busy && !missing && (useManual ? !!reference : !noLogo);

  return (
    <div className="card logo-compare-card" data-testid="logo-compare">
      <div className="lc-head">
        <div>
          <h3 className="panel-card-title">Compare a logo</h3>
          <p className="lc-sub">Check how closely a logo resembles your official ones. Nothing is saved and no detection is created.</p>
        </div>
      </div>

      {missing && <div className="state-note state-empty">No brand profile yet. <Link to="/setup">Set up your brand profile</Link> first.</div>}

      {!missing && (
        <>
          <div className="lc-official">
            <div className="lc-label">Official logos you are comparing against</div>
            {noLogo && !useManual ? (
              <div className="state-note state-empty" data-testid="lc-empty">
                Add an official logo in <Link to="/brand">Brand Registry</Link> or upload a reference logo.
              </div>
            ) : (
              <div className="lc-thumbs" data-testid="lc-thumbs">
                {thumbs.map((t) => (
                  <figure key={t.id} className="lc-thumb">
                    <img src={t.url} alt={t.label} />
                    <figcaption>{t.label}</figcaption>
                  </figure>
                ))}
                {thumbsLoading && <span className="lc-dim">Loading logos…</span>}
              </div>
            )}
          </div>

          <div className="lc-inputs">
            <div className="lc-col">
              <div className="lc-label">Logo to check</div>
              <Picker id="lc-candidate" file={candidate} url={candUrl} prompt="Drop a logo here or click to choose" onFile={(f) => void pick('candidate', f)} />
            </div>
            <div className="lc-col">
              <label className="lc-toggle">
                <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} data-testid="lc-use-ref" />
                <span>Use a different reference logo</span>
              </label>
              {useManual ? (
                <Picker id="lc-reference" file={reference} url={refUrl} prompt="Drop a reference logo or click to choose" onFile={(f) => void pick('reference', f)} />
              ) : (
                <p className="lc-dim">Off: the logo is compared with every official logo above.</p>
              )}
            </div>
          </div>

          {fileError && <Notice onClose={() => setFileError(null)}>{fileError}</Notice>}
          {error && <Notice onClose={() => setError(null)}>{error}</Notice>}
          {added && <Notice kind="info">{added}</Notice>}

          <div className="lc-actions">
            <button type="button" className="btn-primary btn-sm" onClick={() => void compare()} disabled={!canCompare}>
              {busy ? 'Comparing…' : 'Compare'}
            </button>
            {candidate && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setCandidate(null); setResult(null); setError(null); }}>
                Clear
              </button>
            )}
          </div>

          {busy && clipOn && <p className="lc-dim" data-testid="lc-loading">First comparison loads the AI model, this can take up to half a minute.</p>}
          {showHint && (
            <p className="lc-dim lc-hint" data-testid="lc-clip-hint">
              AI vision scoring is not active. To add it, run: <code>{hint}</code>
            </p>
          )}

          {result && (
            <div className="lc-result" data-testid="lc-result" aria-live="polite">
              <div className="lc-score-row">
                <div className={`lc-score ${tone}`} data-testid="lc-score">{Math.round(result.similarity)}%</div>
                <div className="lc-score-main">
                  <span className={`chip chip-${tone === 'red' ? 'red' : tone === 'orange' ? 'orange' : 'green'}`} data-testid="lc-verdict">{VERDICT_LABEL[result.verdict]}</span>
                  <Bar value={result.similarity} tone={tone} />
                  <div className="lc-dim">
                    Best match: {result.best.label}. Bands: same logo {result.thresholds.same_logo}+, very similar {result.thresholds.very_similar}+, somewhat similar {result.thresholds.somewhat_similar}+.
                  </div>
                </div>
              </div>

              <div className="lc-sbs">
                <figure className="lc-sbs-item">
                  {candUrl && <img src={candUrl} alt="Logo you checked" />}
                  <figcaption>Your logo ({result.candidate.width} x {result.candidate.height})</figcaption>
                </figure>
                <figure className="lc-sbs-item">
                  {bestUrl ? <img src={bestUrl} alt={result.best.label} /> : <div className="lc-sbs-none">Preview not available</div>}
                  <figcaption>{result.best.label}</figcaption>
                </figure>
              </div>

              <div className="lc-dim" data-testid="lc-uses">
                {result.clip?.available ? 'Score uses: AI vision + fingerprints' : 'Score uses: fingerprints only'}
              </div>
              <div className="lc-algos">
                {result.clip?.available && typeof result.clip.score === 'number' && (
                  <div className="lc-algo-row" data-testid="lc-clip-row">
                    <span className="lc-algo-name"><strong>AI vision (CLIP)</strong></span>
                    <Bar value={result.clip.score} tone={tone} />
                    <span className="lc-algo-val">{Math.round(result.clip.score)}</span>
                  </div>
                )}
                {ALGO_LABEL.map((a) => (
                  <div key={a.key} className="lc-algo-row">
                    <span className="lc-algo-name">{a.label}</span>
                    <Bar value={result.algorithms[a.key]} tone="blue" />
                    <span className="lc-algo-val">{Math.round(result.algorithms[a.key])}</span>
                  </div>
                ))}
              </div>

              {result.results.length > 1 && (
                <table className="lc-table" data-testid="lc-table">
                  <thead>
                    <tr><th>Official logo</th><th>Similarity</th>{result.clip?.available && <th>AI vision</th>}<th>Verdict</th></tr>
                  </thead>
                  <tbody>
                    {result.results.map((r) => (
                      <tr key={r.id}>
                        <td>{r.label}{r.id === result.best.id ? ' (best)' : ''}</td>
                        <td>{Math.round(r.similarity)}%</td>
                        {result.clip?.available && <td data-testid="lc-clip-cell">{r.clip ? `${Math.round(r.clip.score)}%` : '-'}</td>}
                        <td>{VERDICT_LABEL[r.verdict]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p className="lc-explain">{result.explanation}</p>
              {result.warnings.length > 0 && (
                <ul className="lc-warnings" data-testid="lc-warnings">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {result.sample_note && <p className="lc-dim">{result.sample_note}</p>}

              {canWrite && result.mode === 'manual' && usedRef && (
                <div className="lc-add">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void addOfficial()} disabled={adding}>
                    {adding ? 'Adding…' : 'Add this reference as an official logo'}
                  </button>
                  {addError && <Notice onClose={() => setAddError(null)}>{addError}</Notice>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
