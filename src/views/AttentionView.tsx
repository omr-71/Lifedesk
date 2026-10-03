import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  Volume2,
  Pause,
  Play,
  Square,
  CalendarClock,
} from 'lucide-react';
import { AttentionItem, WorkspaceItem, generateId, db } from '../db';
import { speechService } from '../services/voice';

interface AttentionViewProps {
  attentionItems: AttentionItem[];
  items: WorkspaceItem[];
  onSelectItem: (item: WorkspaceItem) => void;
  onConfirmItem: (id: string) => void;
  onDismissItem: (id: string) => void;
  onCompleteItem: (id: string) => void;
  onReload: () => void;
}

export const AttentionView: React.FC<AttentionViewProps> = ({
  attentionItems,
  items,
  onSelectItem,
  onConfirmItem,
  onDismissItem,
  onCompleteItem,
  onReload,
}) => {
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [selectedSourceItemId, setSelectedSourceItemId] = useState('');

  // Speech state: idle | playing | paused
  const [speechState, setSpeechState] = useState<'idle' | 'playing' | 'paused'>('idle');

  const filtered = attentionItems.filter((item) => {
    if (filter === 'active') return item.status === 'pending' || item.status === 'confirmed';
    if (filter === 'completed') return item.status === 'completed' || item.status === 'dismissed';
    return true;
  });

  const activeItems = attentionItems.filter(
    (item) => item.status === 'pending' || item.status === 'confirmed'
  );

  const handleReadQueueAloud = async () => {
    if (activeItems.length === 0) return;
    const summaryText = `You have ${activeItems.length} item${
      activeItems.length === 1 ? '' : 's'
    } in your attention queue. ${activeItems
      .map(
        (item, idx) =>
          `Number ${idx + 1}: ${item.title}${
            item.dueDate ? `, due ${item.dueDate}` : ''
          }, from ${item.sourceItemTitle}.`
      )
      .join(' ')}`;

    setSpeechState('playing');
    await speechService.speakText(summaryText, {
      onEnd: () => setSpeechState('idle'),
      onError: () => setSpeechState('idle'),
    });
  };

  const handleSnoozeItem = async (item: AttentionItem) => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const formatted = tomorrow.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    await db.attentionItems.update(item.id, {
      dueDate: `Snoozed until ${formatted}`,
      snoozedUntil: tomorrow.getTime(),
      status: 'confirmed',
      updatedAt: Date.now(),
    });
    onReload();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const sourceDoc = items.find((i) => i.id === selectedSourceItemId);

    const newItem: AttentionItem = {
      id: generateId(),
      title: newTaskTitle.trim(),
      sourceItemId: sourceDoc ? sourceDoc.id : '',
      sourceItemTitle: sourceDoc ? sourceDoc.title : 'Manual task',
      sourceItemType: sourceDoc ? sourceDoc.type : 'note',
      dueDate: newTaskDueDate || undefined,
      status: 'confirmed',
      type: 'task',
      priority: 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.attentionItems.add(newItem);
    setNewTaskTitle('');
    setNewTaskDueDate('');
    setSelectedSourceItemId('');
    setShowNewTaskModal(false);
    onReload();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Attention Queue
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Deadlines, reminders, and tasks grounded in your actual documents
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Read Attention Aloud Controls */}
          {activeItems.length > 0 && (
            <>
              {speechState === 'idle' ? (
                <button
                  onClick={handleReadQueueAloud}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Read Aloud</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800">
                  {speechState === 'playing' ? (
                    <button
                      onClick={() => {
                        speechService.pauseSpeaking();
                        setSpeechState('paused');
                      }}
                      className="p-1 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                      title="Pause"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        speechService.resumeSpeaking();
                        setSpeechState('playing');
                      }}
                      className="p-1 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                      title="Resume"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      speechService.stopSpeaking();
                      setSpeechState('idle');
                    }}
                    className="p-1 text-rose-500 cursor-pointer"
                    title="Stop"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 px-1">
                    {speechState === 'playing' ? 'Reading...' : 'Paused'}
                  </span>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit text-xs">
        {[
          { id: 'active', label: `Actionable (${activeItems.length})` },
          { id: 'completed', label: 'Completed / Dismissed' },
          { id: 'all', label: 'All Items' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
              filter === tab.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Attention Item List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="p-10 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nothing needs your attention right now.
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Extracted deadlines and user-created tasks appear here. LifeDesk never generates fake or imaginary alerts.
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const sourceDoc = items.find((i) => i.id === item.sourceItemId);

            return (
              <div
                key={item.id}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'pending'
                          ? 'text-amber-600 dark:text-amber-400'
                          : item.status === 'confirmed'
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {item.status === 'pending' ? 'Possible Deadline' : item.type}
                    </span>

                    {item.dueDate && (
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        <span>{item.dueDate}</span>
                      </span>
                    )}
                  </div>

                  <h3
                    className={`text-xs sm:text-sm font-semibold ${
                      item.status === 'completed'
                        ? 'line-through text-slate-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {item.title}
                  </h3>

                  {sourceDoc ? (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Source:</span>
                      <button
                        onClick={() => onSelectItem(sourceDoc)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 font-medium cursor-pointer"
                      >
                        <span>{sourceDoc.title}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">
                      Source: {item.sourceItemTitle}
                    </div>
                  )}
                </div>

                {/* Action buttons: [Confirm] [Snooze] [Mark Done] [Dismiss] */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                  {item.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => onConfirmItem(item.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleSnoozeItem(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer flex items-center gap-1"
                        title="Snooze until tomorrow"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>Snooze</span>
                      </button>
                      <button
                        onClick={() => onDismissItem(item.id)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : item.status === 'confirmed' ? (
                    <>
                      <button
                        onClick={() => onCompleteItem(item.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </button>
                      <button
                        onClick={() => handleSnoozeItem(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      >
                        Snooze
                      </button>
                      <button
                        onClick={() => onDismissItem(item.id)}
                        className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onConfirmItem(item.id)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                    >
                      Re-open
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Task Dialog */}
      {showNewTaskModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setShowNewTaskModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Create Attention Item
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task / Action Title
                </label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Submit project abstract"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Due Date (optional)
                </label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Link to Document (optional)
                </label>
                <select
                  value={selectedSourceItemId}
                  onChange={(e) => setSelectedSourceItemId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="">No linked document (standalone task)</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
