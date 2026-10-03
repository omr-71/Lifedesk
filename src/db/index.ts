import Dexie, { type Table } from 'dexie';

export interface WorkspaceItem {
  id: string;
  title: string;
  type: 'document' | 'image' | 'note' | 'voice' | 'link' | 'video';
  content: string;
  summary?: string;
  fileData?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  source?: string;
  tags: string[];
  topics?: string[];
  collectionIds: string[];
  suggestedCollection?: string;
  detectedDates: Array<{
    label: string;
    date: string;
    confidence: 'high' | 'medium' | 'low';
    confirmed?: boolean;
  }>;
  isImportant: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

export interface KnowledgeCollection {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  isSuggested?: boolean;
  createdAt: number;
}

export interface ItemConnection {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  relationType: string;
  reason?: string;
  notes?: string;
  suggested?: boolean;
  createdAt: number;
}

export interface AttentionItem {
  id: string;
  title: string;
  sourceItemId: string;
  sourceItemTitle: string;
  sourceItemType: string;
  dueDate?: string;
  snoozedUntil?: number;
  status: 'pending' | 'confirmed' | 'dismissed' | 'completed';
  type: 'deadline' | 'task' | 'review' | 'reminder';
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
  updatedAt: number;
}

export type AccentPalette = 'indigo' | 'ocean' | 'forest' | 'slate' | 'warm';

export interface UserSettings {
  id: string;
  theme: 'light' | 'dark' | 'system';
  accentColor: AccentPalette;
  interfaceDensity: 'comfortable' | 'compact';
  cornerRadius: 'sharp' | 'balanced' | 'rounded';
  animationLevel: 'full' | 'reduced' | 'off';
  fontSize: 'small' | 'medium' | 'large';
  sidebarMode: 'expanded' | 'compact';
  reducedMotion: boolean;
  soundEffects: boolean;
  voiceEngine: 'webspeech' | 'gemini';
  selectedVoice: string;
  speechRate: number;
  speechVolume: number;
  notificationsEnabled: boolean;
  aiEnabled: boolean;
  hasCompletedOnboarding: boolean;
}

export class LifeDeskDatabase extends Dexie {
  items!: Table<WorkspaceItem, string>;
  collections!: Table<KnowledgeCollection, string>;
  connections!: Table<ItemConnection, string>;
  attentionItems!: Table<AttentionItem, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super('LifeDeskLocalDB');
    this.version(1).stores({
      items: 'id, title, type, createdAt, updatedAt, isImportant, *tags, *collectionIds',
      collections: 'id, name, parentId, createdAt',
      connections: 'id, sourceItemId, targetItemId, suggested, createdAt',
      attentionItems: 'id, sourceItemId, status, type, priority, dueDate, createdAt',
      settings: 'id',
    });
  }
}

export const db = new LifeDeskDatabase();

const osPrefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  theme: 'system',
  accentColor: 'indigo',
  interfaceDensity: 'comfortable',
  cornerRadius: 'balanced',
  animationLevel: osPrefersReducedMotion ? 'reduced' : 'full',
  fontSize: 'medium',
  sidebarMode: 'expanded',
  reducedMotion: osPrefersReducedMotion,
  soundEffects: false,
  voiceEngine: 'webspeech',
  selectedVoice: 'default',
  speechRate: 1.0,
  speechVolume: 1.0,
  notificationsEnabled: false,
  aiEnabled: true,
  hasCompletedOnboarding: false,
};

export function normalizeAccent(raw?: string): AccentPalette {
  if (raw === 'ocean' || raw === 'blue') return 'ocean';
  if (raw === 'forest' || raw === 'emerald') return 'forest';
  if (raw === 'slate') return 'slate';
  if (raw === 'warm' || raw === 'amber' || raw === 'rose') return 'warm';
  return 'indigo';
}

