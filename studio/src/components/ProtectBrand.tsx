import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Loader2, AlertCircle, X, Check, Image as ImageIcon, ArrowRight, LayoutDashboard } from 'lucide-react';
import { motion } from 'motion/react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useBrand } from '../contexts/BrandContext';
import { useCollections } from '../contexts/CollectionsContext';
import { cn } from '../lib/utils';
import { ApiError } from '../lib/api';
import { LogoUpload } from './LogoUpload';
import { useRemembered } from '../lib/profile';
import {
  INDUSTRIES, LOGO_RULES, deriveAliases, deriveKeywords, normalizeDomain, prepareLogo, registerBrand, mapFieldErrors,
  type BrandForm, type RegisterOutcome,
} from '../lib/brandshield';

const ChipInput: React.FC<{
  values: string[]; onChange: (v: string[]) => void; placeholder: string; inputCls: string; isDark: boolean;
  transform?: (raw: string) => string | null; label: string;
}> = ({ values, onChange, placeholder, inputCls, isDark, transform, label }) => {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((p) => (transform ? transform(p) : p.trim())).filter((p): p is string => !!p);
    if (parts.length) onChange(Array.from(new Set([...values, ...parts])));
    setText('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {values.map((v) => (
          <span key={v} className={cn('inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs border', isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-slate-100 border-slate-200 text-slate-700')}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="p-0.5 rounded-full hover:bg-red-500/20 hover:text-red-400"><X size={12} /></button>
          </span>
        ))}
      </div>
      <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); } }}
        onBlur={() => text.trim() && add(text)}
        className={cn('w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 transition-all text-sm', inputCls)} />
    </div>
  );
};

type LogoChoice = { kind: 'none' } | { kind: 'saved'; id: string } | { kind: 'upload'; file: File; preview: string };

