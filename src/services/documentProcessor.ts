import {
  db,
  extractLocalDates,
  extractKeywordsAndTopics,
  WorkspaceItem,
} from '../db';

export type PipelineStep =
  | 'validating'
  | 'extracting'
  | 'understanding'
  | 'dates'
  | 'relationships'
  | 'completed';

export interface PipelineProgress {
  step: PipelineStep;
  label: string;
}

export interface ProcessedDocumentResult {
  title: string;
  type: 'document' | 'image' | 'note' | 'voice' | 'link' | 'video';
  content: string;
  summary: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileData?: string;
  detectedDates: Array<{
    label: string;
    date: string;
    confidence: 'high' | 'medium' | 'low';
    confirmed?: boolean;
  }>;
  suggestedTags: string[];
  topics: string[];
  suggestedCollection: string | null;
  matchedExistingCollectionId: string | null;
  matchedExistingCollectionName: string | null;
  relatedItems: Array<{ id: string; title: string; commonKeywords: string[] }>;
  extractionWarning?: string;
  sha256?: string;
  dimensions?: { width: number; height: number };
}

export async function runSmartFilePipeline(
  file: File,
  onProgress?: (progress: PipelineProgress) => void
): Promise<ProcessedDocumentResult> {
  // 1. VALIDATE
  onProgress?.({ step: 'validating', label: 'Validating file...' });
  const mimeType = file.type || guessMimeType(file.name);
  const fileName = file.name;
  const fileSize = file.size;

  let docType: WorkspaceItem['type'] = 'document';
  if (mimeType.startsWith('image/')) docType = 'image';
  else if (mimeType.startsWith('audio/')) docType = 'voice';
  else if (mimeType.startsWith('video/')) docType = 'video';
  else docType = 'document';

  const fileData = await readFileAsDataURL(file);
  const sha256 = await computeFileHash(file);
  const dimensions = docType === 'image' ? await getImageDimensions(fileData) : undefined;

  // 2. EXTRACT
  onProgress?.({ step: 'extracting', label: 'Extracting text...' });
  let extractedContent = '';
  let extractionWarning: string | undefined;

  if (
    mimeType.startsWith('text/') ||
    /\.(txt|md|json|csv|log|xml|html|yml|yaml|ts|js|py)$/i.test(fileName)
  ) {
    try {
      extractedContent = await readFileAsText(file);
    } catch {
      extractionWarning = "Text extraction couldn't be completed.";
    }
  } else if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    extractedContent = await extractTextFromPdfBuffer(file);
  }

  // 3. UNDERSTAND DOCUMENT (Local + Smart Analysis when available)
  onProgress?.({ step: 'understanding', label: 'Understanding document...' });

  let smartSummary = '';
  let smartTopics: string[] = [];
  let smartKeywords: string[] = [];
  let smartCategory: string | null = null;
  let smartDeadlines: Array<{ label: string; date: string; confidence: 'high' | 'medium' | 'low' }> = [];

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const base64Raw = fileData.includes(',') ? fileData.split(',')[1] : undefined;
      const sendInlineBinary =
        (docType === 'image' || mimeType === 'application/pdf') &&
        fileSize < 12 * 1024 * 1024 &&
        (!extractedContent || extractedContent.length < 150);

      const res = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fileName,
          documentType: docType,
          text: extractedContent,
          base64Data: sendInlineBinary ? base64Raw : undefined,
          mimeType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.extractedText && (!extractedContent || extractedContent.length < 60)) {
          extractedContent = data.extractedText;
        }
        if (data.summary) smartSummary = data.summary;
        if (Array.isArray(data.topics)) smartTopics = data.topics;
        if (Array.isArray(data.keywords)) smartKeywords = data.keywords;
        if (data.suggestedCategory && data.suggestedCategory !== 'null') {
          smartCategory = data.suggestedCategory;
        }
        if (Array.isArray(data.possibleDeadlines)) {
          smartDeadlines = data.possibleDeadlines.map((d: any) => ({
            label: d.label || 'Possible deadline',
            date: d.date || '',
            confidence: d.confidence === 'high' ? 'high' : 'medium',
          })).filter((d: any) => d.date);
        }
      }
    } catch {
      // Continue with local extraction seamlessly
    }
  }

  if (!extractedContent || extractedContent.trim().length === 0) {
    if (docType === 'image' || mimeType === 'application/pdf') {
      extractionWarning = "Text extraction couldn't be completed — original file saved.";
    }
    extractedContent = smartSummary || `${fileName} (${formatBytes(fileSize)})`;
  }

  // 4. FIND DATES & KEYWORDS LOCALLY
  onProgress?.({ step: 'dates', label: 'Finding dates...' });
  const localDates = extractLocalDates(`${fileName}\n${extractedContent}`);
  const mergedDates = [...smartDeadlines];
  for (const ld of localDates) {
    if (!mergedDates.some((m) => m.date.toLowerCase() === ld.date.toLowerCase())) {
      mergedDates.push(ld);
    }
  }

  const localAnalysis = extractKeywordsAndTopics(
    fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
    extractedContent,
    fileName
  );

  const finalTopics = Array.from(new Set([...smartTopics, ...localAnalysis.topics])).slice(0, 5);
  const finalKeywords = Array.from(new Set([...smartKeywords, ...localAnalysis.keywords])).slice(0, 6);
  const finalCategory = smartCategory || localAnalysis.suggestedCategory;

  const suggestedTags = Array.from(
    new Set([
      ...(finalCategory ? [finalCategory] : []),
      ...finalTopics.slice(0, 3),
    ])
  ).slice(0, 5);

  // 5. CHECK RELATED ITEMS & EXISTING COLLECTIONS
  onProgress?.({ step: 'relationships', label: 'Checking related items...' });
  const existingCollections = await db.collections.toArray();
  let matchedExistingCollectionId: string | null = null;
  let matchedExistingCollectionName: string | null = null;

  if (finalCategory) {
    const found = existingCollections.find(
      (c) => c.name.toLowerCase() === finalCategory.toLowerCase()
    );
    if (found) {
      matchedExistingCollectionId = found.id;
      matchedExistingCollectionName = found.name;
    }
  }

  // Also check if any topic matches an existing collection name (e.g., "DTIL", "CIA")
  if (!matchedExistingCollectionId) {
    for (const tp of finalTopics) {
      const found = existingCollections.find((c) => c.name.toLowerCase() === tp.toLowerCase());
      if (found) {
        matchedExistingCollectionId = found.id;
        matchedExistingCollectionName = found.name;
        break;
      }
    }
  }

  // Check related items on desk
  const allItems = await db.items.toArray();
  const relatedItems: Array<{ id: string; title: string; commonKeywords: string[] }> = [];
  const signalSet = new Set(
    [...finalTopics, ...finalKeywords, ...suggestedTags].map((s) => s.toLowerCase())
  );

  for (const other of allItems) {
    const otherSignals = [
      ...other.tags,
      ...(other.topics || []),
      ...other.title.split(/\s+/),
    ]
      .map((s) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
      .filter((s) => s.length >= 3);

    const common = Array.from(new Set(otherSignals.filter((s) => signalSet.has(s))));
    if (common.length >= 1) {
      relatedItems.push({
        id: other.id,
        title: other.title,
        commonKeywords: common.slice(0, 3),
      });
    }
  }

  const cleanTitle = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  onProgress?.({ step: 'completed', label: 'Complete' });

  return {
    title: cleanTitle ? cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) : fileName,
    type: docType,
    content: extractedContent,
    summary: smartSummary || extractedContent.slice(0, 220),
    fileName,
    fileSize,
    mimeType,
    fileData,
    detectedDates: mergedDates,
    suggestedTags,
    topics: finalTopics,
    suggestedCollection: finalCategory,
    matchedExistingCollectionId,
    matchedExistingCollectionName,
    relatedItems: relatedItems.slice(0, 4),
    extractionWarning,
    sha256,
    dimensions,
  };
}

export async function processLocalFile(file: File): Promise<ProcessedDocumentResult> {
  return runSmartFilePipeline(file);
}

async function extractTextFromPdfBuffer(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const textDecoder = new TextDecoder('latin1');
    const rawString = textDecoder.decode(arrayBuffer);

    const chunks: string[] = [];
    // Extract literal strings inside parentheses in PDF text objects
    const btEtRegex = /BT[\s\S]*?ET/g;
    const textBlocks = rawString.match(btEtRegex) || [];

    for (const block of textBlocks) {
      const strMatches = block.match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
      if (strMatches) {
        for (const sm of strMatches) {
          const inner = sm
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, ' ')
            .replace(/\\t/g, ' ')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
          // Keep printable ASCII characters
          if (/^[\x20-\x7E\s]+$/.test(inner) && inner.trim().length > 1) {
            chunks.push(inner.trim());
          }
        }
      }
    }

    const joined = chunks.join(' ').replace(/\s+/g, ' ').trim();
    return joined.slice(0, 15000);
  } catch {
    return '';
  }
}

export async function computeFileHash(file: File): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // ignore
  }
  return '';
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
