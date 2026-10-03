import React, { useState, useEffect } from 'react';
import {
  Palette,
  Mic,
  Shield,
  HardDrive,
  Download,
  Upload,
  Volume2,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
  ArrowUpRight,
  Sparkles,
  FileText,
  Link2,
  Zap,
  RefreshCw,
} from 'lucide-react';
import {
  UserSettings,
  AccentPalette,
  db,
  calculateStorageUsage,
  exportFullBackup,
  restoreFromBackup,
  clearAllDeskData,
  syncAppearanceToDOM,
} from '../db';
import { speechService } from '../services/voice';
import { LifeDeskLogo } from '../components/LifeDeskLogo';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onDataReset: () => void;
}

// Subtle Web Audio API synthesizer for optional interface sound feedback (100% local)
function playUiClickSound(enabled: boolean, pitch = 520) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.25, ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.055);
    setTimeout(() => ctx.close().catch(() => {}), 100);
  } catch {
    // Ignore if audio context is blocked
  }
}

const ACCENT_THEMES: Array<{
  id: AccentPalette;
  name: string;
  desc: string;
  swatch: string;
  softSwatch: string;
}> = [
  {
    id: 'indigo',
    name: 'Indigo',
    desc: 'Balanced studio violet-blue',
    swatch: '#4F46E5',
    softSwatch: '#EEF2FF',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    desc: 'Calm deep marine cyan-blue',
    swatch: '#0284C7',
    softSwatch: '#E0F2FE',
  },
  {
    id: 'forest',
    name: 'Forest',
    desc: 'Natural botanical emerald',
    swatch: '#059669',
    softSwatch: '#ECFDF5',
  },
  {
    id: 'slate',
    name: 'Slate',
    desc: 'Architectural monochrome graphite',
    swatch: '#334155',
    softSwatch: '#F1F5F9',
  },
  {
    id: 'warm',
    name: 'Warm',
    desc: 'Editorial terracotta amber',
    swatch: '#D97706',
    softSwatch: '#FFFBEB',
  },
];

