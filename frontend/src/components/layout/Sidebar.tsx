import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  ShieldCheck,
  Users,
  Smartphone,
  Scan,
  Activity,
  FileText,
  SlidersHorizontal,
  Headphones,
  Search,
  ChevronsUpDown,
  Shield,
} from 'lucide-react';
import { useAppStore } from '../../data/store';
import './Layout.css';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const location = useLocation();
  const { brand, officialAccounts, officialApps } = useAppStore();

  const totalOfficialAssets = officialAccounts.length + officialApps.length;

  const isNavActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      {/* 1. Logo */}
      <NavLink to="/dashboard" className="sidebar-logo" onClick={onClose}>
        <div className="logo-shield">
          <Shield size={18} strokeWidth={2.4} />
        </div>
        <div className="logo-text">ScamMind AI</div>
      </NavLink>

      {/* 2. Search Box */}
      <div className="sidebar-search">
        <Search size={16} strokeWidth={2} color="var(--text-dim)" />
        <input type="text" placeholder="Search detections" aria-label="Search detections" />
        <span className="keycap">⌘K</span>
      </div>

      {/* 3. Active Brand Card */}
      <NavLink to="/brand" className="sidebar-brand-card" onClick={onClose}>
        <div className="brand-avatar-badge">
          {brand.name.charAt(0).toUpperCase()}
        </div>
        <div className="brand-info">
          <span className="brand-name">{brand.name}</span>
          <span className="brand-sub">Active brand · {totalOfficialAssets} official assets</span>
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
          <LayoutGrid size={18} strokeWidth={1.8} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/brand"
          className={`nav-item ${isNavActive('/brand') ? 'active' : ''}`}
          onClick={onClose}
        >
          <ShieldCheck size={18} strokeWidth={1.8} />
          <span>Brand Profile</span>
        </NavLink>

        <NavLink
          to="/social"
          className={`nav-item ${isNavActive('/social') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Users size={18} strokeWidth={1.8} />
          <span>Social Monitoring</span>
        </NavLink>

        <NavLink
          to="/apps"
          className={`nav-item ${isNavActive('/apps') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Smartphone size={18} strokeWidth={1.8} />
          <span>App Store Monitoring</span>
        </NavLink>

        <NavLink
          to="/lookalike"
          className={`nav-item ${isNavActive('/lookalike') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Scan size={18} strokeWidth={1.8} />
          <span>Look-alike Lab</span>
        </NavLink>

        <NavLink
          to="/sources"
          className={`nav-item ${isNavActive('/sources') ? 'active' : ''}`}
          onClick={onClose}
        >
          <Activity size={18} strokeWidth={1.8} />
          <span>Source Health</span>
        </NavLink>

        <NavLink
          to="/reports"
          className={`nav-item ${isNavActive('/reports') ? 'active' : ''}`}
          onClick={onClose}
        >
          <FileText size={18} strokeWidth={1.8} />
          <span>Reports</span>
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
          <SlidersHorizontal size={18} strokeWidth={1.8} />
          <span>Settings</span>
        </NavLink>

        <button
          type="button"
          className="nav-item"
          onClick={() => {
            alert('Support desk: support@scammind.ai');
            if (onClose) onClose();
          }}
          aria-label="Support desk"
        >
          <Headphones size={18} strokeWidth={1.8} />
          <span>Support</span>
        </button>
      </div>
    </aside>
  );
};
