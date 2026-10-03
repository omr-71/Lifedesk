import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  FileText,
  Mic,
  Camera,
  FolderKanban,
  AlertCircle,
  Wrench,
  Settings,
  Sparkles,
  Download,
  Moon,
  PanelLeft,
} from 'lucide-react';
import { NavTab } from './Navigation';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: NavTab) => void;
  onOpenCapture: (mode?: 'file' | 'note' | 'voice' | 'camera' | 'link') => void;
  onOpenLiveVoice: () => void;
  onToggleTheme: () => void;
  onToggleSidebar?: () => void;
  onExportBackup: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onOpenCapture,
  onOpenLiveVoice,
  onToggleTheme,
  onToggleSidebar,
  onExportBackup,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const commands = [
    {
      id: 'nav-copilot',
      title: 'Open LifeDesk Copilot',
      category: 'Intelligence',
      icon: Sparkles,
      action: () => {
        onClose();
        onSelectTab('copilot');
      },
    },
    {
      id: 'capture-file',
      title: 'Import File or Document',
      category: 'Capture',
      icon: Plus,
      action: () => {
        onClose();
        onOpenCapture('file');
      },
    },
    {
      id: 'capture-note',
      title: 'Create Quick Note',
      category: 'Capture',
      icon: FileText,
      action: () => {
        onClose();
        onOpenCapture('note');
      },
    },
    {
      id: 'capture-voice',
      title: 'Record Voice Memo or Command',
      category: 'Capture',
      icon: Mic,
      action: () => {
        onClose();
        onOpenCapture('voice');
      },
    },
    {
      id: 'capture-scan',
      title: 'Scan Document / Camera',
      category: 'Capture',
      icon: Camera,
      action: () => {
        onClose();
        onOpenCapture('camera');
      },
    },
    {
      id: 'speak-live',
      title: 'Speak to LifeDesk (Live Voice)',
      category: 'Voice',
      icon: Mic,
      action: () => {
        onClose();
        onOpenLiveVoice();
      },
    },
    {
      id: 'nav-search',
      title: 'Go to Universal Search',
      category: 'Navigation',
      icon: Search,
      action: () => {
        onClose();
        onSelectTab('search');
      },
    },
    {
      id: 'nav-attention',
      title: 'Go to Attention Queue',
      category: 'Navigation',
      icon: AlertCircle,
      action: () => {
        onClose();
        onSelectTab('attention');
      },
    },
    {
      id: 'nav-knowledge',
      title: 'Go to Knowledge & Collections',
      category: 'Navigation',
      icon: FolderKanban,
      action: () => {
        onClose();
        onSelectTab('knowledge');
      },
    },
    {
      id: 'nav-tools',
      title: 'Open Workspace Tools',
      category: 'Navigation',
      icon: Wrench,
      action: () => {
        onClose();
        onSelectTab('tools');
      },
    },
    {
      id: 'action-theme',
      title: 'Toggle Light / Dark Theme',
      category: 'Appearance',
      icon: Moon,
      action: () => {
        onClose();
        onToggleTheme();
      },
    },
    ...(onToggleSidebar
      ? [
          {
            id: 'action-sidebar',
            title: 'Toggle Sidebar (Ctrl + B)',
            category: 'Appearance',
            icon: PanelLeft,
            action: () => {
              onClose();
              onToggleSidebar();
            },
          },
        ]
      : []),
    {
      id: 'action-backup',
      title: 'Export Workspace Backup (JSON)',
      category: 'Data',
      icon: Download,
      action: () => {
        onClose();
        onExportBackup();
      },
    },
    {
      id: 'nav-settings',
      title: 'Open Settings & About LifeDesk',
      category: 'Navigation',
      icon: Settings,
      action: () => {
        onClose();
        onSelectTab('settings');
      },
    },
  ];

  const filteredCommands = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDownInInput = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        (prev) =>
          (prev - 1 + Math.max(1, filteredCommands.length)) %
          Math.max(1, filteredCommands.length)
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 bg-slate-950/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDownInInput}
            placeholder="Type a command or jump to section..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No matching commands found.
            </div>
          ) : (
            filteredCommands.map((command, idx) => {
              const Icon = command.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={command.id}
                  onClick={command.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer text-left ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium">{command.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{command.category}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Use ↑ ↓ to navigate, Enter to select</span>
          <span>Command Palette</span>
        </div>
      </div>
    </div>
  );
};
