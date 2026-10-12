import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu } from 'lucide-react';
import './Layout.css';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onOpenMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  actions,
  onOpenMobileMenu,
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = { name: 'Harini', email: 'admin@company.com' };

  const handleSignOut = () => {
    localStorage.removeItem('scammind_auth');
    navigate('/login', { replace: true });
  };

  return (
    <header className="panel-header">
      <div className="header-lead">
        <button
          type="button"
          className="mobile-hamburger"
          onClick={onOpenMobileMenu}
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <div className="header-left">
          <h1 className="header-title" title={title}>
            {title}
          </h1>
          {subtitle && (
            <p className="header-subtitle" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="header-right">
        {actions && <div className="header-actions">{actions}</div>}

        <button type="button" className="bell-btn" aria-label="Notifications">
          <Bell size={18} strokeWidth={1.8} />
          <span className="bell-dot" />
        </button>

        <div className="user-menu-wrap">
          <div
            className="user-chip"
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setMenuOpen((o) => !o)}
          >
            <div className="user-avatar">{user.name.charAt(0)}</div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email}</span>
            </div>
            <ChevronDown size={14} color="var(--text-dim)" />
          </div>

          {menuOpen && (
            <div className="user-menu" role="menu">
              <div className="user-menu-role">Signed in as {user.name}</div>
              <button
                type="button"
                role="menuitem"
                className="user-menu-item"
                onClick={handleSignOut}
              >
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
