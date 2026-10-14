import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

/** Manual logo fallback: pick a PNG/JPEG/WebP from the computer. Resizing/validation happens where it is used. */
export const LogoUpload: React.FC<{ onPick: (file: File) => void; label?: string; className?: string }> = ({ onPick, label = 'Upload your own logo', className }) => {
  const ref = useRef<HTMLInputElement>(null);
  const { isDark } = useTheme();
  return (
    <>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="logo-file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()}
        className={cn('flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
          isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50', className)}>
        <Upload size={16} /> {label}
      </button>
    </>
  );
};
