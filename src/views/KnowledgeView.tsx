import React, { useState, useMemo } from 'react';
import {
  Plus,
  Link2,
  Folder,
  Unlink,
  Trash2,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import {
  KnowledgeCollection,
  WorkspaceItem,
  ItemConnection,
  db,
  generateId,
  findUnlinkedContextClusters,
  extractKeywordsAndTopics,
} from '../db';

interface KnowledgeViewProps {
  items: WorkspaceItem[];
  collections: KnowledgeCollection[];
  connections: ItemConnection[];
  onSelectItem: (item: WorkspaceItem) => void;
  onReload: () => void;
}

export const KnowledgeView: React.FC<KnowledgeViewProps> = ({
  items,
  collections,
  connections,
  onSelectItem,
  onReload,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [showNewCollectionModal, setShowNewCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');

  const [dismissedClusters, setDismissedClusters] = useState<string[]>([]);
  const [dismissedCategories, setDismissedCategories] = useState<string[]>([]);
  const [renamingSuggestedCat, setRenamingSuggestedCat] = useState<string | null>(null);
  const [customSuggestedName, setCustomSuggestedName] = useState('');

  // Editing an existing collection name
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');

  // 1. Multi-item context clusters ("These items may be related")
  const contextClusters = useMemo(
    () =>
      findUnlinkedContextClusters(items, connections).filter(
        (c) => !dismissedClusters.includes(c.contextLabel)
      ),
    [items, connections, dismissedClusters]
  );

  // 2. Automatic Collection Suggestions based on actual user items that aren't in that collection yet
  const suggestedCollections = useMemo(() => {
    const existingNames = new Set(collections.map((c) => c.name.toLowerCase()));
    const map = new Map<string, WorkspaceItem[]>();

    for (const item of items) {
      const cat =
        item.suggestedCollection ||
        extractKeywordsAndTopics(item.title, item.content, item.fileName).suggestedCategory;
      if (cat && !existingNames.has(cat.toLowerCase()) && !dismissedCategories.includes(cat)) {
        const list = map.get(cat) || [];
        list.push(item);
        map.set(cat, list);
      }
    }

    return Array.from(map.entries()).map(([name, matchingItems]) => ({
      name,
      matchingItems,
    }));
  }, [items, collections, dismissedCategories]);

  const activeCollection = collections.find((c) => c.id === selectedCollectionId);
  const itemsInCollection = items.filter((i) =>
    selectedCollectionId ? i.collectionIds.includes(selectedCollectionId) : true
  );

  const handleConnectCluster = async (cluster: {
    contextLabel: string;
    keywords: string[];
    items: WorkspaceItem[];
  }) => {
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
    onReload();
  };

  const handleAcceptSuggestedCollection = async (
    originalName: string,
    matchingItems: WorkspaceItem[],
    overrideName?: string
  ) => {
    const finalName = (overrideName || originalName).trim();
    if (!finalName) return;

    const newCol: KnowledgeCollection = {
      id: generateId(),
      name: finalName,
      description: `Organized from ${matchingItems.length} item${
        matchingItems.length === 1 ? '' : 's'
      }`,
      createdAt: Date.now(),
    };
    await db.collections.add(newCol);

    for (const item of matchingItems) {
      const nextCols = Array.from(new Set([...item.collectionIds, newCol.id]));
      await db.items.update(item.id, {
        collectionIds: nextCols,
        updatedAt: Date.now(),
      });
    }

    setRenamingSuggestedCat(null);
    setCustomSuggestedName('');
    onReload();
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;

    const newCol: KnowledgeCollection = {
      id: generateId(),
      name: newCollectionName.trim(),
      description: newCollectionDesc.trim(),
      createdAt: Date.now(),
    };

    await db.collections.add(newCol);
    setNewCollectionName('');
    setNewCollectionDesc('');
    setShowNewCollectionModal(false);
    onReload();
    setSelectedCollectionId(newCol.id);
  };

  const handleSaveRenameCollection = async (colId: string) => {
    if (!editingColName.trim()) return;
    await db.collections.update(colId, { name: editingColName.trim() });
    setEditingColId(null);
    setEditingColName('');
    onReload();
  };

  const handleDeleteCollection = async (colId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.collections.delete(colId);
    if (selectedCollectionId === colId) setSelectedCollectionId(null);
    onReload();
  };

  const handleDisconnect = async (connectionId: string) => {
    await db.connections.delete(connectionId);
    onReload();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Knowledge & Smart Organization
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automatic collections and conservative context relationships grounded in your actual files
          </p>
        </div>

        <button
          onClick={() => setShowNewCollectionModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Collection</span>
        </button>
      </div>

      {/* 1. AUTOMATIC COLLECTION SUGGESTIONS (Only when user data supports it) */}
      {suggestedCollections.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Suggested Collections from Your Content
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestedCollections.map((sug) => (
              <div
                key={sug.name}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-2xs space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      Suggested Collection
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {sug.matchingItems.length} item{sug.matchingItems.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {sug.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Based on: {sug.matchingItems.map((i) => i.title).join(' · ')}
                  </p>
                </div>

                {renamingSuggestedCat === sug.name ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customSuggestedName}
                      onChange={(e) => setCustomSuggestedName(e.target.value)}
                      placeholder="New collection name..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                    <button
                      onClick={() =>
                        handleAcceptSuggestedCollection(
                          sug.name,
                          sug.matchingItems,
                          customSuggestedName
                        )
                      }
                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setRenamingSuggestedCat(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleAcceptSuggestedCollection(sug.name, sug.matchingItems)
                      }
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                    >
                      Accept &ldquo;{sug.name}&rdquo;
                    </button>
                    <button
                      onClick={() => {
                        setRenamingSuggestedCat(sug.name);
                        setCustomSuggestedName(sug.name);
                      }}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() =>
                        setDismissedCategories((prev) => [...prev, sug.name])
                      }
                      className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. SMART CONTEXT RELATIONSHIPS ("These items may be related") */}
      {contextClusters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Detected Contexts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contextClusters.map((cluster) => (
              <div
                key={cluster.contextLabel}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      These items may be related
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

                <div className="flex items-center gap-2">
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

      {/* 3. COLLECTIONS / TOPICS ROW */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Collections ({collections.length})
          </h2>
          {selectedCollectionId && (
            <button
              onClick={() => setSelectedCollectionId(null)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Show all items
            </button>
          )}
        </div>

        {collections.length === 0 ? (
          <div className="p-6 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-2">
            <p>
              Collections are created automatically when your uploaded documents support a category, or you can create one manually.
            </p>
            <button
              onClick={() => setShowNewCollectionModal(true)}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
            >
              Create a collection manually
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {collections.map((col) => {
              const count = items.filter((i) => i.collectionIds.includes(col.id)).length;
              const isSelected = selectedCollectionId === col.id;
              return (
                <div
                  key={col.id}
                  onClick={() => setSelectedCollectionId(isSelected ? null : col.id)}
                  className={`p-4 rounded-xl border transition cursor-pointer text-left space-y-1.5 shadow-2xs relative group ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-600 text-indigo-950 dark:text-indigo-200'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Folder
                      className={`w-4 h-4 ${
                        isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                      }`}
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] tabular-nums font-semibold text-slate-400">
                        {count} item{count === 1 ? '' : 's'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingColId(col.id);
                          setEditingColName(col.name);
                        }}
                        title="Rename collection"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCollection(col.id, e)}
                        title="Delete collection"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {editingColId === col.id ? (
                    <div
                      className="flex items-center gap-1 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingColName}
                        onChange={(e) => setEditingColName(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                      />
                      <button
                        onClick={() => handleSaveRenameCollection(col.id)}
                        className="p-1 text-emerald-600 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <h3 className="text-xs sm:text-sm font-bold truncate">{col.name}</h3>
                  )}

                  {col.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {col.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. ACTIVE CONNECTIONS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Connected Items ({connections.length})
          </h2>
        </div>

        {connections.length === 0 ? (
          <div className="p-6 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <Link2 className="w-5 h-5 text-slate-400 mx-auto mb-1" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No manual or confirmed connections yet.
            </p>
            <p className="text-[11px] text-slate-400">
              When you upload related files (such as multiple experiments or project notes), LifeDesk will offer to connect them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {connections.map((conn) => {
              const source = items.find((i) => i.id === conn.sourceItemId);
              const target = items.find((i) => i.id === conn.targetItemId);
              if (!source || !target) return null;

              return (
                <div
                  key={conn.id}
                  className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs"
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <button
                      onClick={() => onSelectItem(source)}
                      className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[130px] sm:max-w-[160px] text-left cursor-pointer"
                    >
                      {source.title}
                    </button>
                    <span className="text-slate-400 shrink-0">↔</span>
                    <button
                      onClick={() => onSelectItem(target)}
                      className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[130px] sm:max-w-[160px] text-left cursor-pointer"
                    >
                      {target.title}
                    </button>
                  </div>

                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    title="Disconnect items"
                    className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. ITEMS IN ACTIVE COLLECTION */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {activeCollection
            ? `Items in ${activeCollection.name}`
            : 'All Workspace Items'}{' '}
          ({itemsInCollection.length})
        </h2>

        {itemsInCollection.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No items in this collection yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {itemsInCollection.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectItem(item)}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition cursor-pointer space-y-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <span>{item.type}</span>
                  <span>
                    {new Date(item.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {item.title}
                </h3>
                {item.content && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {item.summary || item.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New Collection Modal */}
      {showNewCollectionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setShowNewCollectionModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Create Collection
            </h3>
            <form onSubmit={handleCreateCollection} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Collection Name
                </label>
                <input
                  type="text"
                  required
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="e.g. College, DTIL Project, Finance"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  placeholder="Short context about this collection"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCollectionModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
