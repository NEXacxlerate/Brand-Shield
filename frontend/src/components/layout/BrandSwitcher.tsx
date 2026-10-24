import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Check, Plus, Settings2 } from 'lucide-react';
import { sm } from '../../api/sm';
import { clearQueryCache } from '../../api/queryCache';
import { refreshBrand, useBrand } from '../../hooks/useBrand';

interface Props {
  onNavigate?: () => void;
}

/** The sidebar brand card: shows the brand being worked on, lists every brand of the account, and offers "Add another brand". */
export const BrandSwitcher: React.FC<Props> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { brand, loading } = useBrand();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ id: number; name: string; active: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    sm.brands()
      .then((rows) => alive && setList(rows))
      .catch(() => alive && setList([]));
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => {
      alive = false;
      document.removeEventListener('mousedown', away);
    };
  }, [open, brand?.id]);

  const go = (path: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  };

  const choose = async (id: number) => {
    if (busy) return;
    if (brand && id === brand.id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await sm.selectBrand(id);
      clearQueryCache(); // every cached page answer belonged to the previous brand
      await refreshBrand();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const assets = brand?.official_assets ?? 0;
  return (
    <div className="brand-switcher" ref={box}>
      <button
        type="button"
        className="sidebar-brand-card"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="brand-switcher"
        onClick={() => {
          if (loading) return;
          if (brand) setOpen((o) => !o);
          else go('/setup');
        }}
      >
        <div className="brand-avatar-badge">{(brand?.name || '?').charAt(0).toUpperCase()}</div>
        <div className="brand-info">
          <span className="brand-name">{brand?.name ?? 'No brand yet'}</span>
          <span className="brand-sub">{brand ? `Active brand · ${assets} official assets` : 'Set up your brand profile'}</span>
        </div>
        <ChevronsUpDown size={15} className="brand-chevron" />
      </button>
      {open && (
        <div className="brand-menu" role="menu">
          <div className="brand-menu-label">Your brands</div>
          {list.map((b) => (
            <button key={b.id} type="button" role="menuitem" className="brand-menu-item" onClick={() => void choose(b.id)} disabled={busy}>
              <span className="brand-menu-avatar">{b.name.charAt(0).toUpperCase()}</span>
              <span className="brand-menu-name">{b.name}</span>
              {b.id === brand?.id && <Check size={14} aria-label="Current brand" />}
            </button>
          ))}
          <div className="brand-menu-sep" />
          <button type="button" role="menuitem" className="brand-menu-item" onClick={() => go('/brand')}>
            <Settings2 size={14} /> <span className="brand-menu-name">Brand profile</span>
          </button>
          <button type="button" role="menuitem" className="brand-menu-item" data-testid="add-brand" onClick={() => go('/protect-brand?add=1')}>
            <Plus size={14} /> <span className="brand-menu-name">Add another brand</span>
          </button>
        </div>
      )}
    </div>
  );
};
