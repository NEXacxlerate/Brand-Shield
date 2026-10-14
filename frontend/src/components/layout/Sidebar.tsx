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
  ChevronsUpDown,
  Globe,
  SearchCheck,
  FlaskConical,
} from 'lucide-react';
import { useBrand } from '../../hooks/useBrand';
import './Layout.css';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const location = useLocation();
  const { brand } = useBrand();

  const totalOfficialAssets = brand?.official_assets ?? 0;

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
        <input type="text" placeholder="Search detections" aria-label="Search detections" />
        <span className="keycap">⌘K</span>
      </div>

      {/* 3. Active Brand Card */}
      <NavLink to={brand ? "/brand" : "/setup"} className="sidebar-brand-card" onClick={onClose}>
        <div className="brand-avatar-badge">
          {(brand?.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="brand-info">
          <span className="brand-name">{brand?.name ?? 'No brand yet'}</span>
          <span className="brand-sub">
            {brand ? `Active brand · ${totalOfficialAssets} official assets` : 'Set up your brand profile'}
          </span>
        </div>
        <ChevronsUpDown size={15} className="brand-chevron" />
      </NavLink>

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
          to="/lookalike"
          className={`nav-item ${isNavActive('/lookalike') ? 'active' : ''}`}
          onClick={onClose}
        >
          <ScanText size={19} strokeWidth={1.8} />
          <span>Look-alike Lab</span>
        </NavLink>

        <NavLink
          to="/sources"
          className={`nav-item ${isNavActive('/sources') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Activity size={19} strokeWidth={1.8} />
          <span>Source Health</span>
        </NavLink>

        <NavLink
          to="/reports"
          className={`nav-item ${isNavActive('/reports') ? 'active' : ''}`}
          onClick={onClose}
        >
          <FileText size={19} strokeWidth={1.8} />
          <span>Reports</span>
        </NavLink>
        <NavLink
          to="/evaluation"
          className={`nav-item ${isNavActive('/evaluation') ? 'active' : ''}`}
          onClick={onClose}
        >
          <FlaskConical size={19} strokeWidth={1.8} />
          <span>Model Evaluation</span>
        </NavLink>
      </nav>

      {/* Spacer */}
      <div className="sidebar-spacer" />

      {/* 6. Pinned Bottom Items */}
      <div className="sidebar-bottom">
        <NavLink
          to="/settings"
          className={`nav-item ${isNavActive('/settings') ? 'active' : ''}`}
          onClick={onClose}
        >
          <SlidersVertical size={19} strokeWidth={1.8} />
          <span>Settings</span>
        </NavLink>

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