export function loadCachedAppearanceSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem('lifedesk_appearance_prefs');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      accentColor: normalizeAccent(parsed.accentColor),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function syncAppearanceToDOM(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark =
    settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);

  if (isDark) {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }

  const normalizedAccent = normalizeAccent(settings.accentColor);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  root.setAttribute('data-accent', normalizedAccent);
  root.setAttribute('data-density', settings.interfaceDensity || 'comfortable');
  root.setAttribute('data-animation', settings.animationLevel || 'full');
  root.setAttribute('data-radius', settings.cornerRadius || 'balanced');

  root.style.fontSize =
    settings.fontSize === 'small'
      ? '14px'
      : settings.fontSize === 'large'
      ? '17px'
      : '15.5px';

  try {
    localStorage.setItem(
      'lifedesk_appearance_prefs',
      JSON.stringify({
        theme: settings.theme,
        accentColor: normalizedAccent,
        interfaceDensity: settings.interfaceDensity,
        cornerRadius: settings.cornerRadius,
        animationLevel: settings.animationLevel,
        fontSize: settings.fontSize,
        sidebarMode: settings.sidebarMode,
        reducedMotion: settings.reducedMotion,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ld_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Local date & deadline extraction
export function extractLocalDates(
  text: string
): Array<{ label: string; date: string; confidence: 'high' | 'medium' | 'low'; confirmed?: boolean }> {
  if (!text) return [];
  const results: Array<{ label: string; date: string; confidence: 'high' | 'medium' | 'low'; confirmed?: boolean }> = [];

  const deadlineRegex =
    /(?:deadline|due date|due by|due on|submission|submit by|exam on|exam date|presentation on|meeting on|scheduled for|last date|closing date|expires on)\s*[:\-–]?\s*([A-Za-z0-9\s,\/.-]{4,28})/gi;
  let match;
  while ((match = deadlineRegex.exec(text)) !== null) {
    const rawLabel = match[0].split(/[:\-–]/)[0].trim();
    const rawSnippet = match[1].trim().replace(/[.,;\n\r]+.*$/, '').trim();
    if (rawSnippet.length >= 4 && !results.some((r) => r.date.toLowerCase() === rawSnippet.toLowerCase())) {
      results.push({
        label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
        date: rawSnippet,
        confidence: 'high',
      });
    }
  }

  // Named dates: e.g. 15 October 2026, Oct 15, October 15, 2026-10-15, 15/10/2026
  const standardDateRegex =
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/gi;
  while ((match = standardDateRegex.exec(text)) !== null) {
    const val = match[1].trim();
    if (!results.some((r) => r.date.toLowerCase().includes(val.toLowerCase()))) {
      // Find surrounding context words for a better label
      const startCtx = Math.max(0, match.index - 35);
      const beforeText = text.slice(startCtx, match.index).trim();
      const hasActionWord = /(?:due|submit|deadline|exam|test|notice|project|assignment|bill|pay|meeting|event|presentation)/i.test(beforeText);
      results.push({
        label: hasActionWord ? 'Possible deadline' : 'Detected date',
        date: val,
        confidence: hasActionWord ? 'high' : 'medium',
      });
    }
  }

  return results.slice(0, 6);
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'were', 'what', 'your', 'about', 'document', 'image',
  'notes', 'file', 'page', 'into', 'only', 'also', 'some', 'more', 'other', 'than', 'then',
  'them', 'they', 'their', 'there', 'where', 'when', 'which', 'while', 'would', 'could', 'should',
  'will', 'shall', 'been', 'being', 'here', 'very', 'much', 'many', 'most', 'such', 'same',
  'each', 'every', 'both', 'either', 'neither', 'after', 'before', 'during', 'under', 'over',
  'between', 'through', 'because', 'since', 'until', 'unless', 'although', 'though', 'whether',
  'uploaded', 'captured', 'size', 'type', 'unknown', 'untitled',
]);

// Extract meaningful topics & keywords from title, filename, and content
export function extractKeywordsAndTopics(title: string, content: string, fileName?: string): {
  keywords: string[];
  topics: string[];
  suggestedCategory: string | null;
} {
  const combined = `${title} ${fileName || ''} ${content.slice(0, 4000)}`;

  // Detect uppercase acronyms or course/project codes (e.g., CIA, DTIL, PPS, DBMS, AI, GST, tax)
  const acronymMatches = combined.match(/\b[A-Z]{2,6}(?:\s*[-_]?\s*\d{1,3})?\b/g) || [];
  const validAcronyms = Array.from(
    new Set(
      acronymMatches
        .map((a) => a.trim())
        .filter((a) => !['PDF', 'PNG', 'JPG', 'JPEG', 'TXT', 'DOC', 'DOCX', 'PPT', 'PPTX', 'CSV', 'URL', 'HTTP', 'HTTPS', 'KB', 'MB'].includes(a))
    )
  ).slice(0, 4);

  // Extract capitalized phrases (e.g. "Experiment 3", "Sustainable Shopping", "Project Presentation")
  const phraseMatches = combined.match(/\b([A-Z][a-z]{2,15}(?:\s+(?:[A-Z][a-z]{2,15}|\d{1,3}))+)\b/g) || [];
  const validPhrases = Array.from(new Set(phraseMatches.map((p) => p.trim()))).slice(0, 4);

  // Word frequency for keywords
  const words = combined
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  // Determine high-confidence category based on real content signals
  const lower = combined.toLowerCase();
  let suggestedCategory: string | null = null;

  const categoryRules: Array<{ name: string; patterns: RegExp[]; minMatches: number }> = [
    {
      name: 'College',
      patterns: [/\bcia\b/i, /\bexam\b/i, /\bsemester\b/i, /\bsyllabus\b/i, /\bassignment\b/i, /\blab\b/i, /\bexperiment\b/i, /\blecture\b/i, /\bprofessor\b/i, /\buniversity\b/i, /\bcollege\b/i, /\bcourse\b/i, /\bdtil\b/i, /\bpps\b/i],
      minMatches: 1,
    },
    {
      name: 'Finance',
      patterns: [/\breceipt\b/i, /\binvoice\b/i, /\bpayment\b/i, /\btax\b/i, /\bbank\b/i, /\bbudget\b/i, /\btransaction\b/i, /\bbill\b/i, /\bsalary\b/i, /\bamount\b/i],
      minMatches: 1,
    },
    {
      name: 'Projects',
      patterns: [/\bproject\b/i, /\bmilestone\b/i, /\barchitecture\b/i, /\bprototype\b/i, /\bdeployment\b/i, /\bsprint\b/i, /\broadmap\b/i, /\bpresentation\b/i],
      minMatches: 1,
    },
    {
      name: 'Research',
      patterns: [/\bresearch\b/i, /\bstudy\b/i, /\bpaper\b/i, /\babstract\b/i, /\bmethodology\b/i, /\banalysis\b/i, /\bfindings\b/i, /\bliterature\b/i],
      minMatches: 1,
    },
    {
      name: 'Work',
      patterns: [/\bmeeting\b/i, /\bclient\b/i, /\bcontract\b/i, /\bproposal\b/i, /\bquarterly\b/i, /\bmanager\b/i, /\boffice\b/i, /\bresume\b/i],
      minMatches: 1,
    },
    {
      name: 'Travel',
      patterns: [/\bflight\b/i, /\bhotel\b/i, /\bboarding\b/i, /\bitinerary\b/i, /\bticket\b/i, /\bpassport\b/i, /\bbooking\b/i],
      minMatches: 1,
    },
    {
      name: 'Personal',
      patterns: [/\bjournal\b/i, /\bhealth\b/i, /\bmedical\b/i, /\bfamily\b/i, /\bgrocery\b/i, /\bhome\b/i, /\bpersonal\b/i],
      minMatches: 1,
    },
  ];

  let bestScore = 0;
  for (const rule of categoryRules) {
    let matches = 0;
    for (const pat of rule.patterns) {
      if (pat.test(lower)) matches++;
    }
    if (matches >= rule.minMatches && matches > bestScore) {
      bestScore = matches;
      suggestedCategory = rule.name;
    }
  }

  const topics = Array.from(new Set([...validAcronyms, ...validPhrases])).slice(0, 5);
  return {
    keywords: topWords,
    topics,
    suggestedCategory,
  };
}

// Conservative smart relationship detector between one item and all desk items
export async function detectPotentialConnections(
  itemId: string
): Promise<Array<{ targetItem: WorkspaceItem; commonKeywords: string[]; confidence: 'high' | 'medium' }>> {
  const currentItem = await db.items.get(itemId);
  if (!currentItem) return [];

  const allItems = await db.items.toArray();
  const existingConnections = await db.connections
    .filter((c) => c.sourceItemId === itemId || c.targetItemId === itemId)
    .toArray();

  const connectedIds = new Set(existingConnections.flatMap((c) => [c.sourceItemId, c.targetItemId]));
  connectedIds.add(itemId);

  const extractTokens = (item: WorkspaceItem) => {
    const raw = `${item.title} ${item.fileName || ''} ${item.tags.join(' ')} ${(item.topics || []).join(' ')} ${item.content.slice(0, 1500)}`;
    return new Set(
      raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    );
  };

  const currentTokens = extractTokens(currentItem);
  const suggestions: Array<{ targetItem: WorkspaceItem; commonKeywords: string[]; confidence: 'high' | 'medium' }> = [];

  for (const other of allItems) {
    if (connectedIds.has(other.id)) continue;
    const otherTokens = extractTokens(other);
    const sharedTokens = [...currentTokens].filter((w) => otherTokens.has(w));
    const sharedTags = currentItem.tags.filter((t) =>
      other.tags.some((ot) => ot.toLowerCase() === t.toLowerCase())
    );
    const sharedTopics = (currentItem.topics || []).filter((tp) =>
      (other.topics || []).some((otp) => otp.toLowerCase() === tp.toLowerCase())
    );

    const combinedSignals = Array.from(new Set([...sharedTopics, ...sharedTags, ...sharedTokens]));

    if (sharedTopics.length >= 1 || sharedTags.length >= 1 || sharedTokens.length >= 2) {
      suggestions.push({
        targetItem: other,
        commonKeywords: combinedSignals.slice(0, 4),
        confidence: sharedTopics.length >= 1 || sharedTokens.length >= 3 ? 'high' : 'medium',
      });
    }
  }

  return suggestions.sort((a, b) => b.commonKeywords.length - a.commonKeywords.length).slice(0, 5);
}

// Find multi-item context clusters across the entire desk (e.g., "DTIL · Experiment 3 — 3 related items")
export function findUnlinkedContextClusters(
  items: WorkspaceItem[],
  connections: ItemConnection[]
): Array<{
  contextLabel: string;
  keywords: string[];
  items: WorkspaceItem[];
}> {
  if (items.length < 2) return [];

  const connectedPairs = new Set(
    connections.flatMap((c) => [`${c.sourceItemId}:${c.targetItemId}`, `${c.targetItemId}:${c.sourceItemId}`])
  );

  // Map significant tokens/topics to items
  const tokenMap = new Map<string, WorkspaceItem[]>();

  for (const item of items) {
    const signals = new Set<string>();
    (item.topics || []).forEach((t) => signals.add(t.trim()));
    item.tags.forEach((t) => signals.add(t.trim()));

    const titleWords = item.title
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));
    titleWords.forEach((w) => signals.add(w));

    for (const sig of signals) {
      const key = sig.toLowerCase();
      if (STOP_WORDS.has(key)) continue;
      const list = tokenMap.get(key) || [];
      if (!list.some((i) => i.id === item.id)) {
        list.push(item);
        tokenMap.set(key, list);
      }
    }
  }

  const clusters: Array<{ contextLabel: string; keywords: string[]; items: WorkspaceItem[] }> = [];
  const usedItemSets = new Set<string>();

  for (const [token, group] of tokenMap.entries()) {
    if (group.length >= 2) {
      // Check if at least one pair in this group is NOT yet connected
      let hasUnconnectedPair = false;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (!connectedPairs.has(`${group[i].id}:${group[j].id}`)) {
            hasUnconnectedPair = true;
            break;
          }
        }
      }
      if (!hasUnconnectedPair) continue;

      const sortedIds = group.map((g) => g.id).sort().join(',');
      if (usedItemSets.has(sortedIds)) continue;
      usedItemSets.add(sortedIds);

      const displayToken = token.length <= 4 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
      clusters.push({
        contextLabel: displayToken,
        keywords: [displayToken],
        items: group,
      });
    }
  }

  return clusters.sort((a, b) => b.items.length - a.items.length).slice(0, 3);
}

