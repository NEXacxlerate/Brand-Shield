import React from 'react';
import { BrandMark, Wordmark } from '../common/BrandMark';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  ShieldCheck,
  Users,
  Smartphone,
  ScanText,
  Activity,
  FileText,
  SlidersVertical,
  Headphones,
  Search,
  Globe,
  SearchCheck,
  FlaskConical,
  Sparkles,
  ArrowUpRight,
  Shield,
  ScanSearch,
  Building2,
} from 'lucide-react';
import { BrandSwitcher } from './BrandSwitcher';
import { session } from '../../api/client';
import { STUDIO_URL } from '../../utils/studio';
import './Layout.css';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const location = useLocation();
  const isAdmin = session.user()?.role === 'admin'; // Source Health, Model Evaluation and Settings are for administrators only
  const isNavActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      {/* 1. Logo */}
      <NavLink to="/dashboard" className="sidebar-logo" onClick={onClose}>
        <BrandMark />
        <div className="logo-text"><Wordmark /></div>
      </NavLink>

      {/* 2. Search Box */}
      <div className="sidebar-search">
        <Search size={16} strokeWidth={2} color="var(--text-dim)" />
        <input data-voice="search" type="text" placeholder="Search detections" aria-label="Search detections" />
        <span className="keycap">⌘K</span>
      </div>

      {/* 3. Active Brand Card */}
      <BrandSwitcher onNavigate={onClose} />

      {/* 4. Section Label */}
      <div className="sidebar-section-label">Main menu</div>

      {/* 5. Main Nav Items */}
      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={`nav-item ${isNavActive('/dashboard') ? 'active' : ''}`}
          onClick={onClose}
        >
          <LayoutGrid size={19} strokeWidth={1.8} />
          <span>Overview</span>
        </NavLink>

        <NavLink
          to="/brand"
          className={`nav-item ${isNavActive('/brand') ? 'active' : ''}`}
          onClick={onClose}
        >
          <ShieldCheck size={19} strokeWidth={1.8} />
          <span>Brand Registry</span>
        </NavLink>

        <NavLink
          to="/social"
          className={`nav-item ${isNavActive('/social') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Users size={19} strokeWidth={1.8} />
          <span>Social Threats</span>
        </NavLink>

        <NavLink
          to="/apps"
          className={`nav-item ${isNavActive('/apps') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Smartphone size={19} strokeWidth={1.8} />
          <span>App Threats</span>
        </NavLink>

        <NavLink
          to="/web"
          className={`nav-item ${isNavActive('/web') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Globe size={19} strokeWidth={1.8} />
          <span>Web Threats</span>
        </NavLink>

        <NavLink
          to="/investigations"
          className={`nav-item ${isNavActive('/investigations') ? 'active' : ''}`}
          onClick={onClose}
        >
          <SearchCheck size={19} strokeWidth={1.8} />
          <span>Investigations</span>
        </NavLink>

        <NavLink
          to="/r2"
          className={`nav-item ${isNavActive('/r2') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Shield size={19} strokeWidth={1.8} />
          <span>Risk Investigation</span>
        </NavLink>

        <NavLink
          to="/url-scanner"
          className={`nav-item ${isNavActive('/url-scanner') ? 'active' : ''}`}
          onClick={onClose}
        >
          <ScanSearch size={19} strokeWidth={1.8} />
          <span>Fake URL Scanner</span>
        </NavLink>

        <NavLink
          to="/lookalike"
          className={`nav-item ${isNavActive('/lookalike') ? 'active' : ''}`}
          onClick={onClose}
        >
          <ScanText size={19} strokeWidth={1.8} />
          <span>Look-alike Lab</span>
        </NavLink>

        {isAdmin && (
        <NavLink
          to="/admin/brands"
          className={`nav-item ${isNavActive('/admin/brands') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Building2 size={19} strokeWidth={1.8} />
          <span>All Brands</span>
        </NavLink>
        )}

        {isAdmin && (
        <NavLink
          to="/sources"
          className={`nav-item ${isNavActive('/sources') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Activity size={19} strokeWidth={1.8} />
          <span>Source Health</span>
        </NavLink>
        )}

        <NavLink
          to="/reports"
          className={`nav-item ${isNavActive('/reports') ? 'active' : ''}`}
          onClick={onClose}
        >
          <FileText size={19} strokeWidth={1.8} />
          <span>Reports</span>
        </NavLink>
        {isAdmin && (
        <NavLink
          to="/evaluation"
          className={`nav-item ${isNavActive('/evaluation') ? 'active' : ''}`}
          onClick={onClose}
        >
          <FlaskConical size={19} strokeWidth={1.8} />
          <span>Model Evaluation</span>
        </NavLink>
        )}
      </nav>

      {/* Brand Studio: a separate app on the same origin (full page load, same login), shown as its own button */}
      <a href={STUDIO_URL} className="studio-cta" onClick={onClose} data-voice-row>
        <span className="studio-cta-icon">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <span className="studio-cta-text">
          <strong>Brand Studio</strong>
          <small>Names, logos &amp; palettes</small>
        </span>
        <ArrowUpRight size={16} className="studio-cta-arrow" />
      </a>

      <div className="sidebar-spacer" />

      {/* 6. Pinned Bottom Items */}
      <div className="sidebar-bottom">
        {isAdmin && (
        <NavLink
          to="/settings"
          className={`nav-item ${isNavActive('/settings') ? 'active' : ''}`}
          onClick={onClose}
        >
          <SlidersVertical size={19} strokeWidth={1.8} />
          <span>Settings</span>
        </NavLink>
        )}

        <button
          type="button"
          className="nav-item"
          onClick={() => {
            alert('Support desk: support@brandshield.ai');
            if (onClose) onClose();
          }}
          aria-label="Support desk"
        >
          <Headphones size={19} strokeWidth={1.8} />
          <span>Support</span>
        </button>
      </div>
    </aside>
  );
};
