import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  Pause,
  Play,
  Square,
  Edit2,
  Trash2,
  Download,
  Search,
  ExternalLink,
  Plus,
  Unlink,
  Star,
  Clock,
  Check,
  Folder,
} from 'lucide-react';
import {
  db,
  WorkspaceItem,
  KnowledgeCollection,
  detectPotentialConnections,
  generateId,
  ItemConnection,
  AttentionItem,
} from '../db';
import { speechService } from '../services/voice';
import { formatBytes } from '../services/documentProcessor';

interface DocumentViewerModalProps {
  item: WorkspaceItem | null;
  onClose: () => void;
  onItemUpdated: (item: WorkspaceItem) => void;
  onItemDeleted: (id: string) => void;
  onSelectRelatedItem?: (relatedItem: WorkspaceItem) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  item,
  onClose,
  onItemUpdated,
  onItemDeleted,
  onSelectRelatedItem,
}) => {
  if (!item) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(item.title);
  const [editedContent, setEditedContent] = useState(item.content);
  const [editedTags, setEditedTags] = useState(item.tags.join(', '));

  // Speech state: idle | playing | paused
  const [speechStatus, setSpeechStatus] = useState<'idle' | 'playing' | 'paused'>('idle');

  const [searchWithin, setSearchWithin] = useState('');
  const [connectedItems, setConnectedItems] = useState<WorkspaceItem[]>([]);
  const [suggestedConnections, setSuggestedConnections] = useState<
    Array<{ targetItem: WorkspaceItem; commonKeywords: string[]; confidence: 'high' | 'medium' }>
  >([]);
  const [availableItemsToConnect, setAvailableItemsToConnect] = useState<WorkspaceItem[]>([]);
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [showConnectPicker, setShowConnectPicker] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addedDeadlineIndices, setAddedDeadlineIndices] = useState<number[]>([]);

  useEffect(() => {
    if (!item) return;
    setEditedTitle(item.title);
    setEditedContent(item.content);
    setEditedTags(item.tags.join(', '));
    setIsEditing(false);
    setConfirmingDelete(false);
    setAddedDeadlineIndices([]);

    loadConnections();
    detectPotentialConnections(item.id).then(setSuggestedConnections);
    db.collections.toArray().then(setCollections);
    db.items.toArray().then((all) => {
      setAvailableItemsToConnect(all.filter((i) => i.id !== item.id));
    });

    return () => {
      speechService.stopSpeaking();
      setSpeechStatus('idle');
    };
  }, [item?.id]);

  const loadConnections = async () => {
    if (!item) return;
    const connections = await db.connections
      .filter((c) => c.sourceItemId === item.id || c.targetItemId === item.id)
      .toArray();

    const targetIds = connections.map((c) =>
      c.sourceItemId === item.id ? c.targetItemId : c.sourceItemId
    );

    if (targetIds.length > 0) {
      const items = await db.items.where('id').anyOf(targetIds).toArray();
      setConnectedItems(items);
    } else {
      setConnectedItems([]);
    }
  };

  // Speech controls: Read aloud, Pause, Resume, Stop
  const handleStartSpeech = async () => {
    const textToRead = `${item.title}. ${item.content}`;
    setSpeechStatus('playing');
    await speechService.speakText(textToRead, {
      onEnd: () => setSpeechStatus('idle'),
      onError: () => setSpeechStatus('idle'),
    });
  };

  const handlePauseSpeech = () => {
    speechService.pauseSpeaking();
    setSpeechStatus('paused');
  };

  const handleResumeSpeech = () => {
    speechService.resumeSpeaking();
    setSpeechStatus('playing');
  };

  const handleStopSpeech = () => {
    speechService.stopSpeaking();
    setSpeechStatus('idle');
  };

  const handleToggleImportant = async () => {
    const nextImportant = !item.isImportant;
    const updated: WorkspaceItem = {
      ...item,
      isImportant: nextImportant,
      updatedAt: Date.now(),
    };
    await db.items.put(updated);
    onItemUpdated(updated);
  };

  const handleCollectionChange = async (collectionId: string) => {
    const updated: WorkspaceItem = {
      ...item,
      collectionIds: collectionId ? [collectionId] : [],
      updatedAt: Date.now(),
    };
    await db.items.put(updated);
    onItemUpdated(updated);
  };

  const handleAddDateToAttention = async (
    d: { label: string; date: string; confidence: 'high' | 'medium' | 'low' },
    idx: number
  ) => {
    const att: AttentionItem = {
      id: generateId(),
      title: `${d.label}: ${d.date}`,
      sourceItemId: item.id,
      sourceItemTitle: item.title,
      sourceItemType: item.type,
      dueDate: d.date,
      status: 'confirmed',
      type: 'deadline',
      priority: 'high',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.attentionItems.add(att);
    setAddedDeadlineIndices((prev) => [...prev, idx]);
    onItemUpdated(item);
  };

  const handleSaveEdit = async () => {
    const tags = editedTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const updated: WorkspaceItem = {
      ...item,
      title: editedTitle.trim() || item.title,
      content: editedContent,
      tags,
      updatedAt: Date.now(),
    };

    await db.items.put(updated);
    onItemUpdated(updated);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await db.items.delete(item.id);
    await db.connections.where('sourceItemId').equals(item.id).delete();
    await db.connections.where('targetItemId').equals(item.id).delete();
    await db.attentionItems.where('sourceItemId').equals(item.id).delete();

    onItemDeleted(item.id);
    onClose();
  };

  const handleAddConnection = async (targetItemId: string) => {
    if (!targetItemId) return;
    const connection: ItemConnection = {
      id: generateId(),
      sourceItemId: item.id,
      targetItemId,
      relationType: 'related',
      createdAt: Date.now(),
    };
    await db.connections.add(connection);
    await loadConnections();
    setSuggestedConnections((prev) => prev.filter((s) => s.targetItem.id !== targetItemId));
    setShowConnectPicker(false);
    setSelectedTargetId('');
    onItemUpdated(item);
  };

  const handleRemoveConnection = async (targetItemId: string) => {
    const existing = await db.connections
      .filter(
        (c) =>
          (c.sourceItemId === item.id && c.targetItemId === targetItemId) ||
          (c.sourceItemId === targetItemId && c.targetItemId === item.id)
      )
      .toArray();

    for (const c of existing) {
      await db.connections.delete(c.id);
    }
    await loadConnections();
    onItemUpdated(item);
  };

  const handleDownload = () => {
    if (item.fileData) {
      const a = document.createElement('a');
      a.href = item.fileData;
      a.download = item.fileName || `${item.title}`;
      a.click();
    } else {
      const blob = new Blob([`${item.title}\n\n${item.content}`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/\s+/g, '_')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Highlight searchWithin matches
  const renderHighlightedContent = () => {
    const text = item.content || '(No text content)';
    if (!searchWithin.trim()) return text;
    const q = searchWithin.trim();
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 dark:bg-amber-500/40 text-slate-900 dark:text-white rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {item.type}
            </span>
            <span>·</span>
            <span>
              {new Date(item.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            {item.source && (
              <>
                <span>·</span>
                <span>{item.source}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Full Text-to-Speech Controls: Read aloud / Pause / Resume / Stop */}
            {speechStatus === 'idle' ? (
              <button
                onClick={handleStartSpeech}
                title="Read aloud"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-indigo-500" />
                <span className="hidden sm:inline">Read Aloud</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/70 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                {speechStatus === 'playing' ? (
                  <button
                    onClick={handlePauseSpeech}
                    title="Pause reading"
                    className="p-1 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleResumeSpeech}
                    title="Resume reading"
                    className="p-1 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={handleStopSpeech}
                  title="Stop reading"
                  className="p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 px-1">
                  {speechStatus === 'playing' ? 'Reading...' : 'Paused'}
                </span>
              </div>
            )}

            <button
              onClick={handleToggleImportant}
              title={item.isImportant ? 'Important item' : 'Mark as important'}
              className={`p-2 rounded-lg transition cursor-pointer ${
                item.isImportant
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Star className={`w-4 h-4 ${item.isImportant ? 'fill-amber-500' : ''}`} />
            </button>

            <button
              onClick={() => setIsEditing(!isEditing)}
              title="Edit item"
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleDownload}
              title="Export / Download"
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            {confirmingDelete ? (
              <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/60 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900">
                <button
                  onClick={handleDelete}
                  className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline px-1 cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 px-1 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                title="Delete item"
                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close document viewer"
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Split View Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
          {/* Left Main Content (8 cols) */}
          <div className="md:col-span-8 p-6 space-y-5 overflow-y-auto">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Content
                  </label>
                  <textarea
                    rows={12}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white resize-none leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editedTags}
                    onChange={(e) => setEditedTags(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                  {item.title}
                </h1>

                {item.fileData && (item.type === 'image' || item.mimeType?.startsWith('image/')) && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center p-2">
                    <img
                      src={item.fileData}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="max-h-96 w-auto object-contain rounded"
                    />
                  </div>
                )}

                {item.type === 'link' && item.content.startsWith('http') && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="truncate">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                        {item.content.split('\n')[0]}
                      </p>
                    </div>
                    <a
                      href={item.content.split('\n')[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline shrink-0 ml-3"
                    >
                      <span>Open Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                {/* Search within document */}
                {item.content && item.content.length > 80 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Find text within this item..."
                      value={searchWithin}
                      onChange={(e) => setSearchWithin(e.target.value)}
                      className="w-full text-xs bg-transparent focus:outline-hidden text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                    {searchWithin && (
                      <button
                        onClick={() => setSearchWithin('')}
                        className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap bg-slate-50/50 dark:bg-slate-950/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                  {renderHighlightedContent()}
                </div>
              </div>
            )}
          </div>

          {/* Right Context & Relationships Panel (4 cols) */}
          <div className="md:col-span-4 p-5 space-y-5 bg-slate-50/30 dark:bg-slate-900/30 overflow-y-auto">
            {/* Collection / Context */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Folder className="w-3.5 h-3.5 text-slate-400" />
                <span>Collection</span>
              </label>
              <select
                value={item.collectionIds[0] || ''}
                onChange={(e) => handleCollectionChange(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              >
                <option value="">Uncategorized</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* File details */}
            {(item.fileName || item.fileSize) && (
              <div className="space-y-1.5 pt-3 border-t border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                {item.fileName && (
                  <div className="flex items-center justify-between gap-2">
                    <span>File</span>
                    <span className="font-medium text-slate-900 dark:text-slate-200 truncate max-w-[160px]">
                      {item.fileName}
                    </span>
                  </div>
                )}
                {item.fileSize !== undefined && (
                  <div className="flex items-center justify-between">
                    <span>Size</span>
                    <span className="tabular-nums font-medium text-slate-900 dark:text-slate-200">
                      {formatBytes(item.fileSize)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Tags & Topics (Unboxed clean metadata per design constitution) */}
            <div className="space-y-1.5 pt-3 border-t border-slate-200/70 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tags & Topics
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {item.tags.length > 0 || (item.topics && item.topics.length > 0)
                  ? Array.from(new Set([...item.tags, ...(item.topics || [])])).join(' · ')
                  : 'No tags assigned'}
              </p>
            </div>

            {/* Detected Dates */}
            {item.detectedDates && item.detectedDates.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-200/70 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Detected Dates</span>
                </span>
                <div className="space-y-2">
                  {item.detectedDates.map((d, i) => {
                    const isAdded = addedDeadlineIndices.includes(i) || d.confirmed;
                    return (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {d.date}
                          </span>
                          <span className="text-[11px] text-slate-500">{d.label}</span>
                        </div>
                        <button
                          onClick={() => handleAddDateToAttention(d, i)}
                          disabled={isAdded}
                          className={`w-full py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${
                            isAdded
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>In Attention Queue</span>
                            </>
                          ) : (
                            <span>Add to Attention</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Smart Suggested Relationships */}
            {suggestedConnections.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-200/70 dark:border-slate-800">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  These items may be related
                </span>
                <div className="space-y-2">
                  {suggestedConnections.map((sug) => (
                    <div
                      key={sug.targetItem.id}
                      className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs space-y-1.5"
                    >
                      <div className="font-semibold text-slate-900 dark:text-white truncate">
                        {sug.targetItem.title}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Shared context: {sug.commonKeywords.join(' · ')}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleAddConnection(sug.targetItem.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition cursor-pointer"
                        >
                          Connect
                        </button>
                        <button
                          onClick={() =>
                            setSuggestedConnections((prev) =>
                              prev.filter((s) => s.targetItem.id !== sug.targetItem.id)
                            )
                          }
                          className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connected Items */}
            <div className="space-y-2 pt-3 border-t border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Connected Items ({connectedItems.length})
                </span>
                <button
                  onClick={() => setShowConnectPicker(!showConnectPicker)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Link</span>
                </button>
              </div>

              {showConnectPicker && (
                <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-2">
                  <select
                    value={selectedTargetId}
                    onChange={(e) => setSelectedTargetId(e.target.value)}
                    className="w-full text-xs p-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="">Select item to connect...</option>
                    {availableItemsToConnect.map((ai) => (
                      <option key={ai.id} value={ai.id}>
                        {ai.title} ({ai.type})
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!selectedTargetId}
                    onClick={() => handleAddConnection(selectedTargetId)}
                    className="w-full py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50 cursor-pointer"
                  >
                    Connect Item
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                {connectedItems.length === 0 ? (
                  <p className="text-xs text-slate-400">No items connected yet.</p>
                ) : (
                  connectedItems.map((ci) => (
                    <div
                      key={ci.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <button
                        onClick={() => onSelectRelatedItem?.(ci)}
                        className="truncate text-left font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                      >
                        {ci.title}
                      </button>
                      <button
                        onClick={() => handleRemoveConnection(ci.id)}
                        title="Unlink"
                        className="text-slate-400 hover:text-rose-500 ml-2 cursor-pointer"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
