import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  FileText,
  Mic,
  Camera,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Clock,
  StopCircle,
  Tag,
  Folder,
  CheckCircle2,
  Loader2,
  Link2,
  Edit3,
  ExternalLink,
} from 'lucide-react';
import {
  db,
  generateId,
  WorkspaceItem,
  AttentionItem,
  KnowledgeCollection,
  extractLocalDates,
  extractKeywordsAndTopics,
} from '../db';
import {
  runSmartFilePipeline,
  PipelineStep,
  ProcessedDocumentResult,
  formatBytes,
} from '../services/documentProcessor';
import { speechService, parseVoiceCommandIntent } from '../services/voice';

export type CaptureMode = 'file' | 'note' | 'voice' | 'camera' | 'link';

interface UniversalCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: CaptureMode;
  initialDroppedFile?: File | null;
  onItemSaved: (item: WorkspaceItem) => void;
  onOpenItem: (item: WorkspaceItem) => void;
  onExecuteVoiceSearch?: (query: string) => void;
  onReadAttentionAloud?: () => void;
}

export const UniversalCaptureModal: React.FC<UniversalCaptureModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'file',
  initialDroppedFile = null,
  onItemSaved,
  onOpenItem,
  onExecuteVoiceSearch,
  onReadAttentionAloud,
}) => {
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [isProcessing, setIsProcessing] = useState(false);

  // Smart Pipeline State
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [pipelineResult, setPipelineResult] = useState<ProcessedDocumentResult | null>(null);
  const [savedPipelineItem, setSavedPipelineItem] = useState<WorkspaceItem | null>(null);
  const [isReviewingImport, setIsReviewingImport] = useState(false);
  const [appliedCollectionName, setAppliedCollectionName] = useState<string | null>(null);
  const [customCollectionInput, setCustomCollectionInput] = useState('');
  const [isRenamingCollection, setIsRenamingCollection] = useState(false);
  const [connectedRelatedIds, setConnectedRelatedIds] = useState<string[]>([]);

  // Form fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [detectedDates, setDetectedDates] = useState<
    Array<{ label: string; date: string; confidence: 'high' | 'medium' | 'low'; confirmed?: boolean }>
  >([]);

  // File ref
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [waveformLevels, setWaveformLevels] = useState<number[]>(new Array(16).fill(14));

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Link state
  const [urlInput, setUrlInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      db.collections.toArray().then(setCollections);
      if (initialDroppedFile) {
        setMode('file');
        handleIntelligentFileImport(initialDroppedFile);
      }
    } else {
      stopCamera();
      if (isRecording) {
        speechService.stopListening();
        setIsRecording(false);
      }
      resetForm();
    }
  }, [isOpen, initialMode, initialDroppedFile]);

  // Clipboard paste handler for screenshots / files
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            setMode('file');
            await handleIntelligentFileImport(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTagsInput('');
    setSelectedCollectionId('');
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setVoiceTranscript('');
    setIsEditingTranscript(false);
    setVoiceError(null);
    setCapturedPhotoUrl(null);
    setCameraError(null);
    setUrlInput('');
    setDetectedDates([]);
    setPipelineStep(null);
    setPipelineResult(null);
    setSavedPipelineItem(null);
    setIsReviewingImport(false);
    setAppliedCollectionName(null);
    setCustomCollectionInput('');
    setIsRenamingCollection(false);
    setConnectedRelatedIds([]);
    setWaveformLevels(new Array(16).fill(14));
  };

  // Universal Intelligent File Import Pipeline
  const handleIntelligentFileImport = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setPipelineResult(null);
    setSavedPipelineItem(null);
    setIsReviewingImport(false);
    setAppliedCollectionName(null);
    setConnectedRelatedIds([]);

    try {
      const result = await runSmartFilePipeline(file, (prog) => {
        setPipelineStep(prog.step);
      });

      setPipelineResult(result);
      setTitle(result.title);
      setContent(result.content);
      setFilePreviewUrl(result.fileData || null);
      setDetectedDates(result.detectedDates);
      setTagsInput(result.suggestedTags.join(', '));

      // Automatically match or create collection if high-confidence category exists
      let targetCollectionId = result.matchedExistingCollectionId || '';
      let targetCollectionName = result.matchedExistingCollectionName || null;

      if (!targetCollectionId && result.suggestedCollection) {
        // Check again in DB
        const existing = await db.collections
          .filter((c) => c.name.toLowerCase() === result.suggestedCollection!.toLowerCase())
          .first();
        if (existing) {
          targetCollectionId = existing.id;
          targetCollectionName = existing.name;
        } else {
          const newCol: KnowledgeCollection = {
            id: generateId(),
            name: result.suggestedCollection,
            description: `Automatically organized ${result.suggestedCollection.toLowerCase()} items`,
            createdAt: Date.now(),
          };
          await db.collections.add(newCol);
          targetCollectionId = newCol.id;
          targetCollectionName = newCol.name;
          const updatedCols = await db.collections.toArray();
          setCollections(updatedCols);
        }
      }

      setSelectedCollectionId(targetCollectionId);
      setAppliedCollectionName(targetCollectionName);
      setCustomCollectionInput(targetCollectionName || result.suggestedCollection || '');

      // Save the item to IndexedDB immediately so it is indexed and safe
      const itemId = generateId();
      const newItem: WorkspaceItem = {
        id: itemId,
        title: result.title,
        type: result.type,
        content: result.content,
        summary: result.summary,
        fileData: result.fileData,
        fileName: result.fileName,
        fileSize: result.fileSize,
        mimeType: result.mimeType,
        source: 'Intelligent Import',
        tags: result.suggestedTags,
        topics: result.topics,
        collectionIds: targetCollectionId ? [targetCollectionId] : [],
        suggestedCollection: result.suggestedCollection || undefined,
        detectedDates: result.detectedDates,
        isImportant: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          sha256: result.sha256,
          dimensions: result.dimensions,
          extractionWarning: result.extractionWarning,
        },
      };

      await db.items.put(newItem);

      // Add pending attention items for detected dates so user can confirm or dismiss in Attention Queue
      for (const d of result.detectedDates) {
        const attItem: AttentionItem = {
          id: generateId(),
          title: `${d.label}: ${d.date}`,
          sourceItemId: newItem.id,
          sourceItemTitle: newItem.title,
          sourceItemType: newItem.type,
          dueDate: d.date,
          status: d.confidence === 'high' ? 'pending' : 'pending',
          type: 'deadline',
          priority: d.confidence === 'high' ? 'high' : 'medium',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.attentionItems.add(attItem);
      }

      setSavedPipelineItem(newItem);
      onItemSaved(newItem);
    } catch (err) {
      console.error('Intelligent import error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rename or change collection for the imported item
  const handleApplyCustomCollection = async () => {
    if (!savedPipelineItem || !customCollectionInput.trim()) return;
    const cleanName = customCollectionInput.trim();
    let col = await db.collections
      .filter((c) => c.name.toLowerCase() === cleanName.toLowerCase())
      .first();

    if (!col) {
      col = {
        id: generateId(),
        name: cleanName,
        createdAt: Date.now(),
      };
      await db.collections.add(col);
      setCollections(await db.collections.toArray());
    }

    const updatedItem: WorkspaceItem = {
      ...savedPipelineItem,
      collectionIds: [col.id],
      updatedAt: Date.now(),
    };
    await db.items.put(updatedItem);
    setSavedPipelineItem(updatedItem);
    setSelectedCollectionId(col.id);
    setAppliedCollectionName(col.name);
    setIsRenamingCollection(false);
    onItemSaved(updatedItem);
  };

  // Connect related item from pipeline summary
  const handleConnectRelatedFromPipeline = async (targetId: string) => {
    if (!savedPipelineItem || connectedRelatedIds.includes(targetId)) return;
    await db.connections.add({
      id: generateId(),
      sourceItemId: savedPipelineItem.id,
      targetItemId: targetId,
      relationType: 'related',
      createdAt: Date.now(),
    });
    setConnectedRelatedIds((prev) => [...prev, targetId]);
    onItemSaved(savedPipelineItem);
  };

  // Voice recording controls
  const startVoiceRecording = () => {
    setVoiceError(null);
    setVoiceTranscript('');
    setIsEditingTranscript(false);
    const success = speechService.startListening(
      (result) => {
        setVoiceTranscript(result.transcript);
        const dates = extractLocalDates(result.transcript);
        setDetectedDates(dates);
      },
      (err) => {
        setVoiceError(err);
        setIsRecording(false);
      },
      () => {
        setIsRecording(false);
        setWaveformLevels(new Array(16).fill(14));
      },
      (levels) => {
        setWaveformLevels(levels);
      }
    );

    if (success) {
      setIsRecording(true);
    }
  };

  const stopVoiceRecording = () => {
    speechService.stopListening();
    setIsRecording(false);
    setWaveformLevels(new Array(16).fill(14));
  };

  // Confirm voice transcript (handles commands like "Find my DTIL documents" or saves note)
  const handleConfirmVoiceTranscript = async () => {
    if (!voiceTranscript.trim()) return;
    stopVoiceRecording();

    const intent = parseVoiceCommandIntent(voiceTranscript);
    if (intent.type === 'search' && onExecuteVoiceSearch) {
      onExecuteVoiceSearch(intent.query);
      onClose();
      return;
    }

    if (intent.type === 'read_attention' && onReadAttentionAloud) {
      onReadAttentionAloud();
      onClose();
      return;
    }

    // Save as voice note
    setIsProcessing(true);
    try {
      const analysis = extractKeywordsAndTopics(
        title.trim() || (intent.type === 'create_note' ? intent.title : 'Voice Capture'),
        voiceTranscript
      );
      const dates = extractLocalDates(voiceTranscript);

      let colIds: string[] = selectedCollectionId ? [selectedCollectionId] : [];
      if (colIds.length === 0 && analysis.suggestedCategory) {
        const existingCol = await db.collections
          .filter((c) => c.name.toLowerCase() === analysis.suggestedCategory!.toLowerCase())
          .first();
        if (existingCol) colIds = [existingCol.id];
      }

      const newItem: WorkspaceItem = {
        id: generateId(),
        title: title.trim() || (intent.type === 'create_note' ? intent.title : 'Voice Capture'),
        type: 'voice',
        content: voiceTranscript.trim(),
        source: 'Voice Capture',
        tags: Array.from(
          new Set([
            ...tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
            ...(analysis.suggestedCategory ? [analysis.suggestedCategory] : []),
            ...analysis.topics.slice(0, 2),
          ])
        ),
        topics: analysis.topics,
        collectionIds: colIds,
        detectedDates: dates,
        isImportant: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.items.add(newItem);

      for (const d of dates) {
        await db.attentionItems.add({
          id: generateId(),
          title: `${d.label}: ${d.date}`,
          sourceItemId: newItem.id,
          sourceItemTitle: newItem.title,
          sourceItemType: newItem.type,
          dueDate: d.date,
          status: d.confirmed ? 'confirmed' : 'pending',
          type: 'deadline',
          priority: 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      onItemSaved(newItem);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  // Camera controls
  const startCamera = async () => {
    setCameraError(null);
    setCapturedPhotoUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Enable camera access in your browser address bar to scan documents.'
          : `Camera unavailable: ${err.message}`
      );
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const takePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedPhotoUrl(dataUrl);
      stopCamera();

      // Convert to File and run through Smart File Pipeline
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const scannedFile = new File(
        [blob],
        `Document_Scan_${new Date().toISOString().slice(0, 10)}.jpg`,
        { type: 'image/jpeg' }
      );
      await handleIntelligentFileImport(scannedFile);
    }
  };

  // Save Note / Link / Reviewed Import
  const handleManualSave = async () => {
    setIsProcessing(true);
    try {
      const manualTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const analysis = extractKeywordsAndTopics(title, content || urlInput);
      const finalTags = Array.from(
        new Set([
          ...manualTags,
          ...(analysis.suggestedCategory && manualTags.length === 0 ? [analysis.suggestedCategory] : []),
          ...analysis.topics.slice(0, 2),
        ])
      );

      let colIds = selectedCollectionId ? [selectedCollectionId] : [];
      if (colIds.length === 0 && analysis.suggestedCategory) {
        const existingCol = await db.collections
          .filter((c) => c.name.toLowerCase() === analysis.suggestedCategory!.toLowerCase())
          .first();
        if (existingCol) {
          colIds = [existingCol.id];
        } else {
          const createdCol: KnowledgeCollection = {
            id: generateId(),
            name: analysis.suggestedCategory,
            createdAt: Date.now(),
          };
          await db.collections.add(createdCol);
          colIds = [createdCol.id];
        }
      }

      if (savedPipelineItem) {
        // Update already-imported item after Review
        const updatedItem: WorkspaceItem = {
          ...savedPipelineItem,
          title: title.trim() || savedPipelineItem.title,
          content: content,
          tags: finalTags,
          collectionIds: colIds,
          detectedDates,
          updatedAt: Date.now(),
        };
        await db.items.put(updatedItem);
        onItemSaved(updatedItem);
        onClose();
        return;
      }

      const itemId = generateId();
      const finalType: WorkspaceItem['type'] =
        mode === 'link' ? 'link' : mode === 'camera' ? 'image' : 'note';
      const finalContent = mode === 'link' ? `${urlInput}\n${content}`.trim() : content;

      const newItem: WorkspaceItem = {
        id: itemId,
        title:
          title.trim() ||
          (mode === 'link'
            ? urlInput
            : content.split('\n')[0]?.slice(0, 48) || 'Untitled Note'),
        type: finalType,
        content: finalContent,
        fileData: capturedPhotoUrl || filePreviewUrl || undefined,
        source: mode === 'link' ? 'Saved Link' : 'Note',
        tags: finalTags,
        topics: analysis.topics,
        collectionIds: colIds,
        detectedDates,
        isImportant: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.items.add(newItem);

      for (const d of detectedDates) {
        await db.attentionItems.add({
          id: generateId(),
          title: `${d.label}: ${d.date}`,
          sourceItemId: newItem.id,
          sourceItemTitle: newItem.title,
          sourceItemType: newItem.type,
          dueDate: d.date,
          status: d.confirmed ? 'confirmed' : 'pending',
          type: 'deadline',
          priority: 'high',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      onItemSaved(newItem);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const pipelineStepsOrder: Array<{ key: PipelineStep; label: string }> = [
    { key: 'extracting', label: 'Extracting text...' },
    { key: 'understanding', label: 'Understanding document...' },
    { key: 'dates', label: 'Finding dates...' },
    { key: 'relationships', label: 'Checking related items...' },
  ];

  const getStepState = (stepKey: PipelineStep) => {
    if (!pipelineStep) return 'waiting';
    if (pipelineStep === 'completed') return 'done';
    const order: PipelineStep[] = ['validating', 'extracting', 'understanding', 'dates', 'relationships', 'completed'];
    const currentIdx = order.indexOf(pipelineStep);
    const targetIdx = order.indexOf(stepKey);
    if (currentIdx > targetIdx) return 'done';
    if (currentIdx === targetIdx) return 'active';
    return 'waiting';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {savedPipelineItem && !isReviewingImport
                ? 'Intelligent Import Complete'
                : isProcessing && selectedFile
                ? `Processing ${selectedFile.name}`
                : 'Capture to LifeDesk'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {savedPipelineItem && !isReviewingImport
                ? 'Processed locally and indexed for instant search'
                : 'Files, scans, notes, voice memos, and links are organized automatically'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close capture modal"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (hidden when showing completed import summary) */}
        {!savedPipelineItem && (
          <div className="flex items-center gap-1.5 px-6 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
            {[
              { id: 'file', label: 'Add File', icon: Upload },
              { id: 'camera', label: 'Scan', icon: Camera },
              { id: 'note', label: 'Note', icon: FileText },
              { id: 'voice', label: 'Voice', icon: Mic },
              { id: 'link', label: 'Link', icon: LinkIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMode(tab.id as CaptureMode);
                    if (tab.id === 'camera' && !cameraStream && !capturedPhotoUrl) {
                      startCamera();
                    } else if (tab.id !== 'camera') {
                      stopCamera();
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* LIVE SMART PIPELINE PROGRESS & RESULT CARD */}
          {(isProcessing && selectedFile) || (savedPipelineItem && !isReviewingImport) ? (
            <div className="space-y-5">
              {/* File banner */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedFile?.name || savedPipelineItem?.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatBytes(selectedFile?.size || savedPipelineItem?.fileSize)} ·{' '}
                      {savedPipelineItem?.type.toUpperCase() || 'DOCUMENT'}
                    </p>
                  </div>
                </div>
                {isProcessing && (
                  <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                )}
              </div>

              {/* Pipeline Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pipelineStepsOrder.map((st) => {
                  const stState = getStepState(st.key);
                  return (
                    <div
                      key={st.key}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs transition-all ${
                        stState === 'done'
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-medium'
                          : stState === 'active'
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      {stState === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : stState === 'active' ? (
                        <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
                      )}
                      <span>{st.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Completed Intelligence Summary */}
              {savedPipelineItem && pipelineResult && (
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4 animate-in fade-in duration-200">
                  {pipelineResult.extractionWarning && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{pipelineResult.extractionWarning}</span>
                    </div>
                  )}

                  <div className="space-y-2.5 text-xs">
                    {/* 1. Collection Assignment */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>
                          {appliedCollectionName
                            ? `Added to ${appliedCollectionName}`
                            : 'Saved to Desk (Uncategorized)'}
                        </span>
                      </div>
                      {!isRenamingCollection ? (
                        <button
                          onClick={() => setIsRenamingCollection(true)}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                        >
                          {appliedCollectionName ? 'Change / Rename' : 'Assign Collection'}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={customCollectionInput}
                            onChange={(e) => setCustomCollectionInput(e.target.value)}
                            placeholder="Collection name..."
                            className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                          />
                          <button
                            onClick={handleApplyCustomCollection}
                            className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[11px] font-semibold cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 2. Detected Topics / Context */}
                    {pipelineResult.topics.length > 0 && (
                      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>
                          Topics identified: {pipelineResult.topics.join(' · ')}
                        </span>
                      </div>
                    )}

                    {/* 3. Detected Dates */}
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>
                        {pipelineResult.detectedDates.length > 0
                          ? `${pipelineResult.detectedDates.length} date${
                              pipelineResult.detectedDates.length === 1 ? '' : 's'
                            } detected (${pipelineResult.detectedDates.map((d) => d.date).join(', ')})`
                          : 'No deadlines detected'}
                      </span>
                    </div>

                    {/* 4. Search Index confirmation */}
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Searchable offline across title, content, and tags</span>
                    </div>
                  </div>

                  {/* Related Items suggestion */}
                  {pipelineResult.relatedItems.length > 0 && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Related items found on your desk
                      </p>
                      <div className="space-y-1.5">
                        {pipelineResult.relatedItems.map((rel) => {
                          const isConnected = connectedRelatedIds.includes(rel.id);
                          return (
                            <div
                              key={rel.id}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                            >
                              <div className="truncate pr-2">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {rel.title}
                                </span>
                                <span className="text-[11px] text-slate-400 ml-2">
                                  ({rel.commonKeywords.join(', ')})
                                </span>
                              </div>
                              <button
                                onClick={() => handleConnectRelatedFromPipeline(rel.id)}
                                disabled={isConnected}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer shrink-0 ${
                                  isConnected
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                }`}
                              >
                                {isConnected ? 'Connected' : 'Connect'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Primary Action Bar: [Open] [Review] [Done] */}
                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => {
                        onOpenItem(savedPipelineItem);
                        onClose();
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </button>
                    <button
                      onClick={() => setIsReviewingImport(true)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Review</span>
                    </button>
                    <button
                      onClick={onClose}
                      className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* STANDARD / REVIEW CAPTURE INTERFACES */
            <>
              {mode === 'file' && !savedPipelineItem && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleIntelligentFileImport(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-2xl p-10 text-center cursor-pointer transition-all bg-slate-50/60 dark:bg-slate-900/50 group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Drop any file here or click to import
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                      PDFs, screenshots, notices, receipts, images, or notes. LifeDesk automatically extracts text, finds dates, and organizes it for you.
                    </p>
                  </div>
                </div>
              )}

              {mode === 'voice' && (
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center space-y-5">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <button
                      onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg cursor-pointer ${
                        isRecording
                          ? 'bg-rose-600 hover:bg-rose-700 text-white ring-4 ring-rose-500/20'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                    >
                      {isRecording ? (
                        <StopCircle className="w-8 h-8" />
                      ) : (
                        <Mic className="w-8 h-8" />
                      )}
                    </button>

                    {/* Live Animated Waveform */}
                    {isRecording && (
                      <div className="flex items-center justify-center gap-1 h-10 px-4">
                        {waveformLevels.map((lvl, idx) => (
                          <span
                            key={idx}
                            className="w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-75"
                            style={{ height: `${Math.max(15, lvl)}%` }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {isRecording
                        ? 'Listening... Speak naturally'
                        : 'Tap microphone to speak a note or command'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Try: &ldquo;Remember that my project presentation is next Friday&rdquo; or &ldquo;Find my DTIL documents&rdquo;
                    </p>
                  </div>

                  {voiceError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400">
                      {voiceError}
                    </div>
                  )}

                  {(voiceTranscript || isEditingTranscript) && (
                    <div className="text-left bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-700">
                        <span className="text-[11px] font-semibold text-slate-500">
                          Transcript Preview
                        </span>
                        <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                          {parseVoiceCommandIntent(voiceTranscript).type === 'search'
                            ? 'Voice Command: Search Desk'
                            : parseVoiceCommandIntent(voiceTranscript).type === 'read_attention'
                            ? 'Voice Command: Read Attention Queue'
                            : 'Action: Save as Voice Note'}
                        </span>
                      </div>

                      <textarea
                        value={voiceTranscript}
                        readOnly={!isEditingTranscript}
                        onChange={(e) => setVoiceTranscript(e.target.value)}
                        rows={3}
                        className={`w-full text-xs text-slate-900 dark:text-white bg-transparent resize-none focus:outline-hidden ${
                          isEditingTranscript
                            ? 'p-2 border border-indigo-400 rounded-lg bg-slate-50 dark:bg-slate-900'
                            : ''
                        }`}
                        placeholder="Speak or type transcript..."
                      />

                      {/* Explicit [Confirm] [Edit] [Cancel] actions */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            stopVoiceRecording();
                            setVoiceTranscript('');
                            setIsEditingTranscript(false);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingTranscript(!isEditingTranscript)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          {isEditingTranscript ? 'Done Editing' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmVoiceTranscript}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mode === 'camera' && !savedPipelineItem && (
                <div className="space-y-3">
                  {!capturedPhotoUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      {cameraStream && (
                        <button
                          onClick={takePhoto}
                          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-slate-900 rounded-full px-5 py-2 text-xs font-bold shadow-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer"
                        >
                          Scan Document
                        </button>
                      )}
                      {cameraError && (
                        <div className="absolute inset-0 p-6 bg-slate-900/95 text-white flex flex-col items-center justify-center text-center">
                          <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                          <p className="text-xs max-w-sm leading-relaxed">{cameraError}</p>
                          <button
                            onClick={startCamera}
                            className="mt-4 px-4 py-2 text-xs font-semibold bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                          >
                            Retry Camera
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {mode === 'link' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Web URL
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (!title && e.target.value) {
                        try {
                          const u = new URL(e.target.value);
                          setTitle(u.hostname.replace(/^www\./, ''));
                        } catch {}
                      }
                    }}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Note / Link / Review Editor Fields */}
              {(mode === 'note' || mode === 'link' || isReviewingImport) && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Clear title..."
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {isReviewingImport ? 'Extracted Text & Notes' : 'Content'}
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        const dates = extractLocalDates(e.target.value);
                        if (dates.length > 0) setDetectedDates(dates);
                      }}
                      rows={5}
                      placeholder="Write a note, paste information, or capture key points..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 leading-relaxed font-mono"
                    />
                  </div>

                  {/* Detected Dates Preview */}
                  {detectedDates.length > 0 && (
                    <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Possible dates detected</span>
                      </div>
                      <div className="space-y-1.5">
                        {detectedDates.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200/40 dark:border-amber-900/30"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {item.date}
                              </span>
                              <span className="text-[11px] text-slate-400 ml-2">
                                {item.label}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...detectedDates];
                                updated[idx].confirmed = !updated[idx].confirmed;
                                setDetectedDates(updated);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition cursor-pointer ${
                                item.confirmed
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                              }`}
                            >
                              {item.confirmed ? 'Confirmed Deadline' : 'Confirm as Deadline'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span>Tags</span>
                      </label>
                      <input
                        type="text"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="Optional tags (comma-separated)"
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        <Folder className="w-3 h-3 text-slate-400" />
                        <span>Collection (Auto-detected if blank)</span>
                      </label>
                      <select
                        value={selectedCollectionId}
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
                      >
                        <option value="">Auto-detect from content</option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer for Note / Link / Review Mode */}
        {(mode === 'note' || mode === 'link' || isReviewingImport) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] text-slate-400">Saved locally on this device</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleManualSave}
                disabled={isProcessing}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? 'Saving...' : isReviewingImport ? 'Save Changes' : 'Save to Desk'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