export const ProtectBrand: React.FC = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { selectedBrand, navigateTo } = useBrand();
  const { items } = useCollections();

  const logos = useMemo(() => items.filter((i) => i.type === 'logo' && i.url), [items]);
  const contentItem = useMemo(() => items.find((i) => i.type === 'content' && (i.data?.aboutUs || i.data?.tagline)), [items]);

  const [name, setName] = useRemembered('brandName', selectedBrand);
  const [industry, setIndustry] = useRemembered('industry');
  const [description, setDescription] = useRemembered('description');
  const [keywords, setKeywords] = useState<string[]>(() => (selectedBrand ? deriveKeywords(selectedBrand) : []));
  const [aliases, setAliases] = useState<string[]>(() => (selectedBrand ? deriveAliases(selectedBrand) : []));
  const [domains, setDomains] = useState<string[]>([]);
  const [logo, setLogo] = useState<LogoChoice>({ kind: 'none' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RegisterOutcome | null>(null);
  const [logoNotes, setLogoNotes] = useState<string[]>([]);
  const prefilledDesc = useRef(false);
  const lastDerived = useRef(selectedBrand);

  // a brand picked on another screen
  useEffect(() => {
    if (selectedBrand && selectedBrand !== name && selectedBrand !== lastDerived.current) {
      setName(selectedBrand);
    }
  }, [selectedBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  // description from the generated tagline / about text, once, when the user has typed nothing
  useEffect(() => {
    if (prefilledDesc.current || description || !contentItem) return;
    const text = String(contentItem.data?.aboutUs || contentItem.data?.tagline || '').trim();
    if (text) { setDescription(text.slice(0, 2000)); prefilledDesc.current = true; }
  }, [contentItem, description]);

  // keep derived aliases/keywords in step with the name until the user edits the chips themselves
  const onNameChange = (v: string) => {
    const derivedOld = deriveAliases(name).join('|') === aliases.join('|');
    const kwOld = deriveKeywords(name, String(contentItem?.data?.tagline || '')).join('|') === keywords.join('|');
    setName(v);
    lastDerived.current = v;
    if (derivedOld) setAliases(deriveAliases(v));
    if (kwOld) setKeywords(deriveKeywords(v, String(contentItem?.data?.tagline || '')));
  };

  useEffect(() => () => { if (logo.kind === 'upload') URL.revokeObjectURL(logo.preview); }, [logo]);

  const card = isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm';
  const inputCls = isDark
    ? 'bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:ring-emerald-500/20'
    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:ring-emerald-500/30';
  const label = isDark ? 'text-zinc-400' : 'text-slate-600';
  const heading = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-zinc-500' : 'text-slate-500';
  const isViewer = user?.role === 'viewer';

  const onUpload = (file: File) => {
    setErrors((e) => ({ ...e, logo: '' }));
    if (!(LOGO_RULES.types as readonly string[]).includes(file.type)) { setErrors((e) => ({ ...e, logo: 'Please choose a PNG, JPEG or WebP picture.' })); return; }
    setLogo({ kind: 'upload', file, preview: URL.createObjectURL(file) });
  };

  const logoBlob = async (): Promise<Blob | null> => {
    if (logo.kind === 'upload') return logo.file;
    if (logo.kind === 'saved') {
      const it = logos.find((l) => l.id === logo.id);
      if (it?.url) return (await fetch(it.url)).blob();
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter the brand name.';
    if (name.trim().length > 120) errs.name = 'The name can be at most 120 characters.';
    if (description.length > 2000) errs.description = 'The description can be at most 2000 characters.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      let prepared: Blob | null = null;
      let notes: string[] = [];
      const raw = await logoBlob();
      if (raw) {
        try {
          const p = await prepareLogo(raw);
          prepared = p.blob;
          notes = p.notes;
        } catch (err) {
          setErrors({ logo: err instanceof Error ? err.message : 'This logo cannot be used.' });
          setBusy(false);
          return;
        }
      }
      setLogoNotes(notes);
      const form: BrandForm = { name, industry, description, aliases, keywords, domains };
      setOutcome(await registerBrand(form, prepared));
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = mapFieldErrors(err.fields);
        if (Object.keys(mapped).length) setErrors(mapped as Record<string, string>);
        if (err.status === 403) setFormError('Your account can view BrandShield but cannot create a brand. Ask an administrator for an analyst account.');
        else setFormError(err.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const fieldErr = (k: string) => errors[k] ? <p className="text-xs text-red-400 mt-1" role="alert">{errors[k]}</p> : null;

  // ------------------------------------------------------------- success ---
  if (outcome?.brand) {
    const b = outcome.brand;
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cn('border rounded-3xl p-8 text-center', card)}>
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto mb-4"><Check size={28} /></div>
          <h2 className={cn('text-2xl font-bold mb-1', heading)}>Brand registered in BrandShield</h2>
          <p className={cn('text-sm mb-6', subText)}>{b.name} is now set up for protection.</p>
          <dl className={cn('text-left text-sm rounded-2xl border p-4 space-y-2 mb-4', isDark ? 'border-zinc-800 bg-zinc-950/50' : 'border-slate-200 bg-slate-50')}>
            <div className="flex gap-3"><dt className={cn('w-28 shrink-0', subText)}>Name</dt><dd className={heading}>{b.name}</dd></div>
            <div className="flex gap-3"><dt className={cn('w-28 shrink-0', subText)}>Industry</dt><dd className={heading}>{b.industry || 'Not set'}</dd></div>
            <div className="flex gap-3"><dt className={cn('w-28 shrink-0', subText)}>Also known as</dt><dd className={heading}>{b.aliases?.join(', ') || 'None'}</dd></div>
            <div className="flex gap-3"><dt className={cn('w-28 shrink-0', subText)}>Keywords</dt><dd className={heading}>{b.keywords?.join(', ') || 'None'}</dd></div>
            <div className="flex gap-3"><dt className={cn('w-28 shrink-0', subText)}>Domains</dt><dd className={heading}>{b.domains?.join(', ') || 'None'}</dd></div>
            <div className="flex gap-3"><dt className={cn('w-28 shrink-0', subText)}>Logo</dt>
              <dd className={heading}>{outcome.logo === null ? 'None yet. You can add one in BrandShield.' : outcome.logo.ok ? 'Uploaded' : `Not uploaded: ${outcome.logo.error}`}</dd></div>
          </dl>
          {logoNotes.length > 0 && outcome.logo?.ok && <p className={cn('text-xs text-left mb-3', subText)}>{logoNotes.join(' ')}</p>}
          {outcome.brand.refresh?.message && (
            <p className={cn('text-xs text-left rounded-xl border p-3 mb-3', isDark ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800')}>{outcome.brand.refresh.message}</p>
          )}
          {outcome.logo && !outcome.logo.ok && <p className="text-xs text-left text-red-400 mb-3">The brand was saved, but the logo was not. Add the logo in BrandShield under Brand Registry.</p>}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <a href="/setup" className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all">
              Add official accounts &amp; start protection <ArrowRight size={16} />
            </a>
            <a href="/dashboard" className={cn('flex items-center justify-center gap-2 px-6 py-3 rounded-xl border font-medium transition-all', isDark ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>
              <LayoutDashboard size={16} /> Open BrandShield dashboard
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------- form ---
  return (
    <div className="max-w-3xl space-y-6">
      <div className={cn('border p-6 rounded-2xl', card)}>
        <h2 className={cn('text-2xl font-semibold mb-1 flex items-center gap-2', heading)}><ShieldCheck className="text-emerald-500" /> Create brand &amp; protect it in BrandShield</h2>
        <p className={cn('text-sm mb-6', subText)}>Register this brand in BrandShield so it can watch for fake accounts, apps and look-alike websites. You can change everything later there.</p>

        {isViewer && <p className="mb-4 text-sm text-amber-400" role="alert">Your account is view-only, so it cannot create a brand.</p>}

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="pb-name" className={cn('text-sm font-medium block mb-1.5', label)}>Brand name</label>
            <input id="pb-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Acme Bank"
              className={cn('w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 transition-all', inputCls)} />
            {fieldErr('name')}
          </div>

          <div>
            <label htmlFor="pb-industry" className={cn('text-sm font-medium block mb-1.5', label)}>Industry</label>
            <input id="pb-industry" list="pb-industries" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Pick one or type your own"
              className={cn('w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 transition-all', inputCls)} />
            <datalist id="pb-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
            {fieldErr('industry')}
          </div>

          <div>
            <label htmlFor="pb-desc" className={cn('text-sm font-medium block mb-1.5', label)}>Short description <span className={subText}>(optional)</span></label>
            <textarea id="pb-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the brand does, in a sentence or two"
              className={cn('w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 transition-all resize-none text-sm', inputCls)} />
            {fieldErr('description')}
          </div>

          <div>
            <p className={cn('text-sm font-medium mb-1.5', label)}>Other spellings people use</p>
            <p className={cn('text-xs mb-2', subText)}>Look-alikes are matched against these as well. Suggested from the name; edit freely.</p>
            <ChipInput label="Add a spelling" values={aliases} onChange={setAliases} placeholder="Type and press Enter" inputCls={inputCls} isDark={isDark} />
            {fieldErr('aliases')}
          </div>

          <div>
            <p className={cn('text-sm font-medium mb-1.5', label)}>Keywords</p>
            <ChipInput label="Add a keyword" values={keywords} onChange={setKeywords} placeholder="Type and press Enter" inputCls={inputCls} isDark={isDark} />
            {fieldErr('keywords')}
          </div>

          <div>
            <p className={cn('text-sm font-medium mb-1.5', label)}>Official website domains <span className={subText}>(optional)</span></p>
            <ChipInput label="Add a domain" values={domains} onChange={setDomains} placeholder="e.g. acmebank.com" inputCls={inputCls} isDark={isDark} transform={(raw) => {
              const t = raw.trim();
              if (!t) return null;
              const d = normalizeDomain(t);
              if (!d) { setErrors((e) => ({ ...e, domains: `"${t}" does not look like a domain name.` })); return null; }
              setErrors((e) => ({ ...e, domains: '' }));
              return d;
            }} />
            {fieldErr('domains')}
          </div>

          <div>
            <p className={cn('text-sm font-medium mb-1.5', label)}>Logo <span className={subText}>(optional)</span></p>
            <p className={cn('text-xs mb-3', subText)}>PNG, JPEG or WebP, up to 2 MB, at least {LOGO_RULES.minPx} px and roughly square. Pictures that do not fit are resized to {LOGO_RULES.target} x {LOGO_RULES.target} automatically.</p>
            <div className="flex flex-wrap gap-3 items-start">
              <button type="button" onClick={() => setLogo({ kind: 'none' })} aria-pressed={logo.kind === 'none'}
                className={cn('px-4 py-2.5 rounded-xl border text-sm transition-all', logo.kind === 'none' ? 'border-emerald-500 text-emerald-500' : isDark ? 'border-zinc-700 text-zinc-400' : 'border-slate-300 text-slate-600')}>No logo</button>
              {logos.map((l) => (
                <button type="button" key={l.id} onClick={() => setLogo({ kind: 'saved', id: l.id })} aria-pressed={logo.kind === 'saved' && logo.id === l.id} title={l.label}
                  className={cn('w-16 h-16 rounded-xl border-2 bg-white p-1 transition-all', logo.kind === 'saved' && logo.id === l.id ? 'border-emerald-500' : 'border-transparent opacity-80 hover:opacity-100')}>
                  <img src={l.url} alt={l.label} className="w-full h-full object-contain" />
                </button>
              ))}
              {logo.kind === 'upload' && (
                <span className="w-16 h-16 rounded-xl border-2 border-emerald-500 bg-white p-1"><img src={logo.preview} alt="Uploaded logo" className="w-full h-full object-contain" /></span>
              )}
              <LogoUpload onPick={onUpload} label={logo.kind === 'upload' ? 'Choose another file' : 'Upload a logo file'} />
            </div>
            {logos.length === 0 && <p className={cn('text-xs mt-2 flex items-center gap-1.5', subText)}><ImageIcon size={12} /> Logos you save in the Logo Designer appear here.</p>}
            {fieldErr('logo')}
          </div>

          {formError && (
            <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-sm" role="alert">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /><p>{formError}</p>
            </div>
          )}

          <button type="submit" disabled={busy || isViewer}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
            {busy ? 'Working...' : 'Create brand & protect it in BrandShield'}
          </button>
          <button type="button" onClick={() => navigateTo('dashboard')} className={cn('text-sm underline-offset-2 hover:underline', subText)}>Back to dashboard</button>
        </form>
      </div>

    </div>
  );
};
