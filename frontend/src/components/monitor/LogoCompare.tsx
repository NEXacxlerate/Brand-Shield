import type { DetectionDetail } from '../../api/types';
import { useAuthImage } from '../../hooks/useAuthImage';
import './LogoCompare.css';

interface Props {
  detail: DetectionDetail;
}

function scoreChipClass(sim: number): string {
  if (sim >= 80) return 'lc-score-danger';
  if (sim >= 55) return 'lc-score-warn';
  return 'lc-score-safe';
}

function ImageBox({ src, label, fallback }: { src: string | null | undefined; label: string; fallback?: string }) {
  return (
    <div className="lc-image-box">
      <div className="lc-img-frame">
        {src ? (
          <img
            src={src}
            alt={label}
            className="lc-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (sib) sib.removeAttribute('hidden');
            }}
          />
        ) : null}
        <div className="lc-img-placeholder" hidden={!!src}>
          {fallback ?? '?'}
        </div>
      </div>
      <span className="lc-img-label">{label}</span>
    </div>
  );
}

export function LogoCompare({ detail }: Props) {
  const brandSrc = useAuthImage(detail.brand_logo_url);
  const iconUrl = detail.logo?.icon_url;
  const similarity = detail.logo?.similarity;
  const status = detail.logo?.status;
  const reason = detail.logo?.reason;
  const isApp = detail.category === 'apps';
  const iconLabel = isApp ? 'Detected app icon' : 'Detected profile picture';

  const hasComparison = status === 'compared' && similarity != null;
  const hasAnyImage = brandSrc != null || !!iconUrl;

  if (!hasComparison && !hasAnyImage) return null;

  return (
    <div className="logo-compare" data-testid="logo-compare">
      <div className="lc-head">
        <span className="lc-heading">Logo comparison</span>
        {hasComparison ? (
          <span className={`lc-score-chip ${scoreChipClass(similarity!)}`}>
            {similarity}% match
          </span>
        ) : (
          <span className="lc-na">{reason ?? 'Not compared'}</span>
        )}
      </div>

      <div className="lc-body">
        <ImageBox src={brandSrc} label="Official brand logo" fallback="No logo" />
        <div className="lc-vs" aria-hidden="true">
          <span>VS</span>
          {hasComparison && (
            <span className={`lc-vs-score ${scoreChipClass(similarity!)}`}>{similarity}%</span>
          )}
        </div>
        <ImageBox src={iconUrl} label={iconLabel} fallback="No image" />
      </div>

      {hasComparison && (
        <p className="lc-note">
          {similarity! >= 80
            ? 'High similarity — a near-copy of the brand logo.'
            : similarity! >= 55
              ? 'Moderate similarity — worth a human look.'
              : 'Low similarity — the logo does not closely resemble the brand.'}
          {' '}Hash-based comparison; human confirmation is required.
        </p>
      )}
    </div>
  );
}
