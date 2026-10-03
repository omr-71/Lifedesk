import React, { useState } from 'react';
import {
  FileText,
  Clock,
  Sparkles,
  Image as ImageIcon,
  Video as VideoIcon,
  Copy,
  Check,
  Download,
  Plus,
  Loader2,
  RotateCw,
  Calculator,
  Sliders,
} from 'lucide-react';
import { WorkspaceItem, generateId, db, extractLocalDates } from '../db';

interface ToolsViewProps {
  items: WorkspaceItem[];
  onItemSaved: (item: WorkspaceItem) => void;
  onOpenLiveVoice: () => void;
}

type ActiveTool =
  | 'text-tools'
  | 'doc-image-tools'
  | 'media-analyst'
  | 'visual-studio'
  | 'calculators';

export const ToolsView: React.FC<ToolsViewProps> = ({ items, onItemSaved }) => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('text-tools');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // 1. Text & Pattern Extraction Utilities state
  const [rawText, setRawText] = useState('');
  const [copiedState, setCopiedState] = useState(false);
  const [extractedItems, setExtractedItems] = useState<{ label: string; values: string[] } | null>(
    null
  );

  // 2. Document & Image Tools state (Rotate, Compress/Resize, Scan Enhancer, Printable PDF Sheet)
  const [toolImgDataUrl, setToolImgDataUrl] = useState<string | null>(null);
  const [toolImgName, setToolImgName] = useState<string>('Document_Image.jpg');
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [scanContrastMode, setScanContrastMode] = useState<boolean>(false);
  const [qualityLevel, setQualityLevel] = useState<number>(0.85);
  const [scalePercent, setScalePercent] = useState<number>(100);
  const [processedImgUrl, setProcessedImgUrl] = useState<string | null>(null);
  const [processedSizeKb, setProcessedSizeKb] = useState<number | null>(null);

  // 3. Visual & Video Inspector state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaPrompt, setMediaPrompt] = useState('');
  const [mediaAnalysis, setMediaAnalysis] = useState<string | null>(null);
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // 4. Visual Studio state (1K, 2K, 4K)
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgSize, setImgSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imgAspect, setImgAspect] = useState<'1:1' | '16:9' | '4:3' | '9:16'>('1:1');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // 5. Quick Calculators & Converters state
  const [startDateStr, setStartDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [endDateStr, setEndDateStr] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [unitCategory, setUnitCategory] = useState<'length' | 'weight' | 'data'>('data');
  const [unitValue, setUnitValue] = useState<string>('1024');
  const [billAmount, setBillAmount] = useState<string>('120');
  const [splitCount, setSplitCount] = useState<string>('3');

  const showToast = (msg: string) => {
    setSaveNotice(msg);
    setTimeout(() => setSaveNotice(null), 3000);
  };

  // --- 1. TEXT UTILITIES ---
  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
  const charCount = rawText.length;
  const sentenceCount = rawText.trim() ? (rawText.match(/[.!?]+(?:\s|$)/g) || []).length : 0;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  const applyTextTransform = (type: 'sentence' | 'upper' | 'lower' | 'clean') => {
    if (type === 'sentence') {
      setRawText(rawText.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase()));
    } else if (type === 'upper') {
      setRawText(rawText.toUpperCase());
    } else if (type === 'lower') {
      setRawText(rawText.toLowerCase());
    } else if (type === 'clean') {
      setRawText(
        rawText
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      );
    }
  };

  const runPatternExtractor = (kind: 'emails' | 'phones' | 'urls' | 'dates') => {
    if (!rawText.trim()) return;
    if (kind === 'emails') {
      const matches = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      setExtractedItems({ label: 'Extracted Emails', values: Array.from(new Set(matches)) });
    } else if (kind === 'phones') {
      const matches =
        rawText.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
      setExtractedItems({ label: 'Extracted Phone Numbers', values: Array.from(new Set(matches)) });
    } else if (kind === 'urls') {
      const matches = rawText.match(/https?:\/\/[^\s,)"']+/gi) || [];
      setExtractedItems({ label: 'Extracted URLs', values: Array.from(new Set(matches)) });
    } else if (kind === 'dates') {
      const dates = extractLocalDates(rawText);
      setExtractedItems({
        label: 'Extracted Dates & Deadlines',
        values: dates.map((d) => `${d.date} (${d.label})`),
      });
    }
  };

  const handleSaveTextAsNote = async () => {
    if (!rawText.trim()) return;
    const firstLine = rawText.trim().split('\n')[0]?.slice(0, 48) || 'Text Utility Note';
    const newItem: WorkspaceItem = {
      id: generateId(),
      title: firstLine,
      type: 'note',
      content: rawText.trim(),
      source: 'Text Utilities',
      tags: ['Note'],
      collectionIds: [],
      detectedDates: extractLocalDates(rawText),
      isImportant: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.items.add(newItem);
    onItemSaved(newItem);
    showToast('Saved text as a note on your Desk.');
  };

  // --- 2. DOCUMENT & IMAGE TOOLS ---
  const handleToolImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setToolImgName(file.name);
      setRotationDeg(0);
      setScanContrastMode(false);
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        setToolImgDataUrl(res);
        renderCanvasAdjustments(res, 0, false, qualityLevel, scalePercent);
      };
      reader.readAsDataURL(file);
    }
  };

  const renderCanvasAdjustments = (
    sourceUrl: string,
    rot: number,
    contrastScan: boolean,
    qual: number,
    scale: number
  ) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const rad = (rot * Math.PI) / 180;
      const swapDims = rot % 180 !== 0;
      const targetW = Math.round((img.naturalWidth * scale) / 100);
      const targetH = Math.round((img.naturalHeight * scale) / 100);

      canvas.width = swapDims ? targetH : targetW;
      canvas.height = swapDims ? targetW : targetH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (contrastScan) {
        ctx.filter = 'grayscale(100%) contrast(155%) brightness(106%)';
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);

      const outUrl = canvas.toDataURL('image/jpeg', qual);
      setProcessedImgUrl(outUrl);
      const approxBytes = Math.round((outUrl.length * 3) / 4);
      setProcessedSizeKb(Math.round(approxBytes / 1024));
    };
    img.src = sourceUrl;
  };

  const handleSaveProcessedImageToDesk = async () => {
    const finalUrl = processedImgUrl || toolImgDataUrl;
    if (!finalUrl) return;
    const newItem: WorkspaceItem = {
      id: generateId(),
      title: `Processed: ${toolImgName.replace(/\.[^/.]+$/, '')}`,
      type: 'image',
      content: `Document scan / image processed locally (${
        processedSizeKb ? `${processedSizeKb} KB` : 'optimized'
      }).`,
      fileData: finalUrl,
      fileName: toolImgName,
      mimeType: 'image/jpeg',
      source: 'Document Tools',
      tags: ['Scan', 'Processed'],
      collectionIds: [],
      detectedDates: [],
      isImportant: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.items.add(newItem);
    onItemSaved(newItem);
    showToast('Saved processed document image to your Desk.');
  };

  // --- 3. MEDIA INSPECTOR ---
  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMediaFile(file);
      setMediaAnalysis(null);
      setMediaError(null);
      setMediaType(file.type.startsWith('video/') ? 'video' : 'image');

      const reader = new FileReader();
      reader.onload = () => setMediaDataUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeMedia = async () => {
    if (!mediaDataUrl || !mediaFile || isAnalyzingMedia) return;
    setIsAnalyzingMedia(true);
    setMediaError(null);
    setMediaAnalysis(null);

    try {
      const base64Data = mediaDataUrl.split(',')[1];
      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data,
          mimeType: mediaFile.type,
          prompt: mediaPrompt || undefined,
          taskType: mediaType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.analysis) {
        setMediaAnalysis(data.analysis);
      } else {
        setMediaError(data.error || 'Analysis could not be completed.');
      }
    } catch (err: any) {
      setMediaError(err.message || 'Analysis unavailable offline.');
    } finally {
      setIsAnalyzingMedia(false);
    }
  };

  const handleSaveAnalysisToDesk = async () => {
    if (!mediaAnalysis) return;
    const newItem: WorkspaceItem = {
      id: generateId(),
      title: `${mediaType === 'video' ? 'Video Summary' : 'Visual Extraction'}: ${
        mediaFile?.name || 'Media'
      }`,
      type: 'note',
      content: mediaAnalysis,
      fileData: mediaDataUrl || undefined,
      mimeType: mediaFile?.type,
      source: 'Visual Inspector',
      tags: ['Extracted', mediaType === 'video' ? 'Video' : 'Visual'],
      collectionIds: [],
      detectedDates: extractLocalDates(mediaAnalysis),
      isImportant: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.items.add(newItem);
    onItemSaved(newItem);
    showToast('Saved extracted analysis to your Desk.');
  };

  // --- 4. VISUAL STUDIO ---
  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgPrompt.trim() || isGeneratingImg) return;

    setIsGeneratingImg(true);
    setImgError(null);
    setGeneratedImgUrl(null);

    try {
      const res = await fetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          imageSize: imgSize,
          aspectRatio: imgAspect,
        }),
      });

      const data = await res.json();
      if (res.ok && data.imageUrl) {
        setGeneratedImgUrl(data.imageUrl);
      } else {
        setImgError(data.error || 'Could not generate visual.');
      }
    } catch (err: any) {
      setImgError(err.message || 'Visual studio requires an active connection.');
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const handleSaveGeneratedImageToDesk = async () => {
    if (!generatedImgUrl) return;
    const newItem: WorkspaceItem = {
      id: generateId(),
      title: imgPrompt.slice(0, 44) || 'Workspace Visual',
      type: 'image',
      content: `Created in Visual Studio (${imgSize}, ${imgAspect}): ${imgPrompt}`,
      fileData: generatedImgUrl,
      mimeType: 'image/png',
      source: 'Visual Studio',
      tags: ['Visual', 'Studio'],
      collectionIds: [],
      detectedDates: [],
      isImportant: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.items.add(newItem);
    onItemSaved(newItem);
    showToast('Saved visual to your Desk.');
  };

  // --- 5. CALCULATOR COMPUTATIONS ---
  const daysDifference = (() => {
    const s = new Date(startDateStr).getTime();
    const e = new Date(endDateStr).getTime();
    if (isNaN(s) || isNaN(e)) return 0;
    return Math.round((e - s) / 86400000);
  })();

  const numUnitVal = parseFloat(unitValue) || 0;
  const numBill = parseFloat(billAmount) || 0;
  const numSplit = Math.max(1, parseInt(splitCount, 10) || 1);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Workspace Tools
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Fast utilities for text cleanup, pattern extraction, document scan enhancement, media inspection, and calculations
          </p>
        </div>
        {saveNotice && (
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs">
            <Check className="w-3.5 h-3.5" />
            <span>{saveNotice}</span>
          </div>
        )}
      </div>

      {/* Tool Selector Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto text-xs">
        {[
          { id: 'text-tools', label: 'Text & Pattern Extractor', icon: FileText },
          { id: 'doc-image-tools', label: 'Document & Scan Tools', icon: Sliders },
          { id: 'media-analyst', label: 'Photo & Video Inspector', icon: VideoIcon },
          { id: 'visual-studio', label: 'Visual Studio', icon: ImageIcon },
          { id: 'calculators', label: 'Date & Unit Calculators', icon: Calculator },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTool === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTool(tab.id as ActiveTool)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. TEXT & PATTERN EXTRACTOR */}
      {activeTool === 'text-tools' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Text Cleanup & Pattern Extractor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Count words, clean messy text, or extract emails, phone numbers, URLs, and dates locally
              </p>
            </div>
            {items.length > 0 && (
              <select
                onChange={(e) => {
                  const found = items.find((i) => i.id === e.target.value);
                  if (found) setRawText(found.content);
                }}
                defaultValue=""
                className="text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
              >
                <option value="" disabled>
                  Load text from desk item...
                </option>
                {items.slice(0, 15).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Metrics bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Words</span>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {wordCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Characters</span>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {charCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Sentences</span>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {sentenceCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Read Time</span>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {wordCount === 0 ? '0m' : `~${readingTimeMin}m`}
              </p>
            </div>
          </div>

          <textarea
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste or load text here to clean, format, or extract structured items..."
            className="w-full p-3.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          />

          {/* Formatting & Extraction Controls */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Format:</span>
              <button
                onClick={() => applyTextTransform('clean')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Remove Extra Spaces
              </button>
              <button
                onClick={() => applyTextTransform('sentence')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Sentence case
              </button>
              <button
                onClick={() => applyTextTransform('upper')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                UPPERCASE
              </button>
              <button
                onClick={() => applyTextTransform('lower')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                lowercase
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 mr-1">Extract:</span>
                <button
                  onClick={() => runPatternExtractor('dates')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                >
                  Extract Dates
                </button>
                <button
                  onClick={() => runPatternExtractor('emails')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                >
                  Extract Emails
                </button>
                <button
                  onClick={() => runPatternExtractor('phones')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                >
                  Extract Phone Numbers
                </button>
                <button
                  onClick={() => runPatternExtractor('urls')}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
                >
                  Extract URLs
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rawText);
                    setCopiedState(true);
                    setTimeout(() => setCopiedState(false), 2000);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedState ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedState ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleSaveTextAsNote}
                  disabled={!rawText.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save as Note</span>
                </button>
              </div>
            </div>
          </div>

          {extractedItems && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {extractedItems.label} ({extractedItems.values.length})
                </span>
                <button
                  onClick={() => setExtractedItems(null)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Clear
                </button>
              </div>
              {extractedItems.values.length === 0 ? (
                <p className="text-xs text-slate-500">No matches found in the text above.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {extractedItems.values.map((val, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200"
                    >
                      {val}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. DOCUMENT & IMAGE TOOLS */}
      {activeTool === 'doc-image-tools' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-5">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Document Scan Enhancer, Image Compressor & Resizer
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rotate, compress, resize, or apply high-contrast document scan enhancement locally in your browser
            </p>
          </div>

          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleToolImageUpload}
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 cursor-pointer"
            />
          </div>

          {toolImgDataUrl && (
            <div className="space-y-5">
              {/* Controls bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                <div className="space-y-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                    Orientation & Scan Filter
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const next = (rotationDeg + 90) % 360;
                        setRotationDeg(next);
                        renderCanvasAdjustments(
                          toolImgDataUrl,
                          next,
                          scanContrastMode,
                          qualityLevel,
                          scalePercent
                        );
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate 90°</span>
                    </button>
                    <button
                      onClick={() => {
                        const next = !scanContrastMode;
                        setScanContrastMode(next);
                        renderCanvasAdjustments(
                          toolImgDataUrl,
                          rotationDeg,
                          next,
                          qualityLevel,
                          scalePercent
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg border font-medium cursor-pointer ${
                        scanContrastMode
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {scanContrastMode ? 'B&W Scan: ON' : 'Enhance Scan'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Resize Scale
                    </span>
                    <span className="tabular-nums">{scalePercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={25}
                    max={100}
                    step={5}
                    value={scalePercent}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setScalePercent(val);
                      renderCanvasAdjustments(
                        toolImgDataUrl,
                        rotationDeg,
                        scanContrastMode,
                        qualityLevel,
                        val
                      );
                    }}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Compression Quality
                    </span>
                    <span className="tabular-nums">{Math.round(qualityLevel * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    value={qualityLevel}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setQualityLevel(val);
                      renderCanvasAdjustments(
                        toolImgDataUrl,
                        rotationDeg,
                        scanContrastMode,
                        val,
                        scalePercent
                      );
                    }}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 p-3 flex flex-col items-center space-y-2">
                <img
                  src={processedImgUrl || toolImgDataUrl}
                  alt="Processed preview"
                  className="max-h-80 w-auto object-contain rounded"
                />
                {processedSizeKb !== null && (
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    Output size: ~{processedSizeKb} KB
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <a
                  href={processedImgUrl || toolImgDataUrl}
                  download={`processed_${toolImgName}`}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Image</span>
                </a>
                <button
                  onClick={handleSaveProcessedImageToDesk}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save to Desk</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. PHOTO & VIDEO INSPECTOR (No technical model names exposed) */}
      {activeTool === 'media-analyst' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Photo & Video Inspector
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload a photo, whiteboard snapshot, receipt, or video clip to extract visible text, key events, and action items
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select Photo or Video
              </label>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleMediaUpload}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 cursor-pointer"
              />
            </div>

            {mediaDataUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 max-h-64 flex items-center justify-center">
                {mediaType === 'video' ? (
                  <video src={mediaDataUrl} controls className="max-h-64 w-auto" />
                ) : (
                  <img
                    src={mediaDataUrl}
                    alt="Preview"
                    className="max-h-64 w-auto object-contain"
                  />
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Specific Focus (Optional)
              </label>
              <input
                type="text"
                value={mediaPrompt}
                onChange={(e) => setMediaPrompt(e.target.value)}
                placeholder="e.g. Extract all receipt line items and total, or summarize timeline events..."
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <button
              onClick={handleAnalyzeMedia}
              disabled={!mediaDataUrl || isAnalyzingMedia}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isAnalyzingMedia ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Inspecting {mediaType}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Extract Insights from {mediaType === 'video' ? 'Video' : 'Photo'}</span>
                </>
              )}
            </button>

            {mediaError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-600 dark:text-rose-400">
                {mediaError}
              </div>
            )}

            {mediaAnalysis && (
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Extracted Report
                  </span>
                  <button
                    onClick={handleSaveAnalysisToDesk}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save to Desk</span>
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                  {mediaAnalysis}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. VISUAL STUDIO */}
      {activeTool === 'visual-studio' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Visual Studio
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create high-resolution diagrams, cover visuals, and illustrations for your projects and notes
            </p>
          </div>

          <form onSubmit={handleGenerateImage} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Visual Description
              </label>
              <textarea
                rows={3}
                required
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="e.g. Clean architectural diagram of a sustainable urban farming system on warm paper..."
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Resolution
                </label>
                <div className="flex items-center gap-2">
                  {(['1K', '2K', '4K'] as const).map((size) => (
                    <button
                      type="button"
                      key={size}
                      onClick={() => setImgSize(size)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                        imgSize === size
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Aspect Ratio
                </label>
                <select
                  value={imgAspect}
                  onChange={(e) => setImgAspect(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="1:1">1:1 (Square)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="4:3">4:3 (Standard)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isGeneratingImg}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isGeneratingImg ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating visual ({imgSize})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Visual</span>
                </>
              )}
            </button>
          </form>

          {imgError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-600 dark:text-rose-400">
              {imgError}
            </div>
          )}

          {generatedImgUrl && (
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Generated Visual ({imgSize} · {imgAspect})
                </span>
                <button
                  onClick={handleSaveGeneratedImageToDesk}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save to Desk</span>
                </button>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center p-2">
                <img
                  src={generatedImgUrl}
                  alt="Generated visual"
                  className="max-h-96 w-auto object-contain rounded"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. QUICK CALCULATORS & CONVERTERS */}
      {activeTool === 'calculators' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Difference & Countdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Date & Deadline Span
              </h3>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Target / End Date</label>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 text-center space-y-0.5">
                <span className="text-[11px] text-slate-500">Difference</span>
                <p className="text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                  {Math.abs(daysDifference)} day{Math.abs(daysDifference) === 1 ? '' : 's'}
                </p>
                <span className="text-[11px] text-slate-500">
                  (~{(Math.abs(daysDifference) / 7).toFixed(1)} weeks)
                </span>
              </div>
            </div>
          </div>

          {/* Unit Converter */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quick Converter
              </h3>
              <select
                value={unitCategory}
                onChange={(e) => setUnitCategory(e.target.value as any)}
                className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded"
              >
                <option value="data">Data Size</option>
                <option value="length">Length</option>
                <option value="weight">Weight</option>
              </select>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">
                  {unitCategory === 'data'
                    ? 'Value in MB'
                    : unitCategory === 'length'
                    ? 'Value in Meters'
                    : 'Value in Kilograms'}
                </label>
                <input
                  type="number"
                  value={unitValue}
                  onChange={(e) => setUnitValue(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg tabular-nums"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1.5 font-mono text-xs">
                {unitCategory === 'data' && (
                  <>
                    <div className="flex justify-between">
                      <span>KB:</span>
                      <strong>{(numUnitVal * 1024).toLocaleString()} KB</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>GB:</span>
                      <strong>{(numUnitVal / 1024).toFixed(3)} GB</strong>
                    </div>
                  </>
                )}
                {unitCategory === 'length' && (
                  <>
                    <div className="flex justify-between">
                      <span>Feet:</span>
                      <strong>{(numUnitVal * 3.28084).toFixed(2)} ft</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Kilometers:</span>
                      <strong>{(numUnitVal / 1000).toFixed(3)} km</strong>
                    </div>
                  </>
                )}
                {unitCategory === 'weight' && (
                  <>
                    <div className="flex justify-between">
                      <span>Pounds:</span>
                      <strong>{(numUnitVal * 2.20462).toFixed(2)} lbs</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Grams:</span>
                      <strong>{(numUnitVal * 1000).toLocaleString()} g</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Expense / Split Calculator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Expense & Split Calculator
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Total Amount</label>
                <input
                  type="number"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">People / Shares</label>
                <input
                  type="number"
                  min={1}
                  value={splitCount}
                  onChange={(e) => setSplitCount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg tabular-nums"
                />
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 text-center space-y-0.5">
                <span className="text-[11px] text-slate-500">Per Person</span>
                <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {(numBill / numSplit).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