const FLOW_STAGES = [
  {
    id: 'capture',
    step: '01',
    title: 'Capture',
    subtitle: 'Drop files, notes, scans, or voice',
    detail:
      'Drag any PDF, image, screenshot, text file, or record a quick note or voice memo directly onto your desk without worrying about folders.',
    icon: Upload,
  },
  {
    id: 'extract',
    step: '02',
    title: 'Extract',
    subtitle: 'Parse text, OCR, and metadata',
    detail:
      'LifeDesk reads document contents, extracts embedded PDF text or image text, and identifies dates, amounts, and structural headings.',
    icon: FileText,
  },
  {
    id: 'understand',
    step: '03',
    title: 'Understand',
    subtitle: 'Detect topics, deadlines, & context',
    detail:
      'Your workspace identifies key subjects, project acronyms (such as CIA or DTIL), upcoming deadlines, and assigns a clean category automatically.',
    icon: Sparkles,
  },
  {
    id: 'connect',
    step: '04',
    title: 'Connect',
    subtitle: 'Cluster related knowledge',
    detail:
      'Related documents, experiments, and notes are conservatively surfaced so you can link them into cohesive collections with one click.',
    icon: Link2,
  },
  {
    id: 'act',
    step: '05',
    title: 'Act',
    subtitle: 'Prioritize tasks & search instantly',
    detail:
      'Detected deadlines move into your Attention queue, while Copilot helps you organize notes, plan project tasks, and extract grounded insights.',
    icon: Zap,
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onDataReset,
}) => {
  const [activeSection, setActiveSection] = useState<
    'appearance' | 'voice' | 'permissions' | 'storage' | 'about'
  >('appearance');
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    quotaBytes: number;
    itemCount: number;
  }>({
    usedBytes: 0,
    quotaBytes: 0,
    itemCount: 0,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [testingVoice, setTestingVoice] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeFlowStage, setActiveFlowStage] = useState<string>('capture');
  const [permissionStates, setPermissionStates] = useState<{
    microphone: string;
    camera: string;
  }>({
    microphone: 'On-demand',
    camera: 'On-demand',
  });

  useEffect(() => {
    calculateStorageUsage().then(setStorageInfo);
    const loadVoices = () => {
      setBrowserVoices(speechService.getAvailableBrowserVoices());
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    checkPermissionsStatus();
  }, []);

  const checkPermissionsStatus = async () => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;
    try {
      const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setPermissionStates({
        microphone:
          mic.state === 'granted'
            ? 'Granted'
            : mic.state === 'denied'
            ? 'Blocked in browser'
            : 'Prompt on demand',
        camera:
          cam.state === 'granted'
            ? 'Granted'
            : cam.state === 'denied'
            ? 'Blocked in browser'
            : 'Prompt on demand',
      });
    } catch {
      // Browser does not support querying microphone/camera via Permissions API
    }
  };

  const handleSettingChange = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    const updated: UserSettings = { ...settings, [key]: value };
    if (key === 'animationLevel') {
      updated.reducedMotion = value !== 'full';
    }
    syncAppearanceToDOM(updated);
    playUiClickSound(updated.soundEffects, key === 'theme' ? 580 : 520);
    onUpdateSettings(updated);
    await db.settings.put(updated);
  };

  const handleTestVoice = async () => {
    setTestingVoice(true);
    await speechService.speakText(
      'Welcome to LifeDesk. Your personal workspace is ready, private, and stored locally on your device.',
      {
        voice: settings.selectedVoice,
        rate: settings.speechRate,
        volume: settings.speechVolume,
        useCloudVoice: settings.voiceEngine === 'gemini',
        onEnd: () => setTestingVoice(false),
        onError: () => setTestingVoice(false),
      }
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const json = await exportFullBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifedesk_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const res = await restoreFromBackup(text);
        setRestoreMessage(res.message);
        if (res.success) {
          onDataReset();
          calculateStorageUsage().then(setStorageInfo);
        }
      } catch (err: any) {
        setRestoreMessage(`Failed to parse backup: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleClearDesk = async () => {
    await clearAllDeskData();
    onDataReset();
    calculateStorageUsage().then(setStorageInfo);
    setShowClearConfirm(false);
    setRestoreMessage('All LifeDesk data on this device has been cleared.');
  };

  const selectedFlow = FLOW_STAGES.find((s) => s.id === activeFlowStage) || FLOW_STAGES[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 ld-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Settings & Workspace Control
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Customize your appearance, accent theme, motion preferences, voice playback, and local data
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70 self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
          <span className="capitalize">{settings.theme} mode</span>
          <span>·</span>
          <span className="capitalize">{settings.accentColor} accent</span>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl overflow-x-auto text-xs border border-slate-200/60 dark:border-slate-700/60">
        {[
          { id: 'appearance', label: 'Appearance & Layout', icon: Palette },
          { id: 'voice', label: 'Voice & Speech', icon: Mic },
          { id: 'permissions', label: 'Permissions & Privacy', icon: Shield },
          { id: 'storage', label: 'Storage & Backup', icon: HardDrive },
          { id: 'about', label: 'About LifeDesk', icon: Info },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSection(tab.id as any);
                playUiClickSound(settings.soundEffects, 490);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. APPEARANCE & LAYOUT */}
      {activeSection === 'appearance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-7 ld-enter">
          {/* Color Theme (Light / Dark / System) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Appearance Mode
              </label>
              <span className="text-[11px] text-slate-400">
                Applies immediately across all views
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  {
                    id: 'light',
                    label: 'Light',
                    desc: 'Crisp daylight paper & slate surfaces',
                    icon: Sun,
                  },
                  {
                    id: 'dark',
                    label: 'Dark',
                    desc: 'Low-glare carbon slate workspace',
                    icon: Moon,
                  },
                  {
                    id: 'system',
                    label: 'System',
                    desc: 'Follows your device OS appearance',
                    icon: Monitor,
                  },
                ] as const
              ).map((mode) => {
                const Icon = mode.icon;
                const isSelected = settings.theme === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleSettingChange('theme', mode.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-slate-800 border-indigo-500 ring-1 ring-indigo-500/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {mode.label}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {mode.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Curated Accent Themes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Accent Theme
              </label>
              <span className="text-[11px] text-slate-400">
                Updates buttons, active states, focus rings & logo accents
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {ACCENT_THEMES.map((acc) => {
                const isSelected = settings.accentColor === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => handleSettingChange('accentColor', acc.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-slate-800/90 ring-1 ring-indigo-500/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="w-5 h-5 rounded-full shadow-xs border border-black/10 dark:border-white/10"
                        style={{ backgroundColor: acc.swatch }}
                      />
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {acc.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {acc.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Theme & Accent Preview Strip */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <LifeDeskLogo size="sm" variant="mark" />
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Live Appearance Preview
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Active surfaces, accent controls, and typography scale respond in real time.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-slate-700">
                Active Context
              </span>
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-2xs">
                Primary Action
              </span>
            </div>
          </div>

          {/* Density & Desktop Sidebar Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Interface Density
              </label>
              <div className="flex gap-2">
                {(['comfortable', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => handleSettingChange('interfaceDensity', d)}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border capitalize transition cursor-pointer ${
                      settings.interfaceDensity === d
                        ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Desktop Sidebar
                </label>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Ctrl + B
                </kbd>
              </div>
              <div className="flex gap-2">
                {(['expanded', 'compact'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleSettingChange('sidebarMode', m)}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border capitalize transition cursor-pointer ${
                      (settings.sidebarMode || 'expanded') === m
                        ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Font Size & Corner Radius */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Typography Scale
              </label>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map((fs) => (
                  <button
                    key={fs}
                    onClick={() => handleSettingChange('fontSize', fs)}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border capitalize transition cursor-pointer ${
                      (settings.fontSize || 'medium') === fs
                        ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {fs}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Corner Radius
              </label>
              <div className="flex gap-2">
                {(['sharp', 'balanced', 'rounded'] as const).map((cr) => (
                  <button
                    key={cr}
                    onClick={() => handleSettingChange('cornerRadius', cr)}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border capitalize transition cursor-pointer ${
                      (settings.cornerRadius || 'balanced') === cr
                        ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {cr}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Animation Intensity & Interface Sound Effects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Animation Intensity
                </label>
                <span className="text-[10px] text-slate-400">
                  {settings.animationLevel === 'full'
                    ? 'Smooth transitions'
                    : settings.animationLevel === 'reduced'
                    ? 'Subtle & fast'
                    : 'Instant'}
                </span>
              </div>
              <div className="flex gap-2">
                {(['full', 'reduced', 'off'] as const).map((al) => (
                  <button
                    key={al}
                    onClick={() => handleSettingChange('animationLevel', al)}
                    className={`flex-1 py-2 px-3 text-xs rounded-lg border capitalize transition cursor-pointer ${
                      (settings.animationLevel || 'full') === al
                        ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {al}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Interface Sound Effects
              </label>
              <button
                onClick={() => {
                  const next = !settings.soundEffects;
                  if (next) playUiClickSound(true, 600);
                  handleSettingChange('soundEffects', next);
                }}
                className={`w-full py-2 px-3 text-xs rounded-lg border transition cursor-pointer ${
                  settings.soundEffects
                    ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {settings.soundEffects ? 'Enabled (Subtle Acoustic Feedback)' : 'Muted (Silent Workspace)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. VOICE & SPEECH */}
      {activeSection === 'voice' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6 ld-enter">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Speech Synthesis Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleSettingChange('voiceEngine', 'webspeech')}
                  className={`p-3.5 rounded-xl border text-left space-y-1 transition cursor-pointer ${
                    settings.voiceEngine === 'webspeech'
                      ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Local Device Speech
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Instant playback that works 100% offline using your device voices
                  </p>
                </button>

                <button
                  onClick={() => handleSettingChange('voiceEngine', 'gemini')}
                  className={`p-3.5 rounded-xl border text-left space-y-1 transition cursor-pointer ${
                    settings.voiceEngine === 'gemini'
                      ? 'bg-indigo-50 dark:bg-slate-800 border-indigo-500'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Studio Natural Voice
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Expressive natural workspace narrator when connected
                  </p>
                </button>
              </div>
            </div>

            {browserVoices.length > 0 && settings.voiceEngine === 'webspeech' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Preferred Voice
                </label>
                <select
                  value={settings.selectedVoice || 'default'}
                  onChange={(e) => handleSettingChange('selectedVoice', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="default">System Default Voice</option>
                  {browserVoices.slice(0, 25).map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Speaking Rate
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {(settings.speechRate || 1.0).toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.1}
                  value={settings.speechRate || 1.0}
                  onChange={(e) => handleSettingChange('speechRate', Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Speech Volume
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {Math.round((settings.speechVolume ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1.0}
                  step={0.1}
                  value={settings.speechVolume ?? 1.0}
                  onChange={(e) => handleSettingChange('speechVolume', Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleTestVoice}
                disabled={testingVoice}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-2xs transition"
              >
                <Volume2 className="w-4 h-4" />
                <span>{testingVoice ? 'Playing Voice Sample...' : 'Test Voice Playback'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PERMISSIONS & PRIVACY */}
      {activeSection === 'permissions' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-5 ld-enter">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Demand-Driven Permissions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                LifeDesk never requests permissions on startup. Hardware access is requested strictly at the moment you trigger the corresponding feature.
              </p>
            </div>
            <button
              onClick={checkPermissionsStatus}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check Status</span>
            </button>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">Microphone</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Requested only when you click Voice Capture, Voice Search, or Speak to Desk.
                </p>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {permissionStates.microphone}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">Camera</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Requested only when you open Scan to capture physical documents or receipts.
                </p>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {permissionStates.camera}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  Local Browser Database (IndexedDB)
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Stores all your files, extracted text, collections, and tasks locally on your device.
                </p>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                Active
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. STORAGE & BACKUP */}
      {activeSection === 'storage' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6 ld-enter">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Data Ownership & Local Storage
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your workspace lives on your device. Export full JSON backups or restore anytime.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">
                Local Workspace Storage Used:
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {storageInfo.itemCount} item{storageInfo.itemCount === 1 ? '' : 's'} indexed locally in <code className="font-mono">LifeDeskLocalDB</code>
              </p>
            </div>
            <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
              {(storageInfo.usedBytes / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-left space-y-1 transition cursor-pointer ld-card-hover"
            >
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {isExporting ? 'Exporting Backup...' : 'Export Full Backup'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Download a complete portable JSON archive of all items, collections, and tasks.
              </p>
            </button>

            <label className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-left space-y-1 transition cursor-pointer block ld-card-hover">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Restore from Backup
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Import a previously exported LifeDesk JSON backup file.
              </p>
              <input type="file" accept=".json" onChange={handleFileRestore} className="hidden" />
            </label>
          </div>

          {restoreMessage && (
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {restoreMessage}
            </p>
          )}

          {/* Danger zone */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <h3 className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Reset Local Desk</span>
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-rose-200 dark:border-rose-950 bg-rose-50/40 dark:bg-rose-950/20 text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">
                  Clear All LifeDesk Data
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Permanently remove all documents, notes, collections, connections, and tasks from this browser.
                </p>
              </div>
              {showClearConfirm ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleClearDesk}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Confirm Clear
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. ABOUT LIFEDESK — PREMIUM BRAND, INTERACTIVE FLOW & CREATOR SECTION */}
      {activeSection === 'about' && (
        <div className="space-y-6 ld-enter">
          {/* Brand Hero & Creator Showcase Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-3">
                <LifeDeskLogo size="lg" variant="full" />
                <p className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-200 max-w-xl">
                  Your digital desk for everything that matters.
                </p>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 max-w-2xl">
                  LifeDesk is a local-first personal workspace built to capture, understand, connect, search, and act on everything in your digital life — from college notices and project documents to receipts, voice notes, and screenshots.
                </p>
              </div>

              {/* Premium Creator Card */}
              <div className="p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 min-w-[240px] space-y-2.5 shrink-0 ld-card-hover">
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
                  CREATED BY
                </span>
                <div className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Om Labhade
                </div>
                <div className="pt-0.5">
                  <a
                    href="https://om-labhade.web.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline group"
                  >
                    <span>om-labhade.web.app</span>
                    <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Interactive Workspace Pipeline Flow Diagram */}
            <div className="py-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  How LifeDesk Works — Interactive Pipeline
                </h3>
                <span className="text-[11px] text-slate-400">
                  Select a stage to inspect
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FLOW_STAGES.map((stage) => {
                  const Icon = stage.icon;
                  const isSelected = activeFlowStage === stage.id;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveFlowStage(stage.id)}
                      onMouseEnter={() => setActiveFlowStage(stage.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-slate-800 border-indigo-500 shadow-2xs'
                          : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {stage.step}
                        </span>
                        <Icon
                          className={`w-3.5 h-3.5 ${
                            isSelected
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-400'
                          }`}
                        />
                      </div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {stage.title}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {stage.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Highlighted Stage Explanation */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5">
                  <selectedFlow.icon className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {selectedFlow.step}. {selectedFlow.title}
                    </span>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      — {selectedFlow.subtitle}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {selectedFlow.detail}
                  </p>
                </div>
              </div>
            </div>

            {/* Core Pillars */}
            <div className="py-6 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Core Pillars
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  {
                    title: 'Local-First Ownership',
                    desc: 'Your files, notes, and collections live directly in your browser database with zero mandatory cloud accounts.',
                  },
                  {
                    title: 'Conservative Smart Organization',
                    desc: 'LifeDesk suggests categories and relationships based strictly on your actual content, and you confirm every connection.',
                  },
                  {
                    title: 'Privacy & Demand-Driven Permissions',
                    desc: 'Microphone and camera access are never requested until the exact moment you initiate a capture.',
                  },
                  {
                    title: 'Grounded Workspace Intelligence',
                    desc: 'Every deadline, source citation, and collection is grounded strictly in your actual uploaded files.',
                  },
                ].map((p) => (
                  <div
                    key={p.title}
                    className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>{p.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {p.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Data & Privacy Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 text-xs">
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 dark:text-white">How Data Is Stored</h4>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  All workspace items, file binaries, extracted text, connections, attention items, and preferences are stored locally in IndexedDB (<code className="font-mono">LifeDeskLocalDB</code>). You can export a full JSON archive or wipe local storage at any time.
                </p>
              </div>
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 dark:text-white">Offline Capabilities</h4>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  Universal search, file import, PDF/text parsing, local date and topic detection, smart context clustering, attention queue tracking, document scan tools, and device speech playback work completely offline.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
