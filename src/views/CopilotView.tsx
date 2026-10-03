import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Send,
  FileText,
  FolderKanban,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Plus,
  Volume2,
  Pause,
  Play,
  Square,
  Search,
  Upload,
  Mic,
  Check,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  db,
  WorkspaceItem,
  KnowledgeCollection,
  AttentionItem,
  generateId,
  extractKeywordsAndTopics,
  extractLocalDates,
} from '../db';
import { speechService } from '../services/voice';
import { CaptureMode } from '../components/UniversalCaptureModal';

export interface CopilotActionCardData {
  type: 'analysis' | 'organize' | 'plan' | 'tasks' | 'search';
  // Analysis card
  itemId?: string;
  itemTitle?: string;
  summary?: string;
  keyFacts?: string[];
  topics?: string[];
  detectedDeadlines?: Array<{ label: string; date: string; confidence: string }>;
  suggestedCategory?: string;
  // Organize card
  proposedCollections?: Array<{
    name: string;
    description: string;
    itemIds: string[];
    itemTitles: string[];
    suggestedTags: string[];
  }>;
  // Plan card
  projectTitle?: string;
  sourceTitles?: string[];
  steps?: Array<{ title: string; dueDate: string; priority: 'high' | 'medium' | 'low' }>;
  // Tasks card
  prioritizedTasks?: Array<{
    id?: string;
    sourceItemId?: string;
    sourceItemTitle?: string;
    title: string;
    dueDate?: string;
    priority: 'high' | 'medium' | 'low';
    recommendation?: string;
  }>;
  // Search card
  matchedItems?: WorkspaceItem[];
  applied?: boolean;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ id: string; title: string; type: string }>;
  actionCard?: CopilotActionCardData;
  timestamp: number;
}

interface CopilotViewProps {
  items: WorkspaceItem[];
  collections: KnowledgeCollection[];
  attentionItems: AttentionItem[];
  onSelectItem: (item: WorkspaceItem) => void;
  onOpenCapture: (mode?: CaptureMode) => void;
  onReload: () => void;
  onNavigateTab: (tab: any) => void;
}

