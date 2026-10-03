import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

dotenv.config();

const app = express();
const port = 3000;
const httpServer = createServer(app);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!apiKey,
  });
});

// Text-to-Speech endpoint (gemini-3.8-flash-tts)
app.post('/api/gemini/tts', async (req, res) => {
  try {
    const { text, voice = 'Kore', style } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required.' });
      return;
    }

    if (!apiKey) {
      res.status(503).json({ error: 'Speech service unavailable.' });
      return;
    }

    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const selectedVoice = validVoices.includes(voice) ? voice : 'Kore';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 4000),
              speechMetadata: {
                style: style || 'Calm, articulate, natural personal workspace reader',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const candidate = response.candidates?.[0];
    const audioPart = candidate?.content?.parts?.find((p) => p.inlineData?.data);

    if (audioPart && audioPart.inlineData?.data) {
      res.json({
        audioBase64: audioPart.inlineData.data,
        mimeType: audioPart.inlineData.mimeType || 'audio/wav',
      });
    } else {
      res.status(502).json({ error: 'No audio returned.' });
    }
  } catch (error: any) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message || 'Speech generation failed' });
  }
});

// High-Quality Visual Studio Image Generation (gemini-3-pro-image with 1K, 2K, 4K)
app.post('/api/gemini/generate-image', async (req, res) => {
  try {
    const { prompt, imageSize = '1K', aspectRatio = '1:1' } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    if (!apiKey) {
      res.status(503).json({ error: 'Visual synthesis service unavailable.' });
      return;
    }

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3-pro-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: (imageSize as any) || '1K',
          },
        },
      });
    } catch (err: any) {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: (imageSize as any) || '1K',
          },
        },
      });
    }

    const parts = response.candidates?.[0]?.content?.parts || [];
    let imageBase64: string | undefined;
    let textFeedback = '';

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data;
      } else if (part.text) {
        textFeedback += part.text;
      }
    }

    if (imageBase64) {
      res.json({
        imageUrl: `data:image/png;base64,${imageBase64}`,
        imageBase64,
        textFeedback,
        imageSize,
        aspectRatio,
      });
    } else {
      res.status(502).json({ error: 'Could not generate visual.', textFeedback });
    }
  } catch (error: any) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: error.message || 'Visual generation failed' });
  }
});

// Multi-turn LifeDesk Copilot endpoint (automatic routing between fast, general, and deep reasoning)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const {
      messages = [],
      mode = 'general', // 'fast' | 'general' | 'deep'
      systemInstruction,
      contextDocuments = [],
      attentionItems = [],
      collections = [],
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages are required.' });
      return;
    }

    if (!apiKey) {
      res.status(503).json({ error: 'Copilot offline.' });
      return;
    }

    const modelMap: Record<string, string> = {
      fast: 'gemini-3.1-flash-lite',
      general: 'gemini-3.5-flash',
      deep: 'gemini-3.1-pro-preview',
    };
    const selectedModel = modelMap[mode] || 'gemini-3.5-flash';

    let fullSystemInstruction =
      systemInstruction ||
      'You are LifeDesk Copilot, a built-in intelligence layer for a personal digital workspace. ' +
        'Never mention AI model names, tokens, or technical API details. ' +
        'Answer strictly based on the user\'s actual workspace items, collections, and attention queue when relevant. ' +
        'When referencing a user document, explicitly cite its exact title. Never invent documents or facts not in the user\'s desk.';

    if (contextDocuments.length > 0) {
      fullSystemInstruction +=
        `\n\n[USER'S ACTUAL DESK ITEMS (${contextDocuments.length})]:\n` +
        contextDocuments
          .map(
            (doc: any, i: number) =>
              `--- Item ${i + 1}: "${doc.title}" (Type: ${doc.type}, Tags: ${(doc.tags || []).join(', ') || 'none'}) ---\n${(doc.content || '').slice(0, 2000)}`
          )
          .join('\n\n');
    } else {
      fullSystemInstruction += `\n\n[USER'S DESK IS CURRENTLY EMPTY (0 items)]. Let the user know if they ask about their files.`;
    }

    if (attentionItems.length > 0) {
      fullSystemInstruction +=
        `\n\n[USER'S ATTENTION ITEMS]:\n` +
        attentionItems
          .map((a: any) => `- ${a.title} (Status: ${a.status}, Due: ${a.dueDate || 'none'}, Source: ${a.sourceItemTitle})`)
          .join('\n');
    }

    if (collections.length > 0) {
      fullSystemInstruction +=
        `\n\n[USER'S COLLECTIONS/TOPICS]: ${collections.map((c: any) => c.name).join(', ')}`;
    }

    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || '' }],
    }));

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: formattedContents,
      config: {
        systemInstruction: fullSystemInstruction,
      },
    });

    const reply = response.text || '';

    // Identify which of the user's documents were referenced in the reply
    const usedSources = contextDocuments
      .filter((doc: any) => doc.title && reply.toLowerCase().includes(doc.title.toLowerCase()))
      .map((doc: any) => ({ id: doc.id, title: doc.title, type: doc.type }));

    res.json({
      reply,
      sources: usedSources,
    });
  } catch (error: any) {
    console.error('Copilot chat error:', error);
    res.status(500).json({ error: error.message || 'Copilot request failed' });
  }
});