export async function calculateStorageUsage(): Promise<{ usedBytes: number; quotaBytes: number; itemCount: number }> {
  let quotaBytes = 0;
  let usedBytes = 0;

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      usedBytes = estimate.usage || 0;
      quotaBytes = estimate.quota || 0;
    } catch {
      // ignore
    }
  }

  const allItems = await db.items.toArray();
  if (usedBytes === 0 && allItems.length > 0) {
    usedBytes = new Blob([JSON.stringify(allItems)]).size;
  }

  return { usedBytes, quotaBytes, itemCount: allItems.length };
}

export async function exportFullBackup(): Promise<string> {
  const items = await db.items.toArray();
  const collections = await db.collections.toArray();
  const connections = await db.connections.toArray();
  const attentionItems = await db.attentionItems.toArray();
  const settings = await db.settings.get('default');

  const backupData = {
    appName: 'LifeDesk',
    version: '2.0.0',
    exportTimestamp: Date.now(),
    exportDate: new Date().toISOString(),
    items,
    collections,
    connections,
    attentionItems,
    settings: settings || DEFAULT_SETTINGS,
  };

  return JSON.stringify(backupData, null, 2);
}

export async function restoreFromBackup(
  jsonString: string
): Promise<{ success: boolean; itemCount: number; message: string }> {
  try {
    const data = JSON.parse(jsonString);
    if (!data.appName || !Array.isArray(data.items)) {
      return { success: false, itemCount: 0, message: 'Invalid LifeDesk backup file.' };
    }

    await db.transaction(
      'rw',
      db.items,
      db.collections,
      db.connections,
      db.attentionItems,
      db.settings,
      async () => {
        await db.items.clear();
        await db.collections.clear();
        await db.connections.clear();
        await db.attentionItems.clear();

        if (data.items?.length) await db.items.bulkAdd(data.items);
        if (data.collections?.length) await db.collections.bulkAdd(data.collections);
        if (data.connections?.length) await db.connections.bulkAdd(data.connections);
        if (data.attentionItems?.length) await db.attentionItems.bulkAdd(data.attentionItems);
        if (data.settings) await db.settings.put({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    );

    return {
      success: true,
      itemCount: data.items.length,
      message: `Restored ${data.items.length} items to your desk.`,
    };
  } catch (err: any) {
    return { success: false, itemCount: 0, message: err.message || 'Failed to restore backup.' };
  }
}

export async function clearAllDeskData(): Promise<void> {
  await db.transaction('rw', db.items, db.collections, db.connections, db.attentionItems, async () => {
    await db.items.clear();
    await db.collections.clear();
    await db.connections.clear();
    await db.attentionItems.clear();
  });
}