export const CopilotView: React.FC<CopilotViewProps> = ({
  items,
  collections,
  attentionItems,
  onSelectItem,
  onOpenCapture,
  onReload,
  onNavigateTab,
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState('Working...');
  const [selectedDocIdForAnalysis, setSelectedDocIdForAnalysis] = useState<string>('');
  const [showDocPicker, setShowDocPicker] = useState(false);

  // Speech state per message
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechPaused, setSpeechPaused] = useState(false);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning.';
    if (h < 18) return 'Good afternoon.';
    return 'Good evening.';
  };

  // Dynamic data-driven metrics for smart suggestions
  const uncategorizedItems = useMemo(
    () => items.filter((i) => i.collectionIds.length === 0),
    [items]
  );

  const pendingAttention = useMemo(
    () => attentionItems.filter((a) => a.status === 'pending' || a.status === 'confirmed'),
    [attentionItems]
  );

  // Speech controls
  const handleReadMessage = async (msg: CopilotMessage) => {
    if (speakingMessageId === msg.id) {
      speechService.stopSpeaking();
      setSpeakingMessageId(null);
      setSpeechPaused(false);
      return;
    }
    setSpeakingMessageId(msg.id);
    setSpeechPaused(false);
    await speechService.speakText(msg.content, {
      onEnd: () => {
        setSpeakingMessageId(null);
        setSpeechPaused(false);
      },
      onError: () => {
        setSpeakingMessageId(null);
        setSpeechPaused(false);
      },
    });
  };

  // 1. ORGANIZE MY DESK (Real local + smart organization with 1-click apply)
  const runOrganizeDeskAction = async () => {
    if (items.length === 0) return;
    const userMsg: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content: 'Organize my desk and group related items into collections.',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsWorking(true);
    setWorkingLabel('Inspecting your desk items and identifying structure...');

    try {
      let proposedCollections: NonNullable<CopilotActionCardData['proposedCollections']> = [];
      let summaryText = '';

      if (navigator.onLine) {
        const res = await fetch('/api/copilot/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'organize',
            items,
            collections,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (Array.isArray(result.data?.proposedCollections)) {
            proposedCollections = result.data.proposedCollections;
            summaryText = result.data.summary || '';
          }
        }
      }

      // Local fallback / enrichment if needed
      if (proposedCollections.length === 0) {
        const groups: Record<
          string,
          { itemIds: string[]; itemTitles: string[]; tags: Set<string> }
        > = {};

        for (const item of items) {
          const analysis = extractKeywordsAndTopics(item.title, item.content, item.fileName);
          const cat =
            analysis.suggestedCategory ||
            (item.tags[0] ? item.tags[0] : item.type === 'note' ? 'Notes' : 'Documents');
          if (!groups[cat]) {
            groups[cat] = { itemIds: [], itemTitles: [], tags: new Set() };
          }
          groups[cat].itemIds.push(item.id);
          groups[cat].itemTitles.push(item.title);
          analysis.topics.forEach((t) => groups[cat].tags.add(t));
        }

        proposedCollections = Object.entries(groups).map(([name, g]) => ({
          name,
          description: `${g.itemIds.length} related item${g.itemIds.length === 1 ? '' : 's'} detected from content`,
          itemIds: g.itemIds,
          itemTitles: g.itemTitles,
          suggestedTags: Array.from(g.tags).slice(0, 4),
        }));
        summaryText = `Inspected ${items.length} item${items.length === 1 ? '' : 's'} on your desk and grouped them into ${proposedCollections.length} topic area${proposedCollections.length === 1 ? '' : 's'}.`;
      }

      const assistantMsg: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content:
          summaryText ||
          `I inspected your ${items.length} desk items and structured them by topic. Review and apply below:`,
        sources: items.slice(0, 5).map((i) => ({ id: i.id, title: i.title, type: i.type })),
        actionCard: {
          type: 'organize',
          summary: summaryText,
          proposedCollections,
          applied: false,
        },
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsWorking(false);
    }
  };

  // Apply proposed organization to IndexedDB
  const handleApplyOrganization = async (msgId: string, card: CopilotActionCardData) => {
    if (!card.proposedCollections) return;
    const existingCols = await db.collections.toArray();

    for (const prop of card.proposedCollections) {
      let col = existingCols.find((c) => c.name.toLowerCase() === prop.name.toLowerCase());
      if (!col) {
        col = {
          id: generateId(),
          name: prop.name,
          description: prop.description,
          createdAt: Date.now(),
        };
        await db.collections.add(col);
        existingCols.push(col);
      }

      for (const itemId of prop.itemIds) {
        const item = await db.items.get(itemId);
        if (item) {
          const nextCols = Array.from(new Set([...item.collectionIds, col.id]));
          const nextTags = Array.from(new Set([...item.tags, ...prop.suggestedTags, prop.name]));
          await db.items.put({
            ...item,
            collectionIds: nextCols,
            tags: nextTags,
            updatedAt: Date.now(),
          });
        }
      }
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.actionCard
          ? { ...m, actionCard: { ...m.actionCard, applied: true } }
          : m
      )
    );
    onReload();
  };

  // 2. ANALYZE A DOCUMENT (Produces structured DOCUMENT ANALYSIS card)
  const runAnalyzeDocumentAction = async (targetItem?: WorkspaceItem) => {
    const doc = targetItem || items.find((i) => i.id === selectedDocIdForAnalysis) || items[0];
    if (!doc) return;

    setShowDocPicker(false);
    const userMsg: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content: `Analyze "${doc.title}" and extract key dates, topics, and actions.`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsWorking(true);
    setWorkingLabel(`Analyzing ${doc.title}...`);

    try {
      let analysisData: CopilotActionCardData | null = null;

      if (navigator.onLine) {
        const res = await fetch('/api/copilot/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'analyze',
            items: [doc],
            targetItemId: doc.id,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.data) {
            analysisData = {
              type: 'analysis',
              itemId: doc.id,
              itemTitle: doc.title,
              summary: result.data.summary,
              keyFacts: result.data.keyFacts || [],
              topics: result.data.topics || doc.topics || doc.tags,
              detectedDeadlines: result.data.detectedDeadlines || doc.detectedDates || [],
              suggestedCategory: result.data.suggestedCategory || doc.suggestedCollection,
              applied: false,
            };
          }
        }
      }

      if (!analysisData) {
        const localInfo = extractKeywordsAndTopics(doc.title, doc.content, doc.fileName);
        const localDates = extractLocalDates(doc.content);
        analysisData = {
          type: 'analysis',
          itemId: doc.id,
          itemTitle: doc.title,
          summary: doc.summary || doc.content.slice(0, 260),
          keyFacts: doc.content
            .split(/[.\n]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 20)
            .slice(0, 3),
          topics: Array.from(new Set([...(doc.topics || []), ...localInfo.topics, ...doc.tags])).slice(0, 5),
          detectedDeadlines: doc.detectedDates?.length ? doc.detectedDates : localDates,
          suggestedCategory: localInfo.suggestedCategory || 'Documents',
          applied: false,
        };
      }

      const assistantMsg: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: analysisData.summary || `Completed analysis of "${doc.title}".`,
        sources: [{ id: doc.id, title: doc.title, type: doc.type }],
        actionCard: analysisData,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsWorking(false);
    }
  };

  // Add detected deadlines from Analysis Card to Attention Queue
  const handleAddAnalysisToAttention = async (msgId: string, card: CopilotActionCardData) => {
    if (!card.itemId) return;
    const deadlines = card.detectedDeadlines || [];
    if (deadlines.length > 0) {
      for (const d of deadlines) {
        await db.attentionItems.add({
          id: generateId(),
          title: `${d.label}: ${d.date}`,
          sourceItemId: card.itemId,
          sourceItemTitle: card.itemTitle || 'Document',
          sourceItemType: 'document',
          dueDate: d.date,
          status: 'confirmed',
          type: 'deadline',
          priority: 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } else {
      await db.attentionItems.add({
        id: generateId(),
        title: `Review ${card.itemTitle || 'Document'}`,
        sourceItemId: card.itemId,
        sourceItemTitle: card.itemTitle || 'Document',
        sourceItemType: 'document',
        status: 'confirmed',
        type: 'review',
        priority: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.actionCard
          ? { ...m, actionCard: { ...m.actionCard, applied: true } }
          : m
      )
    );
    onReload();
  };

  // 3. PLAN PROJECT (Generates structured project steps & creates real collection + attention tasks)
  const runPlanProjectAction = async (customGoal?: string) => {
    const goal = customGoal || input.trim() || 'Build a structured action plan from my desk items';
    const userMsg: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content: goal,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!customGoal) setInput('');
    setIsWorking(true);
    setWorkingLabel('Designing structured project plan...');

    try {
      let planCard: CopilotActionCardData | null = null;

      if (navigator.onLine) {
        const res = await fetch('/api/copilot/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'plan',
            items,
            customPrompt: goal,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.data?.steps) {
            planCard = {
              type: 'plan',
              projectTitle: result.data.projectTitle || 'Workspace Action Plan',
              summary: result.data.summary,
              sourceTitles: result.data.sourceTitles || [],
              steps: result.data.steps,
              applied: false,
            };
          }
        }
      }

      if (!planCard) {
        const recentTitles = items.slice(0, 3).map((i) => i.title);
        planCard = {
          type: 'plan',
          projectTitle: items[0] ? `${items[0].title} — Action Plan` : 'Project Execution Plan',
          summary: 'Structured sequence of tasks prepared from your current desk items.',
          sourceTitles: recentTitles,
          steps: [
            {
              title: items[0] ? `Review key requirements in ${items[0].title}` : 'Define core scope and requirements',
              dueDate: 'Today',
              priority: 'high',
            },
            {
              title: 'Consolidate related notes and reference documents',
              dueDate: 'This week',
              priority: 'medium',
            },
            {
              title: 'Complete final deliverable and verify deadlines',
              dueDate: 'Upcoming',
              priority: 'high',
            },
          ],
          applied: false,
        };
      }

      const matchedSources = items
        .filter((i) => planCard?.sourceTitles?.some((st) => st.toLowerCase().includes(i.title.toLowerCase())))
        .map((i) => ({ id: i.id, title: i.title, type: i.type }));

      const assistantMsg: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: planCard.summary || 'Here is a structured project plan ready to add to your workspace:',
        sources: matchedSources.length > 0 ? matchedSources : items.slice(0, 2).map((i) => ({ id: i.id, title: i.title, type: i.type })),
        actionCard: planCard,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsWorking(false);
    }
  };

  // Apply Plan -> Creates actual Collection + Attention Tasks in IndexedDB
  const handleApplyPlan = async (msgId: string, card: CopilotActionCardData) => {
    const projName = card.projectTitle || 'Project Plan';
    const col: KnowledgeCollection = {
      id: generateId(),
      name: projName,
      description: card.summary || 'Created by LifeDesk Copilot',
      createdAt: Date.now(),
    };
    await db.collections.add(col);

    for (const step of card.steps || []) {
      await db.attentionItems.add({
        id: generateId(),
        title: step.title,
        sourceItemId: items[0]?.id || '',
        sourceItemTitle: projName,
        sourceItemType: 'note',
        dueDate: step.dueDate,
        status: 'confirmed',
        type: 'task',
        priority: step.priority || 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.actionCard
          ? { ...m, actionCard: { ...m.actionCard, applied: true } }
          : m
      )
    );
    onReload();
  };

  // 4. MANAGE TASKS (Inspects actual user tasks & unconfirmed document dates)
  const runManageTasksAction = async () => {
    const userMsg: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content: 'Inspect my tasks and detected deadlines, and prioritize what needs attention.',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsWorking(true);
    setWorkingLabel('Reviewing your attention queue and document dates...');

    try {
      const existingActive = attentionItems.filter(
        (a) => a.status === 'pending' || a.status === 'confirmed'
      );

      // Also gather unconfirmed dates from items
      const itemDatesTasks: NonNullable<CopilotActionCardData['prioritizedTasks']> = [];
      for (const item of items) {
        for (const d of item.detectedDates || []) {
          const alreadyInQueue = existingActive.some(
            (a) => a.sourceItemId === item.id && a.dueDate === d.date
          );
          if (!alreadyInQueue) {
            itemDatesTasks.push({
              sourceItemId: item.id,
              sourceItemTitle: item.title,
              title: `${d.label}: ${d.date}`,
              dueDate: d.date,
              priority: d.confidence === 'high' ? 'high' : 'medium',
              recommendation: `Detected in ${item.title}`,
            });
          }
        }
      }

      const combinedTasks: NonNullable<CopilotActionCardData['prioritizedTasks']> = [
        ...existingActive.map((a) => ({
          id: a.id,
          sourceItemId: a.sourceItemId,
          sourceItemTitle: a.sourceItemTitle,
          title: a.title,
          dueDate: a.dueDate,
          priority: a.priority,
          recommendation: a.status === 'pending' ? 'Awaiting confirmation' : 'Confirmed item',
        })),
        ...itemDatesTasks,
      ];

      const assistantMsg: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content:
          combinedTasks.length > 0
            ? `Found ${combinedTasks.length} actionable item${
                combinedTasks.length === 1 ? '' : 's'
              } across your desk and attention queue.`
            : 'Your attention queue is completely clear — no pending tasks or unconfirmed deadlines found.',
        actionCard:
          combinedTasks.length > 0
            ? {
                type: 'tasks',
                prioritizedTasks: combinedTasks,
                applied: false,
              }
            : undefined,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsWorking(false);
    }
  };

  // Confirm all prioritized tasks in Attention Queue
  const handleConfirmAllTasks = async (msgId: string, card: CopilotActionCardData) => {
    for (const t of card.prioritizedTasks || []) {
      if (t.id) {
        await db.attentionItems.update(t.id, { status: 'confirmed', updatedAt: Date.now() });
      } else {
        await db.attentionItems.add({
          id: generateId(),
          title: t.title,
          sourceItemId: t.sourceItemId || '',
          sourceItemTitle: t.sourceItemTitle || 'Desk Item',
          sourceItemType: 'document',
          dueDate: t.dueDate,
          status: 'confirmed',
          type: 'deadline',
          priority: t.priority || 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.actionCard
          ? { ...m, actionCard: { ...m.actionCard, applied: true } }
          : m
      )
    );
    onReload();
  };

  // 5. SEARCH MY DESK
  const runSearchDeskAction = (queryText: string) => {
    const q = queryText.toLowerCase().trim();
    const matched = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.content.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)) ||
        (i.topics || []).some((tp) => tp.toLowerCase().includes(q))
    );

    const assistantMsg: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content:
        matched.length > 0
          ? `Found ${matched.length} matching item${matched.length === 1 ? '' : 's'} on your desk for "${queryText}":`
          : `No items on your desk matched "${queryText}".`,
      sources: matched.map((m) => ({ id: m.id, title: m.title, type: m.type })),
      actionCard: {
        type: 'search',
        matchedItems: matched,
      },
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
  };

  // General Conversational Submit (routes intelligently to actions or grounded answer)
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isWorking) return;

    const lower = trimmed.toLowerCase();
    if (lower.includes('organize') && (lower.includes('desk') || lower.includes('note') || lower.includes('file'))) {
      setInput('');
      await runOrganizeDeskAction();
      return;
    }
    if (lower.startsWith('find ') || lower.startsWith('search ')) {
      const q = trimmed.replace(/^(?:find|search(?:\s+for)?)\s+/i, '').trim();
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'user', content: trimmed, timestamp: Date.now() },
      ]);
      setInput('');
      runSearchDeskAction(q);
      return;
    }

    const userMsg: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setIsWorking(true);
    setWorkingLabel('Checking your desk context...');

    try {
      if (items.length === 0 && !navigator.onLine) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content:
              "Your desk is empty. Add a file, note, image or voice capture and I'll work with it.",
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({
            role: m.role === 'user' ? 'user' : 'model',
            content: m.content,
          })),
          mode: trimmed.length > 120 ? 'deep' : 'general',
          contextDocuments: items.slice(0, 15).map((i) => ({
            id: i.id,
            title: i.title,
            type: i.type,
            tags: i.tags,
            content: i.content.slice(0, 1800),
          })),
          attentionItems: pendingAttention,
          collections,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: data.reply || 'Done.',
            sources: data.sources || [],
            timestamp: Date.now(),
          },
        ]);
      } else {
        // Local offline search fallback
        runSearchDeskAction(trimmed);
      }
    } catch {
      runSearchDeskAction(trimmed);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col min-h-[calc(100vh-80px)] animate-in fade-in duration-200">
      {/* Copilot Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200/80 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              LifeDesk Copilot
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {getGreeting()} What should we work on?
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {items.length === 0
              ? "Your desk is empty. Add a file, note, image or voice capture and I'll work with it."
              : `Grounded in ${items.length} item${items.length === 1 ? '' : 's'}, ${
                  collections.length
                } collection${collections.length === 1 ? '' : 's'}, and ${
                  pendingAttention.length
                } attention item${pendingAttention.length === 1 ? '' : 's'} on your desk.`}
          </p>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            Reset Session
          </button>
        )}
      </div>

      {/* Empty Desk State vs Dynamic Action Suggestions */}
      {items.length === 0 ? (
        <div className="my-8 p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Your desk is empty. Add a file, note, image or voice capture and I&apos;ll work with it.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Once you add items to your desk, Copilot can analyze documents, organize notes into collections, extract deadlines, and plan projects using your actual information.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              onClick={() => onOpenCapture('file')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Add File</span>
            </button>
            <button
              onClick={() => onOpenCapture('note')}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Create Note</span>
            </button>
            <button
              onClick={() => onOpenCapture('voice')}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Capture</span>
            </button>
          </div>
        </div>
      ) : (
        /* Dynamic Contextual Action Buttons */
        <div className="py-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (items.length === 1) {
                  runAnalyzeDocumentAction(items[0]);
                } else {
                  setShowDocPicker(!showDocPicker);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shadow-2xs transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {items.length === 1 ? `Analyze "${items[0].title}"` : 'Analyze a document'}
              </span>
            </button>

            <button
              onClick={runOrganizeDeskAction}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shadow-2xs transition cursor-pointer"
            >
              <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {uncategorizedItems.length > 0
                  ? `Organize my desk (${uncategorizedItems.length} uncategorized)`
                  : 'Organize my desk'}
              </span>
            </button>

            <button
              onClick={runManageTasksAction}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shadow-2xs transition cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {pendingAttention.length > 0
                  ? `Manage tasks (${pendingAttention.length} active)`
                  : 'Extract & prioritize tasks'}
              </span>
            </button>

            <button
              onClick={() => runPlanProjectAction()}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shadow-2xs transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Plan project from desk</span>
            </button>

            <button
              onClick={() => onNavigateTab('search')}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 shadow-2xs transition cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-indigo-500" />
              <span>Search my desk</span>
            </button>
          </div>

          {/* Document selector dropdown when "Analyze a document" is clicked */}
          {showDocPicker && (
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 animate-in fade-in duration-150">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Select item to analyze:
              </span>
              {items.slice(0, 8).map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => runAnalyzeDocumentAction(doc)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-xs font-medium text-slate-800 dark:text-slate-200 transition cursor-pointer truncate max-w-[220px]"
                >
                  {doc.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conversation Thread & Action Cards */}
      <div className="flex-1 space-y-5 py-4 overflow-y-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            } space-y-2 animate-in fade-in duration-200`}
          >
            {/* Message Bubble */}
            <div
              className={`max-w-2xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-2xs'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Assistant Controls: Read Aloud + Sources */}
              {msg.role === 'assistant' && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  {/* Sources citation */}
                  {msg.sources && msg.sources.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="font-semibold">Based on:</span>
                      {msg.sources.map((src) => {
                        const found = items.find((i) => i.id === src.id);
                        return (
                          <button
                            key={src.id}
                            onClick={() => found && onSelectItem(found)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>{src.title}</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400">LifeDesk Copilot</span>
                  )}

                  {/* Read Aloud / Stop */}
                  <div className="flex items-center gap-1">
                    {speakingMessageId === msg.id ? (
                      <>
                        {speechPaused ? (
                          <button
                            onClick={() => {
                              speechService.resumeSpeaking();
                              setSpeechPaused(false);
                            }}
                            className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                            title="Resume"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              speechService.pauseSpeaking();
                              setSpeechPaused(true);
                            }}
                            className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                            title="Pause"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            speechService.stopSpeaking();
                            setSpeakingMessageId(null);
                            setSpeechPaused(false);
                          }}
                          className="p-1 text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                          title="Stop"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReadMessage(msg)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Read aloud</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* STRUCTURED COPILOT ACTION CARDS */}
            {msg.actionCard && (
              <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
                {/* 1. DOCUMENT ANALYSIS CARD */}
                {msg.actionCard.type === 'analysis' && (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Document Analysis
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                          {msg.actionCard.itemTitle}
                        </h3>
                      </div>
                      {msg.actionCard.suggestedCategory && (
                        <span className="text-xs text-slate-500">
                          Category: <strong className="text-slate-800 dark:text-slate-200">{msg.actionCard.suggestedCategory}</strong>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Found</span>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {(msg.actionCard.detectedDeadlines || []).length} date
                          {(msg.actionCard.detectedDeadlines || []).length === 1 ? '' : 's'} ·{' '}
                          {(msg.actionCard.topics || []).length} topic
                          {(msg.actionCard.topics || []).length === 1 ? '' : 's'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Related Context</span>
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {(msg.actionCard.topics || []).join(' · ') || 'General'}
                        </p>
                      </div>
                    </div>

                    {msg.actionCard.keyFacts && msg.actionCard.keyFacts.length > 0 && (
                      <div className="space-y-1.5 text-xs">
                        <span className="text-[11px] font-semibold text-slate-500">Key Takeaways</span>
                        <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc list-inside">
                          {msg.actionCard.keyFacts.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Working Actions: [Review] [Add to Attention] [Open Document] */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => {
                          const found = items.find((i) => i.id === msg.actionCard?.itemId);
                          if (found) onSelectItem(found);
                        }}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition cursor-pointer"
                      >
                        Open Document
                      </button>

                      <button
                        onClick={() => handleAddAnalysisToAttention(msg.id, msg.actionCard!)}
                        disabled={msg.actionCard.applied}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                          msg.actionCard.applied
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {msg.actionCard.applied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Added to Attention</span>
                          </>
                        ) : (
                          <span>Add to Attention</span>
                        )}
                      </button>

                      <button
                        onClick={() => onNavigateTab('attention')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Review Queue →
                      </button>
                    </div>
                  </>
                )}

                {/* 2. ORGANIZE DESK CARD */}
                {msg.actionCard.type === 'organize' && (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Smart Organization Proposal
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                          {(msg.actionCard.proposedCollections || []).length} Proposed Collections
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {(msg.actionCard.proposedCollections || []).map((col, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {col.name}
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {col.itemIds.length} item{col.itemIds.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Items: {col.itemTitles.join(' · ')}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => handleApplyOrganization(msg.id, msg.actionCard!)}
                        disabled={msg.actionCard.applied}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                          msg.actionCard.applied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {msg.actionCard.applied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Organization Applied</span>
                          </>
                        ) : (
                          <span>Apply Organization</span>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* 3. PROJECT PLAN CARD */}
                {msg.actionCard.type === 'plan' && (
                  <>
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        Project Action Plan
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {msg.actionCard.projectTitle}
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {(msg.actionCard.steps || []).map((st, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                              0{i + 1}.
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {st.title}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 shrink-0 ml-2">
                            {st.dueDate}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => handleApplyPlan(msg.id, msg.actionCard!)}
                        disabled={msg.actionCard.applied}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                          msg.actionCard.applied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {msg.actionCard.applied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Created Project & Tasks</span>
                          </>
                        ) : (
                          <span>Create Project & Tasks</span>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* 4. MANAGE TASKS CARD */}
                {msg.actionCard.type === 'tasks' && (
                  <>
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        Attention & Deadlines
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        Prioritized Action Items
                      </h3>
                    </div>

                    <div className="space-y-2">
                      {(msg.actionCard.prioritizedTasks || []).map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                        >
                          <div className="space-y-0.5">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {t.title}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Source: {t.sourceItemTitle} {t.dueDate ? `· ${t.dueDate}` : ''}
                            </p>
                          </div>
                          <span className="text-[11px] font-semibold capitalize text-amber-600 dark:text-amber-400">
                            {t.priority}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => handleConfirmAllTasks(msg.id, msg.actionCard!)}
                        disabled={msg.actionCard.applied}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                          msg.actionCard.applied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {msg.actionCard.applied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmed in Attention Queue</span>
                          </>
                        ) : (
                          <span>Confirm All in Attention</span>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* 5. SEARCH RESULTS CARD */}
                {msg.actionCard.type === 'search' && msg.actionCard.matchedItems && (
                  <div className="space-y-2">
                    {msg.actionCard.matchedItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onSelectItem(item)}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:border-indigo-400 border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer transition text-xs"
                      >
                        <div className="truncate pr-3">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {item.content.slice(0, 100)}
                          </p>
                        </div>
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                          Open →
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isWorking && (
          <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit text-xs text-slate-600 dark:text-slate-300 shadow-2xs">
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
            <span>{workingLabel}</span>
          </div>
        )}
      </div>

      {/* Bottom Input Bar */}
      <form
        onSubmit={handleSend}
        className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-2 sticky bottom-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md pb-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot to analyze a document, find notes, organize your desk, or plan a project..."
          className="flex-1 px-4 py-3 text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
        />
        <button
          type="submit"
          disabled={isWorking || !input.trim()}
          aria-label="Send to Copilot"
          className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-2xs"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