// Structured Copilot Action endpoint (Organize, Plan, Manage Tasks, Extract Insights)
app.post('/api/copilot/action', async (req, res) => {
  try {
    const { actionType, items = [], attentionItems = [], collections = [], targetItemId, customPrompt } = req.body;

    if (!apiKey) {
      res.status(503).json({ error: 'Copilot offline — using local workspace engine.' });
      return;
    }

    if (actionType === 'organize') {
      const itemSummaries = items.slice(0, 25).map((i: any) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        tags: i.tags,
        snippet: (i.content || '').slice(0, 400),
      }));

      const prompt = `You are LifeDesk Copilot. Inspect the user's actual desk items and propose a clean, conservative organization structure.
Existing Collections: ${collections.map((c: any) => c.name).join(', ') || 'None'}
User Items:
${JSON.stringify(itemSummaries, null, 2)}

Return valid JSON only:
{
  "summary": "Brief 1-2 sentence explanation of the proposed organization.",
  "proposedCollections": [
    {
      "name": "Category or Topic Name (e.g. College, Finance, Projects, Research)",
      "description": "Why this collection fits the user's items",
      "itemIds": ["id1", "id2"],
      "itemTitles": ["title1", "title2"],
      "suggestedTags": ["tag1", "tag2"]
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({ actionType: 'organize', data: parsed });
      return;
    }

    if (actionType === 'plan') {
      const contextSnippet = items
        .slice(0, 15)
        .map((i: any) => `- "${i.title}": ${(i.content || '').slice(0, 350)}`)
        .join('\n');

      const prompt = `You are LifeDesk Copilot. Create a concrete, structured project plan based on the user's request and their actual desk items.
User Goal / Context: ${customPrompt || 'Create an actionable plan from my current project and college documents.'}
User Desk Items:
${contextSnippet || 'No items yet.'}

Return valid JSON only:
{
  "projectTitle": "Clear Project Title",
  "summary": "1-2 sentence overview grounded in the user's context",
  "sourceTitles": ["exact titles of user items used, if any"],
  "steps": [
    {
      "title": "Concrete actionable task",
      "dueDate": "Suggested date or timeframe",
      "priority": "high|medium|low"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({ actionType: 'plan', data: parsed });
      return;
    }

    if (actionType === 'tasks') {
      const prompt = `You are LifeDesk Copilot. Review the user's current Attention Queue and unconfirmed document dates, and organize/prioritize them.
Current Attention Items:
${JSON.stringify(attentionItems.slice(0, 30), null, 2)}
Desk Items with Detected Dates:
${JSON.stringify(
  items
    .filter((i: any) => i.detectedDates && i.detectedDates.length > 0)
    .map((i: any) => ({ id: i.id, title: i.title, detectedDates: i.detectedDates })),
  null,
  2
)}

Return valid JSON only:
{
  "summary": "Concise assessment of what requires attention first.",
  "prioritizedTasks": [
    {
      "id": "existing attention item id or empty if new from detectedDate",
      "sourceItemId": "source item id",
      "sourceItemTitle": "source document title",
      "title": "Actionable title",
      "dueDate": "date string",
      "priority": "high|medium|low",
      "recommendation": "Why this matters now"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({ actionType: 'tasks', data: parsed });
      return;
    }

    if (actionType === 'analyze') {
      const target = targetItemId ? items.find((i: any) => i.id === targetItemId) : items[0];
      if (!target) {
        res.status(400).json({ error: 'No document available to analyze.' });
        return;
      }

      const prompt = `Analyze this user document thoroughly and grounded strictly in its actual content.
Document Title: "${target.title}"
Type: ${target.type}
Content:
"""
${(target.content || '').slice(0, 10000)}
"""

Return valid JSON only:
{
  "itemId": "${target.id}",
  "itemTitle": "${target.title}",
  "summary": "2-3 sentence clear summary of what this document is and why it matters.",
  "keyFacts": ["fact 1", "fact 2", "fact 3"],
  "topics": ["topic 1", "topic 2"],
  "detectedDeadlines": [
    { "label": "Deadline description", "date": "Date string", "confidence": "high|medium" }
  ],
  "suggestedCategory": "College|Finance|Projects|Research|Work|Personal|Documents"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({ actionType: 'analyze', data: parsed });
      return;
    }

    res.status(400).json({ error: 'Unknown Copilot action.' });
  } catch (error: any) {
    console.error('Copilot action error:', error);
    res.status(500).json({ error: error.message || 'Copilot action failed' });
  }
});

// Image & Video Understanding endpoint (gemini-3.1-pro-preview)
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { base64Data, mimeType, prompt, taskType } = req.body;
    if (!base64Data || !mimeType) {
      res.status(400).json({ error: 'Media data is required.' });
      return;
    }

    if (!apiKey) {
      res.status(503).json({ error: 'Visual analysis service unavailable offline.' });
      return;
    }

    const defaultPrompt =
      taskType === 'video'
        ? 'Analyze this video thoroughly. Provide: 1) Executive Summary, 2) Key Timeline Events & timestamps, 3) Action items or deadlines mentioned, 4) Notable visual details or text shown.'
        : 'Extract all visible text accurately and analyze this image. Provide: 1) Extracted Text (OCR), 2) Summary of key information, 3) Any dates, deadlines, or amounts detected, 4) Suggested category and tags.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt || defaultPrompt,
          },
        ],
      },
    });

    const analysis = response.text || '';
    res.json({
      analysis,
    });
  } catch (error: any) {
    console.error('Media analysis error:', error);
    res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

// Smart Universal Import Document Pipeline endpoint
app.post('/api/gemini/analyze-document', async (req, res) => {
  try {
    const { text, title, documentType, base64Data, mimeType } = req.body;

    if (!apiKey) {
      res.status(503).json({ error: 'Offline mode' });
      return;
    }

    const parts: any[] = [];
    if (base64Data && mimeType && (mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType,
        },
      });
    }

    const prompt = `Inspect this imported file for the user's personal LifeDesk.
Title / Filename: "${title || 'Untitled'}"
Type: ${documentType || mimeType || 'document'}
${text ? `Extracted Text:\n"""\n${text.slice(0, 12000)}\n"""` : 'Extract all visible text from the attached file and analyze it.'}

Respond in valid JSON only:
{
  "extractedText": "Full extracted text from the image or document if not already provided, or cleaned text",
  "summary": "1-2 sentence clear summary of the document",
  "topics": ["specific subject or acronym like CIA, DTIL, Experiment 3, Tax, etc."],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "suggestedCategory": "One of: College, Projects, Finance, Research, Work, Travel, Personal, Documents (or null if uncertain)",
  "possibleDeadlines": [
    { "label": "What is due or happening", "date": "Exact date string from document", "confidence": "high|medium" }
  ],
  "suggestedActions": [
    { "title": "Concrete action item from document", "urgency": "high|medium|low" }
  ]
}`;

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (error: any) {
    console.error('Smart pipeline analysis error:', error);
    res.status(500).json({ error: error.message || 'Document analysis failed' });
  }
});

// Live Voice WebSocket (gemini-3.8-live)
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', async (clientWs: WebSocket) => {
  if (!apiKey) {
    clientWs.send(JSON.stringify({ error: 'Voice service is unavailable offline.' }));
    clientWs.close();
    return;
  }

  let session: any = null;

  try {
    session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
        systemInstruction:
          'You are LifeDesk Voice, a calm, articulate personal workspace companion. ' +
          'Never mention AI model names or technical details. Speak naturally and concisely to help the user think, organize, and act on their information.',
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
            clientWs.send(JSON.stringify({ audio }));
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ status: 'closed' }));
          }
        },
      },
    });

    clientWs.send(JSON.stringify({ status: 'connected' }));

    clientWs.on('message', (data: any) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.audio && session) {
          session.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } catch (err) {
        console.error('Error processing voice message:', err);
      }
    });

    clientWs.on('close', () => {
      if (session?.close) {
        try {
          session.close();
        } catch {
          // ignore
        }
      }
    });
  } catch (error: any) {
    clientWs.send(JSON.stringify({ error: error.message || 'Could not start live voice session' }));
    clientWs.close();
  }
});

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`LifeDesk server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
