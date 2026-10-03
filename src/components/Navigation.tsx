import React from 'react';
import {
  Home,
  PlusCircle,
  Search,
  AlertCircle,
  FolderKanban,
  Wrench,
  Settings,
  Mic,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { LifeDeskLogo } from './LifeDeskLogo';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab =
  | 'home'
  | 'copilot'
  | 'search'
  | 'attention'
  | 'knowledge'
  | 'tools'
  | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenQuickCapture: () => void;
  onOpenLiveVoice: () => void;
  attentionCount: number;
  isProcessing?: boolean;
  sidebarMode?: 'expanded' | 'compact';
  onToggleSidebarMode?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  onOpenQuickCapture,
  onOpenLiveVoice,
  attentionCount,
  isProcessing = false,
  sidebarMode = 'expanded',
  onToggleSidebarMode,
}) => {
  const isCompact = sidebarMode === 'compact';

  const primaryNavItems: Array<{
    id: NavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'copilot', label: 'Copilot', icon: Sparkles },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'attention', label: 'Attention', icon: AlertCircle, badge: attentionCount },
    { id: 'knowledge', label: 'Knowledge', icon: FolderKanban },
    { id: 'tools', label: 'Tools', icon: Wrench },
  ];

  return (
    <>
      {/* Desktop Sidebar (Left) */}
      <aside
        aria-label="Workspace Navigation"
        className={`hidden md:flex flex-col ${
          isCompact ? 'w-[72px]' : 'w-64'
        } border-r border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md h-screen sticky top-0 shrink-0 select-none z-30 transition-[width] duration-200 ease-out`}
      >
        {/* Brand Header */}
        <div
          className={`h-16 px-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center ${
            isCompact ? 'justify-center' : 'justify-between'
          }`}
        >
          <LifeDeskLogo
            size="md"
            variant={isCompact ? 'mark' : 'full'}
            isProcessing={isProcessing}
            onClick={() => onSelectTab('home')}
          />
          {onToggleSidebarMode && !isCompact && (
            <button
              onClick={onToggleSidebarMode}
              title="Collapse sidebar (Ctrl + B)"
              aria-label="Collapse sidebar (Ctrl + B)"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group relative"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Primary Capture Actions */}
        <div className="p-3 space-y-2">
          <button
            onClick={onOpenQuickCapture}
            title={isCompact ? 'Add to Desk (File, Note, Scan, Voice)' : 'Capture file, note, scan, or voice'}
            className={`w-full flex items-center justify-center gap-2 py-2.5 ${
              isCompact ? 'px-0' : 'px-3'
            } text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-all cursor-pointer ld-card-hover`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            {!isCompact && <span>Add to Desk</span>}
          </button>

          <button
            onClick={onOpenLiveVoice}
            title={isCompact ? 'Speak to Desk (Voice Assistant)' : 'Live voice session'}
            className={`w-full flex items-center justify-center gap-2 py-2 ${
              isCompact ? 'px-0' : 'px-3'
            } text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 rounded-xl transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700/80`}
          >
            <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            {!isCompact && <span>Speak to Desk</span>}
          </button>
        </div>

        {/* Main Navigation Items */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                title={isCompact ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center ${
                  isCompact ? 'justify-center px-0' : 'justify-between px-3'
                } py-2.5 text-xs rounded-xl transition-all cursor-pointer relative group ${
                  isActive
                    ? 'bg-indigo-50/90 dark:bg-slate-800/95 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 font-medium'
                }`}
              >
                {/* Active left indicator pill */}
                {isActive && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-400"
                    aria-hidden="true"
                  />
                )}

                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                      isActive
                        ? 'text-indigo-600 dark:text-indigo-400 scale-105'
                        : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                    }`}
                  />
                  {!isCompact && <span className="truncate">{item.label}</span>}
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`${
                      isCompact ? 'absolute top-1.5 right-1.5 px-1 min-w-[16px]' : 'px-1.5 py-0.5'
                    } text-[10px] tabular-nums font-bold rounded-md bg-amber-100 dark:bg-amber-950/90 text-amber-800 dark:text-amber-300 text-center`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Settings & Sidebar Toggle Rail */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          {/* Settings Item pinned at bottom of sidebar */}
          <button
            onClick={() => onSelectTab('settings')}
            title={isCompact ? 'Settings' : undefined}
            aria-current={currentTab === 'settings' ? 'page' : undefined}
            className={`w-full flex items-center ${
              isCompact ? 'justify-center px-0' : 'justify-between px-3'
            } py-2.5 text-xs rounded-xl transition-all cursor-pointer relative group ${
              currentTab === 'settings'
                ? 'bg-indigo-50/90 dark:bg-slate-800/95 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 font-medium'
            }`}
          >
            {currentTab === 'settings' && (
              <span
                className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-400"
                aria-hidden="true"
              />
            )}
            <div className="flex items-center gap-2.5">
              <Settings
                className={`w-4 h-4 shrink-0 ${
                  currentTab === 'settings'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }`}
              />
              {!isCompact && <span>Settings</span>}
            </div>
          </button>

          {isCompact && onToggleSidebarMode ? (
            <button
              onClick={onToggleSidebarMode}
              title="Expand sidebar (Ctrl + B)"
              aria-label="Expand sidebar (Ctrl + B)"
              className="w-full flex items-center justify-center p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center justify-between px-1 pt-1">
              <PWAInstallButton />
              {onToggleSidebarMode && (
                <button
                  onClick={onToggleSidebarMode}
                  title="Toggle sidebar (Ctrl + B)"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200/70 dark:border-slate-800 transition-colors cursor-pointer"
                >
                  <span>Sidebar</span>
                  <kbd className="font-mono text-[9px] text-slate-500 dark:text-slate-400">
                    Ctrl+B
                  </kbd>
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <LifeDeskLogo
          size="sm"
          variant="full"
          isProcessing={isProcessing}
          onClick={() => onSelectTab('home')}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenLiveVoice}
            aria-label="Speak to Desk"
            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <Mic className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </button>
          <button
            onClick={onOpenQuickCapture}
            aria-label="Quick capture"
            className="flex items-center gap-1 bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
          <button
            onClick={() => onSelectTab('settings')}
            aria-label="Settings"
            className={`p-1.5 rounded-lg ${
              currentTab === 'settings'
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-1 py-1.5 flex items-center justify-around z-30">
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-lg transition-colors relative ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 text-[9px] tabular-nums font-bold px-1 rounded-full bg-amber-500 text-white">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
