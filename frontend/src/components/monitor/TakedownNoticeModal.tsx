import React, { useState } from 'react';
import { Copy, Check, FileText } from 'lucide-react';
import type { DetectionDetail } from '../../api/types';
import { Modal } from './CandidateTools';
import './TakedownNoticeModal.css';

function platformLabel(p: string): string {
  const MAP: Record<string, string> = {
    instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)',
    telegram: 'Telegram', linkedin: 'LinkedIn', youtube: 'YouTube',
    google_play: 'Google Play Store', app_store: 'Apple App Store',
    third_party_apk: 'Third-party APK site',
  };
  return MAP[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

function buildLetter(d: DetectionDetail): string {
  const brand = d.official?.name ?? 'Our Brand';
  const suspect = d.name || d.handle || 'the entity';
  const url = d.profile_url ?? d.evidence?.page_url ?? '';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const violations: string[] = [];
  const r = d.reasons ?? [];
  if (r.some((x) => /name/i.test(x.signal + x.label))) violations.push(`unauthorized use of the "${brand}" brand name`);
  if (r.some((x) => /logo|icon/i.test(x.signal + x.label))) violations.push("reproduction of the brand's registered logo / icon");
  if (r.some((x) => /domain/i.test(x.signal + x.label))) violations.push('use of a confusingly similar domain name');
  if (r.some((x) => /desc|text|keyword/i.test(x.signal + x.label))) violations.push('misleading description that impersonates the brand');
  if (violations.length === 0) violations.push(`unauthorized impersonation of "${brand}"`);

  let subjectLine = '';
  let targetBlock = '';
  if (d.category === 'social') {
    subjectLine = `Fake social media profile impersonating "${brand}"`;
    targetBlock = [
      `Platform  : ${platformLabel(d.platform)}`,
      `Profile   : ${suspect}`,
      url ? `URL       : ${url}` : null,
      d.handle ? `Handle    : @${d.handle}` : null,
    ].filter(Boolean).join('\n');
  } else if (d.category === 'app') {
    subjectLine = `Counterfeit application impersonating "${brand}"`;
    targetBlock = [
      `Store      : ${platformLabel(d.platform)}`,
      `App name   : ${suspect}`,
      d.package_id ? `Package ID : ${d.package_id}` : null,
      d.publisher ? `Publisher  : ${d.publisher}` : null,
      url ? `URL        : ${url}` : null,
    ].filter(Boolean).join('\n');
  } else {
    subjectLine = `Infringing website / page using "${brand}" brand identity`;
    targetBlock = [
      `Site / page : ${suspect}`,
      url ? `URL         : ${url}` : null,
    ].filter(Boolean).join('\n');
  }

  return `INTELLECTUAL PROPERTY INFRINGEMENT NOTICE — CEASE AND DESIST

Date: ${today}

To:
The Owner / Operator of the following ${d.category === 'social' ? 'social media profile' : d.category === 'app' ? 'application' : 'website / page'}:

${targetBlock}

Subject: ${subjectLine} — Immediate Takedown Required

Dear Sir / Madam,

We represent the owners of the "${brand}" brand and all associated intellectual property rights ("the Brand Owner"). We write to notify you of a serious infringement of those rights and to demand immediate corrective action.

────────────────────────────────────────────────
NATURE OF THE INFRINGEMENT
────────────────────────────────────────────────

Our automated brand-protection system has identified the entity listed above as engaging in the following infringing activities:

${violations.map((v, i) => `  ${i + 1}. ${v.charAt(0).toUpperCase() + v.slice(1)}.`).join('\n')}

These activities constitute:

  a) Trademark infringement under applicable intellectual property and consumer-protection laws;
  b) Passing off — misrepresenting an affiliation with or endorsement by the Brand Owner;
  c) Unfair competition and deceptive trade practices that harm consumers who may be misled into believing your entity is associated with or authorized by "${brand}".

────────────────────────────────────────────────
DEMANDS
────────────────────────────────────────────────

You are hereby required to, within 72 hours of receipt of this notice:

  1. Immediately cease all use of the "${brand}" name, logo, trade dress, or any confusingly similar variation;
  2. Remove, delete, or disable the infringing profile / application / page identified above;
  3. Destroy or delete any materials (digital or physical) that bear the infringing marks;
  4. Confirm in writing that each of the above steps has been completed.

────────────────────────────────────────────────
CONSEQUENCES OF NON-COMPLIANCE
────────────────────────────────────────────────

Failure to comply fully within the timeframe stated above will leave the Brand Owner with no alternative but to pursue all available legal remedies without further notice, including but not limited to:

  • Seeking injunctive relief to halt the infringing activity immediately;
  • Filing a formal complaint with the platform / app store / domain registrar / hosting provider;
  • Pursuing claims for damages, including lost profits, statutory damages, and attorney's fees.

This notice is without prejudice to all rights and remedies of the Brand Owner, which are expressly reserved in full.

Sincerely,

${brand} — Brand Protection
[Authorised representative / legal counsel contact]

────────────────────────────────────────────────
FOR OFFICIAL USE
Ref: Detection #${d.id}  |  Risk score: ${d.score} / 100  |  Band: ${d.risk_band}
Date generated: ${today}
────────────────────────────────────────────────`;
}

export const TakedownNoticeButton: React.FC<{ d: DetectionDetail }> = ({ d }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-takedown btn-sm" onClick={() => setOpen(true)} title="Generate a formal takedown notice for this detection">
        <FileText size={14} aria-hidden="true" />
        Send Takedown Notice
      </button>
      {open && <TakedownNoticeModal d={d} onClose={() => setOpen(false)} />}
    </>
  );
};

const TakedownNoticeModal: React.FC<{ d: DetectionDetail; onClose: () => void }> = ({ d, onClose }) => {
  const letter = buildLetter(d);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `takedown-notice-${d.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  };

  return (
    <Modal title="Takedown Notice" onClose={onClose}>
      <p className="takedown-sub">
        Review and customise the letter below, then copy or download it. Send it to the platform, app store, or domain registrar for the infringing entity.
      </p>
      <textarea className="takedown-letter" readOnly value={letter} spellCheck={false} />
      <div className="takedown-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button type="button" className="btn-secondary btn-sm" onClick={download}>Download .txt</button>
        <button type="button" className="btn-primary btn-sm takedown-copy-btn" onClick={() => void copy()}>
          {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy to clipboard</>}
        </button>
      </div>
    </Modal>
  );
};
