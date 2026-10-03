import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-slate-900/90 dark:bg-slate-800/90 text-slate-100 border border-slate-700/60 backdrop-blur-md px-3 py-1.5 text-xs font-medium shadow-xl"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Offline Mode — All items and search remain fully functional locally</span>
    </div>
  );
};
