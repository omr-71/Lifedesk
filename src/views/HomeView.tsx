import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Mic,
  FileText,
  Camera,
  Upload,
  Clock,
  ArrowRight,
  CheckCircle2,
  Folder,
  Sparkles,
  Link2,
  Volume2,
  Square,
} from 'lucide-react';
import {
  db,
  WorkspaceItem,
  AttentionItem,
  KnowledgeCollection,
  ItemConnection,
  findUnlinkedContextClusters,
  generateId,
} from '../db';
import { CaptureMode } from '../components/UniversalCaptureModal';
import { speechService } from '../services/voice';

interface HomeViewProps {
  items: WorkspaceItem[];
  collections: KnowledgeCollection[];
  connections: ItemConnection[];
  attentionItems: AttentionItem[];
  onOpenCapture: (mode?: CaptureMode) => void;
  onOpenLiveVoice: () => void;
  onSelectItem: (item: WorkspaceItem) => void;
  onGoToSearch: () => void;
  onGoToAttention: () => void;
  onGoToCopilot: () => void;
  onGoToKnowledge: () => void;
  onConfirmAttentionItem: (id: string) => void;
  onDismissAttentionItem: (id: string) => void;
  onCompleteAttentionItem: (id: string) => void;
  onReload: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  items,
  collections,
  connections,
  attentionItems,
  onOpenCapture,
  onOpenLiveVoice,
  onSelectItem,
  onGoToSearch,
  onGoToAttention,
  onGoToCopilot,
  onGoToKnowledge,
  onConfirmAttentionItem,
  onDismissAttentionItem,
  onCompleteAttentionItem,
  onReload,
}) => {
  const [dismissedClusters, setDismissedClusters] = useState<string[]>([]);
  const [isReadingAttention, setIsReadingAttention] = useState(false);

  // Pending / confirmed attention items needing action
  const pendingAttention = useMemo(
    () => attentionItems.filter((a) => a.status === 'pending' || a.status === 'confirmed'),
    [attentionItems]
  );

  // Conservative multi-item context clusters (e.g., "DTIL · 3 related items")
  const contextClusters = useMemo(
    () =>
      findUnlinkedContextClusters(items, connections).filter(
        (c) => !dismissedClusters.includes(c.contextLabel)
      ),
    [items, connections, dismissedClusters]
  );

  const handleConnectCluster = async (cluster: {
    contextLabel: string;
    keywords: string[];
    items: WorkspaceItem[];
  }) => {
    // Link items in the cluster together
    for (let i = 0; i < cluster.items.length; i++) {
      for (let j = i + 1; j < cluster.items.length; j++) {
        await db.connections.add({
          id: generateId(),
          sourceItemId: cluster.items[i].id,
          targetItemId: cluster.items[j].id,
          relationType: 'related',
          reason: `Shared context: ${cluster.contextLabel}`,
          createdAt: Date.now(),
        });
      }
    }

    // Also create or match a collection for this context if not present
    const existingCol = await db.collections
      .filter((c) => c.name.toLowerCase() === cluster.contextLabel.toLowerCase())
      .first();

    let colId = existingCol?.id;
    if (!colId) {
      const newCol: KnowledgeCollection = {
        id: generateId(),
        name: cluster.contextLabel,
        description: `${cluster.items.length} connected items`,
        createdAt: Date.now(),
      };
      await db.collections.add(newCol);
      colId = newCol.id;
    }

    for (const item of cluster.items) {
      const updatedCols = Array.from(new Set([...item.collectionIds, colId]));
      await db.items.update(item.id, {
        collectionIds: updatedCols,
        updatedAt: Date.now(),
      });
    }

    onReload();
  };

  const handleReadAttention = async () => {
    if (isReadingAttention) {
      speechService.stopSpeaking();
      setIsReadingAttention(false);
      return;
    }
    if (pendingAttention.length === 0) return;

    const text = `You have ${pendingAttention.length} attention item${
      pendingAttention.length === 1 ? '' : 's'
    }. ${pendingAttention
      .map(
        (a, i) =>
          `Item ${i + 1}: ${a.title}${a.dueDate ? `, due ${a.dueDate}` : ''}, from ${
            a.sourceItemTitle
          }.`
      )
      .join(' ')}`;

    setIsReadingAttention(true);
    await speechService.speakText(text, {
      onEnd: () => setIsReadingAttention(false),
      onError: () => setIsReadingAttention(false),
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10 space-y-8 animate-in fade-in duration-200">
      {/* 1. HEADER + UNIVERSAL SEARCH + QUICK CAPTURE */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {formattedDate}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
              {getGreeting()}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              What matters on your desk right now?
            </p>
          </div>

          <button
            onClick={onGoToCopilot}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Open Copilot</span>
          </button>
        </div>

        {/* Global Desk Search Input */}
        <div className="flex items-center gap-2">
          <div
            onClick={onGoToSearch}
            className="flex-1 flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-colors"
          >
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs sm:text-sm text-slate-400 truncate">
              Search everything across notes, files, extracted text, or tags...
            </span>
            <kbd className="hidden sm:inline-block ml-auto px-2 py-0.5 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
              ⌘K
            </kbd>
          </div>

          <button
            onClick={onOpenLiveVoice}
            className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 shadow-2xs transition cursor-pointer shrink-0"
          >
            <Mic className="w-4 h-4 text-indigo-500" />
            <span className="hidden sm:inline">Speak</span>
          </button>
        </div>

        {/* Primary Capture Actions: [Add File] [Create Note] [Voice] [Scan] [Copilot] */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
          <button
            onClick={() => onOpenCapture('file')}
            className="flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Add File</span>
          </button>

          <button
            onClick={() => onOpenCapture('note')}
            className="flex items-center justify-center gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Create Note</span>
          </button>

          <button
            onClick={() => onOpenCapture('voice')}
            className="flex items-center justify-center gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Mic className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Voice</span>
          </button>

          <button
            onClick={() => onOpenCapture('camera')}
            className="flex items-center justify-center gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Camera className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Scan</span>
          </button>

          <button
            onClick={onGoToCopilot}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>Copilot</span>
          </button>
        </div>
      </section>

      {/* 2. SMART CONTEXT SUGGESTIONS ("These items may be related") */}
      {contextClusters.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Smart Organization
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contextClusters.map((cluster) => (
              <div
                key={cluster.contextLabel}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-900/60 shadow-2xs flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5" />
                      <span>These items may be related</span>
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                      {cluster.items.length} related items
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {cluster.contextLabel}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {cluster.items.map((i) => i.title).join(' · ')}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleConnectCluster(cluster)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    Connect
                  </button>
                  <button
                    onClick={() =>
                      setDismissedClusters((prev) => [...prev, cluster.contextLabel])
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. NEEDS ATTENTION */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Needs Attention
            </h2>
            {pendingAttention.length > 0 && (
              <span className="text-[11px] tabular-nums font-semibold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                {pendingAttention.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {pendingAttention.length > 0 && (
              <button
                onClick={handleReadAttention}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
              >
                {isReadingAttention ? (
                  <>
                    <Square className="w-3 h-3 text-rose-500" />
                    <span>Stop Reading</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Read Aloud</span>
                  </>
                )}
              </button>
            )}
            {pendingAttention.length > 0 && (
              <button
                onClick={onGoToAttention}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View all</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {pendingAttention.length === 0 ? (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Nothing needs your attention right now.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingAttention.slice(0, 4).map((item) => {
              const sourceDoc = items.find((i) => i.id === item.sourceItemId);
              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition"
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </span>
                      {item.dueDate && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{item.dueDate}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      Source:{' '}
                      {sourceDoc ? (
                        <button
                          onClick={() => onSelectItem(sourceDoc)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                        >
                          {sourceDoc.title}
                        </button>
                      ) : (
                        item.sourceItemTitle
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => onConfirmAttentionItem(item.id)}
                          className="px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => onDismissAttentionItem(item.id)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onCompleteAttentionItem(item.id)}
                        className="px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. AUTOMATIC COLLECTIONS (Only shown when real collections exist) */}
      {collections.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Collections ({collections.length})
            </h2>
            <button
              onClick={onGoToKnowledge}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {collections.slice(0, 4).map((col) => {
              const count = items.filter((i) => i.collectionIds.includes(col.id)).length;
              return (
                <div
                  key={col.id}
                  onClick={onGoToKnowledge}
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition cursor-pointer space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <Folder className="w-4 h-4 text-indigo-500" />
                    <span className="text-[11px] tabular-nums text-slate-400 font-medium">
                      {count} item{count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {col.name}
                  </h3>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. RECENT ITEMS / CLEAN EMPTY DESK STATE */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Recent Items ({items.length})
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Your desk is clear.
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Drop a file, note, screenshot or voice memo to begin. LifeDesk automatically extracts text, finds deadlines, and organizes related items locally.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                onClick={() => onOpenCapture('file')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
              >
                Add File
              </button>
              <button
                onClick={() => onOpenCapture('note')}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
              >
                Create Note
              </button>
              <button
                onClick={() => onOpenCapture('voice')}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
              >
                Voice Memo
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.slice(0, 9).map((item) => {
              const itemCols = collections.filter((c) => item.collectionIds.includes(c.id));
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="group p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-xl cursor-pointer transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold uppercase tracking-wider">
                        {itemCols[0] ? `${itemCols[0].name} · ${item.type}` : item.type}
                      </span>
                      <span className="tabular-nums">
                        {new Date(item.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                    {item.content && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {item.summary || item.content}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400">
                    <span className="truncate max-w-[170px]">
                      {item.tags.length > 0 ? item.tags.join(' · ') : item.source || 'Local'}
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium group-hover:translate-x-0.5 transition-transform">
                      Open →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
