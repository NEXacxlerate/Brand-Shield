import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { useBrand } from '../../hooks/useBrand';
import './Layout.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { brand } = useBrand();
  // Pages are remounted (so they reload) only when the person switches to ANOTHER brand, not when the first one finishes loading.
  const [seen, setSeen] = useState<{ id: number | null; epoch: number }>({ id: null, epoch: 0 });
  if (brand && brand.id !== seen.id) setSeen({ id: brand.id, epoch: seen.id === null ? seen.epoch : seen.epoch + 1 });

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main Panel */}
      <main className="main-panel" key={seen.epoch}>
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
