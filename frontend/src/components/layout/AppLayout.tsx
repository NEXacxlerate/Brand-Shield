import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import './Layout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main Panel */}
      <main className="main-panel">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as any, {
              onOpenMobileMenu: () => setMobileMenuOpen(true)
            });
          }
          return child;
        })}
      </main>
    </div>
  );
};
