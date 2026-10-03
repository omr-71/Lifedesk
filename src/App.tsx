import React, { useState, useEffect, useCallback } from 'react';
import {
  db,
  WorkspaceItem,
  KnowledgeCollection,
  ItemConnection,
  AttentionItem,
  UserSettings,
  DEFAULT_SETTINGS,
  exportFullBackup,
  syncAppearanceToDOM,
} from './db';
import { Navigation, NavTab } from './components/Navigation';
import { CommandPalette } from './components/CommandPalette';
import { UniversalCaptureModal, CaptureMode } from './components/UniversalCaptureModal';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { LiveVoiceModal } from './components/LiveVoiceModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { speechService } from './services/voice';

import { HomeView } from './views/HomeView';
import { CopilotView } from './views/CopilotView';
import { SearchView } from './views/SearchView';
import { AttentionView } from './views/AttentionView';
import { KnowledgeView } from './views/KnowledgeView';
import { ToolsView } from './views/ToolsView';
import { SettingsView } from './views/SettingsView';

export function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [connections, setConnections] = useState<ItemConnection[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modals & voice search state
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [captureInitialMode, setCaptureInitialMode] = useState<CaptureMode>('file');
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<WorkspaceItem | null>(null);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');

  // Drag and drop overlay state
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const storedSettings = await db.settings.get('default');
      if (storedSettings) {
        const merged: UserSettings = { ...DEFAULT_SETTINGS, ...storedSettings };
        setSettings(merged);
        syncAppearanceToDOM(merged);
      } else {
        await db.settings.put(DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
        syncAppearanceToDOM(DEFAULT_SETTINGS);
      }

      const allItems = await db.items.reverse().sortBy('createdAt');
      setItems(allItems);

      const allCols = await db.collections.toArray();
      setCollections(allCols);

      const allConns = await db.connections.toArray();
      setConnections(allConns);

      const allAttention = await db.attentionItems.reverse().sortBy('createdAt');
      setAttentionItems(allAttention);
    } catch (err) {
      console.error('Error loading LifeDesk data from IndexedDB:', err);
    }
  };

  // Sync theme, accent, corner radius, density, font size, and animation intensity with DOM + OS media query
  useEffect(() => {
    syncAppearanceToDOM(settings);

    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (settings.theme === 'system') {
        syncAppearanceToDOM(settings);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [settings]);

  const handleToggleSidebarMode = useCallback(async () => {
    setSettings((prev) => {
      const nextMode: 'expanded' | 'compact' =
        prev.sidebarMode === 'compact' ? 'expanded' : 'compact';
      const updated: UserSettings = { ...prev, sidebarMode: nextMode };
      syncAppearanceToDOM(updated);
      db.settings.put(updated).catch(() => {});
      return updated;
    });
  }, []);

  // Global Keyboard Shortcuts:
  // - Cmd+K / Ctrl+K -> Command Palette
  // - Ctrl+B / Cmd+B -> Sidebar Toggle (ignoring inputs, textareas, contenteditable)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === 'b') {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tagName = target.tagName.toLowerCase();
          const isEditable =
            tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select' ||
            target.isContentEditable;
          if (isEditable) {
            return;
          }
        }
        e.preventDefault();
        handleToggleSidebarMode();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleToggleSidebarMode]);

  // Global Drag & Drop file listener -> triggers Intelligent Import Pipeline immediately
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDraggingFile(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX === 0 || e.clientY === 0) {
        setIsDraggingFile(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        setDroppedFile(e.dataTransfer.files[0]);
        setCaptureInitialMode('file');
        setIsCaptureOpen(true);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const openCapture = (mode: CaptureMode = 'file') => {
    setDroppedFile(null);
    setCaptureInitialMode(mode);
    setIsCaptureOpen(true);
  };

  const handleItemSaved = (_newItem: WorkspaceItem) => {
    loadAllData();
  };

  const handleItemUpdated = (updatedItem: WorkspaceItem) => {
    setViewingItem(updatedItem);
    loadAllData();
  };

  const handleItemDeleted = (_deletedId: string) => {
    setViewingItem(null);
    loadAllData();
  };

  const handleConfirmAttentionItem = async (id: string) => {
    await db.attentionItems.update(id, { status: 'confirmed', updatedAt: Date.now() });
    loadAllData();
  };

  const handleDismissAttentionItem = async (id: string) => {
    await db.attentionItems.update(id, { status: 'dismissed', updatedAt: Date.now() });
    loadAllData();
  };

  const handleCompleteAttentionItem = async (id: string) => {
    await db.attentionItems.update(id, { status: 'completed', updatedAt: Date.now() });
    loadAllData();
  };

  const handleToggleTheme = async () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    const nextTheme: 'light' | 'dark' = isCurrentlyDark ? 'light' : 'dark';
    const updated: UserSettings = { ...settings, theme: nextTheme };
    syncAppearanceToDOM(updated);
    setSettings(updated);
    await db.settings.put(updated);
  };

  const handleExportBackup = async () => {
    const json = await exportFullBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifedesk_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVoiceSearchCommand = (query: string) => {
    setSearchInitialQuery(query);
    setCurrentTab('search');
  };

  const handleReadAttentionAloudCommand = () => {
    setCurrentTab('attention');
    const active = attentionItems.filter(
      (a) => a.status === 'pending' || a.status === 'confirmed'
    );
    if (active.length === 0) {
      speechService.speakText('Nothing needs your attention right now. Your queue is clear.');
    } else {
      const text = `You have ${active.length} item${
        active.length === 1 ? '' : 's'
      } needing attention. ${active
        .map((a, i) => `Item ${i + 1}: ${a.title}, from ${a.sourceItemTitle}.`)
        .join(' ')}`;
      speechService.speakText(text);
    }
  };

  const activeAttentionCount = attentionItems.filter(
    (a) => a.status === 'pending' || a.status === 'confirmed'
  ).length;

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row antialiased transition-colors duration-200 ${
        settings.interfaceDensity === 'compact' ? 'text-xs' : ''
      }`}
    >
      {/* Global Drag-and-drop feedback overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-indigo-600/20 backdrop-blur-xs flex items-center justify-center pointer-events-none border-4 border-dashed border-indigo-500">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl text-center space-y-2 border border-indigo-300 dark:border-slate-700">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              Drop file onto your desk
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              LifeDesk will extract text, detect dates, and organize it automatically
            </p>
          </div>
        </div>
      )}

      {/* Navigation (Desktop sidebar & Mobile top/bottom) */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenQuickCapture={() => openCapture('file')}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        attentionCount={activeAttentionCount}
        isProcessing={isProcessing}
        sidebarMode={settings.sidebarMode}
        onToggleSidebarMode={handleToggleSidebarMode}
      />

      {/* Main View Area */}
      <main className="flex-1 min-h-[calc(100vh-60px)] md:min-h-screen pb-20 md:pb-12 overflow-y-auto">
        {currentTab === 'home' && (
          <HomeView
            items={items}
            collections={collections}
            connections={connections}
            attentionItems={attentionItems}
            onOpenCapture={openCapture}
            onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
            onSelectItem={(item) => setViewingItem(item)}
            onGoToSearch={() => {
              setSearchInitialQuery('');
              setCurrentTab('search');
            }}
            onGoToAttention={() => setCurrentTab('attention')}
            onGoToCopilot={() => setCurrentTab('copilot')}
            onGoToKnowledge={() => setCurrentTab('knowledge')}
            onConfirmAttentionItem={handleConfirmAttentionItem}
            onDismissAttentionItem={handleDismissAttentionItem}
            onCompleteAttentionItem={handleCompleteAttentionItem}
            onReload={loadAllData}
          />
        )}

        {currentTab === 'copilot' && (
          <CopilotView
            items={items}
            collections={collections}
            attentionItems={attentionItems}
            onSelectItem={(item) => setViewingItem(item)}
            onOpenCapture={openCapture}
            onReload={loadAllData}
            onNavigateTab={setCurrentTab}
          />
        )}

        {currentTab === 'search' && (
          <SearchView
            items={items}
            collections={collections}
            initialQuery={searchInitialQuery}
            onSelectItem={(item) => setViewingItem(item)}
          />
        )}

        {currentTab === 'attention' && (
          <AttentionView
            attentionItems={attentionItems}
            items={items}
            onSelectItem={(item) => setViewingItem(item)}
            onConfirmItem={handleConfirmAttentionItem}
            onDismissItem={handleDismissAttentionItem}
            onCompleteItem={handleCompleteAttentionItem}
            onReload={loadAllData}
          />
        )}

        {currentTab === 'knowledge' && (
          <KnowledgeView
            items={items}
            collections={collections}
            connections={connections}
            onSelectItem={(item) => setViewingItem(item)}
            onReload={loadAllData}
          />
        )}

        {currentTab === 'tools' && (
          <ToolsView
            items={items}
            onItemSaved={handleItemSaved}
            onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={(updated) => {
              syncAppearanceToDOM(updated);
              setSettings(updated);
            }}
            onDataReset={loadAllData}
          />
        )}
      </main>

      {/* Universal Intelligent Import & Capture Modal */}
      <UniversalCaptureModal
        isOpen={isCaptureOpen}
        onClose={() => {
          setIsCaptureOpen(false);
          setDroppedFile(null);
        }}
        initialMode={captureInitialMode}
        initialDroppedFile={droppedFile}
        onItemSaved={handleItemSaved}
        onOpenItem={(item) => setViewingItem(item)}
        onExecuteVoiceSearch={handleVoiceSearchCommand}
        onReadAttentionAloud={handleReadAttentionAloudCommand}
      />

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        item={viewingItem}
        onClose={() => setViewingItem(null)}
        onItemUpdated={handleItemUpdated}
        onItemDeleted={handleItemDeleted}
        onSelectRelatedItem={(item) => setViewingItem(item)}
      />

      {/* Live Voice Conversation Modal */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
      />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={setCurrentTab}
        onOpenCapture={openCapture}
        onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
        onToggleTheme={handleToggleTheme}
        onToggleSidebar={handleToggleSidebarMode}
        onExportBackup={handleExportBackup}
      />

      {/* Offline Status Indicator */}
      <OfflineIndicator />
    </div>
  );
}

export default App;
