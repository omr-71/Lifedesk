import React, { useState, useMemo, useEffect } from 'react';
import { Search, Mic, X } from 'lucide-react';
import { WorkspaceItem, KnowledgeCollection } from '../db';
import { speechService } from '../services/voice';

interface SearchViewProps {
  items: WorkspaceItem[];
  collections?: KnowledgeCollection[];
  initialQuery?: string;
  onSelectItem: (item: WorkspaceItem) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  items,
  collections = [],
  initialQuery = '',
  onSelectItem,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [isVoiceSearching, setIsVoiceSearching] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Voice search
  const handleVoiceSearch = () => {
    if (isVoiceSearching) {
      speechService.stopListening();
      setIsVoiceSearching(false);
      return;
    }

    setIsVoiceSearching(true);
    speechService.startListening(
      (res) => {
        setQuery(res.transcript);
      },
      () => {
        setIsVoiceSearching(false);
      },
      () => {
        setIsVoiceSearching(false);
      }
    );
  };

  // Filtered and scored results
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();

    return items.filter((item) => {
      if (selectedType !== 'all' && item.type !== selectedType) return false;
      if (selectedCollectionId !== 'all' && !item.collectionIds.includes(selectedCollectionId)) {
        return false;
      }

      if (!q) return true;

      const inTitle = item.title.toLowerCase().includes(q);
      const inContent = item.content.toLowerCase().includes(q);
      const inTags = item.tags.some((t) => t.toLowerCase().includes(q));
      const inTopics = (item.topics || []).some((tp) => tp.toLowerCase().includes(q));
      const inFileName = item.fileName ? item.fileName.toLowerCase().includes(q) : false;

      return inTitle || inContent || inTags || inTopics || inFileName;
    });
  }, [items, query, selectedType, selectedCollectionId]);

  const renderSnippet = (content: string, q: string) => {
    if (!q || !content) return content.slice(0, 160);
    const index = content.toLowerCase().indexOf(q.toLowerCase());
    if (index === -1) return content.slice(0, 160);

    const start = Math.max(0, index - 40);
    const end = Math.min(content.length, index + q.length + 60);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < content.length ? '...' : '';

    return `${prefix}${content.slice(start, end)}${suffix}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-200">
      {/* Search Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Universal Search
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Instant offline search across filenames, extracted text, OCR scans, notes, and topics
        </p>
      </div>

      {/* Search Bar & Voice Input */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by keywords, dates, topics, or exact text..."
            className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={handleVoiceSearch}
          title="Voice search"
          className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
            isVoiceSearching
              ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Mic className="w-4 h-4 text-indigo-500" />
        </button>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs">
          {[
            { id: 'all', label: 'All Types' },
            { id: 'document', label: 'Docs' },
            { id: 'image', label: 'Images' },
            { id: 'note', label: 'Notes' },
            { id: 'voice', label: 'Voice' },
            { id: 'link', label: 'Links' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedType(t.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                selectedType === t.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {collections.length > 0 && (
          <select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-hidden"
          >
            <option value="all">All Collections</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        )}

        {(query || selectedType !== 'all' || selectedCollectionId !== 'all') && (
          <button
            onClick={() => {
              setQuery('');
              setSelectedType('all');
              setSelectedCollectionId('all');
            }}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline ml-auto cursor-pointer"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Found <strong className="tabular-nums text-slate-700 dark:text-slate-200">{results.length}</strong> matching item{results.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Results List */}
      <div className="space-y-2.5">
        {results.length === 0 ? (
          <div className="p-10 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <Search className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No matching items found
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              {query
                ? `No items on your desk match "${query}". Try searching for a different keyword or topic.`
                : 'No items on your desk yet.'}
            </p>
          </div>
        ) : (
          results.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-xl transition cursor-pointer space-y-1.5 shadow-2xs hover:shadow-xs group"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="font-semibold uppercase tracking-wider">{item.type}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {new Date(item.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {item.tags.length > 0 && (
                  <span className="truncate max-w-[200px]">{item.tags.join(' · ')}</span>
                )}
              </div>

              <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {item.title}
              </h3>

              {item.content && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                  {renderSnippet(item.content, query)}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
