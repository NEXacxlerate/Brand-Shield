import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAiStatus } from '../lib/useAiStatus';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

/** Friendly notice when the server says an AI feature is not set up or today's allowance is used up. */
export const AiStatusBanner: React.FC<{ scope: 'chat' | 'image' | 'both' }> = ({ scope }) => {
  const { status, failed } = useAiStatus();
  const { isDark } = useTheme();
  const messages: string[] = [];
  if (failed) messages.push('Could not check the AI service. AI tools may not respond right now.');
  if (status) {
    const wantChat = scope !== 'image';
    const wantImage = scope !== 'chat';
    if (wantChat && !status.chat.configured) messages.push('AI text tools are not set up on the server yet.');
    else if (wantChat && status.chat.daily_limit && (status.chat.used_today ?? 0) >= status.chat.daily_limit) messages.push("You have used today's text AI allowance. It resets at midnight UTC.");
    if (wantImage && !status.image.configured) messages.push('AI logo generation is not available right now. You can upload your own logo instead.');
    else if (wantImage && status.image.daily_limit && (status.image.used_today ?? 0) >= status.image.daily_limit) messages.push("You have used today's logo-generation allowance. Upload your own logo, or try again after midnight UTC.");
  }
  if (messages.length === 0) return null;
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-2xl border p-4 text-sm', isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800')}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="space-y-0.5">{messages.map((m) => <p key={m}>{m}</p>)}</div>
    </div>
  );
};
