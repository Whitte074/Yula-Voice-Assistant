import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import {
  GoogleGenAI,
  FunctionDeclaration,
  LiveServerMessage,
  Modality,
  Type,
} from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Tool declarations for YULA (J.A.R.V.I.S.-style system, tactical & context memory control)
const yulaFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: "controlEnvironment",
    description:
      "Adjust or toggle smart workspace/home systems in the YULA tactical interface (lighting, climate, security, focus_shield, acoustics, power_core).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        systemId: {
          type: Type.STRING,
          description:
            "System identifier: 'lighting', 'climate', 'security', 'focus_shield', 'acoustics', or 'power_core'.",
        },
        active: {
          type: Type.BOOLEAN,
          description:
            "Whether the system should be turned on (true) or off (false).",
        },
        value: {
          type: Type.NUMBER,
          description:
            "Numeric target value (e.g., brightness 0-100, temperature 16-28, shield power 0-100, volume 0-100).",
        },
        modeLabel: {
          type: Type.STRING,
          description:
            "Descriptive mode label in Russian (e.g., 'Тактический циан', 'Глубокий фокус', 'Периметр защищён').",
        },
      },
      required: ["systemId"],
    },
  },
  {
    name: "manageTasks",
    description:
      "Add, complete, or clear tactical tasks and directives on the user's HUD.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            "Action to perform: 'add', 'complete', or 'clear_completed'.",
        },
        title: {
          type: Type.STRING,
          description: "Task title or directive description in Russian.",
        },
        priority: {
          type: Type.STRING,
          description: "Priority level: 'high', 'normal', or 'low'.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "setTimer",
    description: "Set or cancel a countdown timer on the YULA tactical HUD.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        durationSeconds: {
          type: Type.NUMBER,
          description: "Duration of the timer in seconds (set to 0 to cancel).",
        },
        label: {
          type: Type.STRING,
          description:
            "Label for the timer in Russian (e.g., 'Синхронизация реактора', 'Перерыв').",
        },
      },
      required: ["durationSeconds", "label"],
    },
  },
  {
    name: "executeProtocol",
    description:
      "Activate a comprehensive J.A.R.V.I.S.-style multi-system protocol on the HUD.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        protocolId: {
          type: Type.STRING,
          description:
            "Protocol identifier: 'morning_briefing' (Утренний брифинг), 'deep_work' (Протокол Гиперфокус), 'fortress' (Протокол Цитадель), 'night_watch' (Ночной дозор), or 'context_recap' (Сводка контекста беседы).",
        },
      },
      required: ["protocolId"],
    },
  },
  {
    name: "saveMemoryNote",
    description:
      "Save or update an important fact from the conversation (user name, project, preference, decision, or topic) into YULA's persistent context memory bank.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description:
            "Category in Russian (e.g., 'Контекст диалога', 'Предпочтение', 'Проект', 'Директива').",
        },
        content: {
          type: Type.STRING,
          description: "The concise fact or context summary in Russian.",
        },
      },
      required: ["category", "content"],
    },
  },
];

function buildSystemInstruction(
  userTitle = "Сэр",
  tone = "formal",
  voiceName = "Kore",
  memoriesList: Array<{ category: string; content: string }> = [],
  recentContextSummary = ""
) {
  const isMaleVoice = ["Charon", "Fenrir", "Puck"].includes(voiceName);
  const genderInstruction = isMaleVoice
    ? "Твой текущий голосовой модуль — мужской (тембр " +
      voiceName +
      "). В русском языке используй мужской род при самоописании («я выполнил», «готов к работе», «проанализировал»)."
    : "Твой текущий голосовой модуль — женский (тембр " +
      voiceName +
      "). В русском языке используй женский род при самоописании («я выполнила», «готова к работе», «проанализировала»).";

  const toneInstruction =
    tone === "sarcastic"
      ? `Тональность общения: САРКАСТИЧНАЯ (интеллектуальная ирония в стиле диалогов J.A.R.V.I.S. и Тони Старка).
Используй остроумные, слегка язвительные, но элегантные замечания, тонкий британский юмор и иронию по поводу человеческих привычек или грандиозных планов оператора. При этом выполняй все команды безукоризненно и точно.`
      : tone === "friendly"
      ? `Тональность общения: ДРУЖЕЛЮБНАЯ (тёплый интеллектуальный напарник).
Общайся живо, тепло, с искренней поддержкой, эмпатией и позитивным настроем, как близкий друг и надёжный соратник по лаборатории.`
      : `Тональность общения: ФОРМАЛЬНАЯ (эталонный протокол J.A.R.V.I.S.).
Соблюдай безупречный аристократический и инженерный этикет, сдержанное достоинство, высокую точность формулировок и аналитическую ясность.`;

  const memoryBlock =
    memoriesList.length > 0
      ? `\nДолговременное досье памяти об операторе и прошлых решениях:\n` +
        memoriesList.map((m, i) => `${i + 1}. [${m.category}] ${m.content}`).join("\n")
      : "";

  const summaryBlock = recentContextSummary
    ? `\nКраткая сводка предыдущих реплик диалога:\n${recentContextSummary}`
    : "";

  return `Ты — YULA (Юла), высокоинтеллектуальный голосовой и тактический ИИ-ассистент нового поколения по образцу J.A.R.V.I.S.
Обращайся к пользователю: «${userTitle}» (или по имени, если оно сохранено в памяти контекста).
${genderInstruction}
${toneInstruction}
${memoryBlock}
${summaryBlock}

Ключевые правила поддержания контекста и работы:
1. МЕХАНИЗМ ПАМЯТИ И КОНТЕКСТА: Ты всегда помнишь предыдущие реплики пользователя и свои собственные ответы в рамках диалога. Когда это уместно, естественно ссылайся на то, что обсуждалось ранее (например: «Как мы обсуждали чуть раньше...», «Возвращаясь к вашему предыдущему вопросу...», «С учётом того, что до этого я установил(а) освещение на...»).
2. АВТОМАТИЧЕСКОЕ ЗАПОМИНАНИЕ: Если пользователь сообщает новое важное сведение о себе, своём проекте, планах, предпочтениях или принимает решение — вызови инструмент saveMemoryNote, чтобы сохранить этот факт в долговременный банк памяти.
3. ЕСТЕСТВЕННОСТЬ ДЛЯ ГОЛОСА: Язык общения — русский. Пиши ответы так, чтобы они идеально звучали при голосовом синтезе (2–4 ёмких предложения без громоздкой разметки со звёздочками).
4. УПРАВЛЕНИЕ СИСТЕМАМИ: При просьбе изменить системы ('lighting', 'climate', 'security', 'focus_shield', 'acoustics', 'power_core'), задачи, таймер или протоколы — обязательно вызывай соответствующий инструмент.`;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "nominal", assistant: "YULA" });
  });

  // 1. Command & Context-Aware Chat Endpoint
  app.post("/api/yula/command", async (req, res) => {
    try {
      const {
        prompt,
        history = [],
        memories = [],
        imageBase64,
        imageMimeType = "image/jpeg",
        userTitle = "Сэр",
        tone = "formal",
        voiceName = "Kore",
        enableSearch = true,
        currentSystemsState = {},
      } = req.body;

      if (!prompt && !imageBase64) {
        res.status(400).json({ error: "Пустой запрос к ядру YULA." });
        return;
      }

      const ai = getGenAI();

      // Build multi-turn conversation history (up to 20 turns) for strong context continuity
      const contents: any[] = [];
      const recentHistory = Array.isArray(history) ? history.slice(-20) : [];

      for (const item of recentHistory) {
        if (item.role && item.text) {
          contents.push({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.text }],
          });
        }
      }

      const currentParts: any[] = [];
      if (imageBase64) {
        currentParts.push({
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        });
      }

      const contextPrefix = `[Состояние узлов комплекса: ${JSON.stringify(
        currentSystemsState
      )}]\nТекущее сообщение оператора: ${
        prompt || "Проанализируй изображение с оптического сенсора."
      }`;
      currentParts.push({ text: contextPrefix });

      contents.push({
        role: "user",
        parts: currentParts,
      });

      const tools: any[] = [{ functionDeclarations: yulaFunctionDeclarations }];
      if (enableSearch) {
        tools.push({ googleSearch: {} });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction: buildSystemInstruction(
            userTitle,
            tone,
            voiceName,
            memories
          ),
          tools,
          toolConfig: enableSearch
            ? { includeServerSideToolInvocations: true }
            : undefined,
        },
      });

      const functionCalls = response.functionCalls || [];
      let replyText = response.text || "";

      // Extract search grounding citations if any
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = groundingChunks
        .filter((c: any) => c.web?.uri)
        .map((c: any) => ({
          title: c.web.title || c.web.uri,
          uri: c.web.uri,
        }));

      if (!replyText.trim() && functionCalls.length > 0) {
        const names = functionCalls.map((fc) => fc.name).join(", ");
        replyText =
          tone === "sarcastic"
            ? `Готово, ${userTitle}. Выполнил директиву (${names}) быстрее, чем вы успели моргнуть.`
            : tone === "friendly"
            ? `Всё сделала, ${userTitle}! Настройки (${names}) уже обновлены.`
            : `Выполнено, ${userTitle}. Директива (${names}) синхронизирована с центральным ядром YULA.`;
      }

      // Compute a concise context link note if history was used
      const userTurns = recentHistory.filter((h: any) => h.role === "user");
      const lastUserTurn =
        userTurns.length > 0 ? userTurns[userTurns.length - 1].text : null;
      const contextReference = lastUserTurn
        ? `Связь с контекстом (${recentHistory.length} реплик): учтена предыдущая тема «${String(
            lastUserTurn
          ).slice(0, 55)}${String(lastUserTurn).length > 55 ? "…" : ""}»`
        : memories.length > 0
        ? `Опора на банк памяти (${memories.length} записей досье)`
        : undefined;

      res.json({
        text: replyText,
        functionCalls,
        sources,
        contextReference,
      });
    } catch (error: any) {
      console.error("YULA Command Error:", error);
      res.status(500).json({
        error:
          error?.message ||
          "Сбой связи с нейронным ядром. Проверьте конфигурацию ключа API.",
      });
    }
  });

  // 2. High-efficiency Gemini TTS Endpoint with Tone Style & Voice Selection
  app.post("/api/yula/tts", async (req, res) => {
    try {
      const { text, voiceName = "Kore", tone = "formal" } = req.body;
      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Текст для синтеза речи не передан." });
        return;
      }

      const cleanText = text
        .replace(/[*#_`~>]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim()
        .slice(0, 1200);

      if (!cleanText) {
        res.status(400).json({ error: "Пустой текст после очистки." });
        return;
      }

      const stylePrompt =
        tone === "sarcastic"
          ? "Witty, dry sarcastic British humor, clever and expressive"
          : tone === "friendly"
          ? "Warm, friendly, cheerful, supportive conversational partner"
          : "Calm, composed, articulate tactical AI assistant like JARVIS";

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: cleanText,
                // @ts-ignore - supported by Gemini 3.8 TTS
                speechMetadata: {
                  style: stylePrompt,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: ["Kore", "Zephyr", "Puck", "Charon", "Fenrir"].includes(
                  voiceName
                )
                  ? voiceName
                  : "Kore",
              },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res
          .status(500)
          .json({ error: "Модуль синтеза речи не вернул аудиоданные." });
        return;
      }

      res.json({ audioWavBase64: base64Audio });
    } catch (error: any) {
      console.error("YULA TTS Error:", error);
      res.status(500).json({
        error: error?.message || "Ошибка синтеза голоса YULA.",
      });
    }
  });

  // 3. Audio Transcription Endpoint
  app.post("/api/yula/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType = "audio/webm" } = req.body;
      if (!audioBase64) {
        res.status(400).json({ error: "Аудиоданные отсутствуют." });
        return;
      }

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: "Точно расшифруй эту голосовую команду на русском или английском языке. Верни только распознанный текст без кавычек и комментариев.",
            },
          ],
        },
      });

      res.json({ text: (response.text || "").trim() });
    } catch (error: any) {
      console.error("YULA Transcribe Error:", error);
      res.status(500).json({
        error: error?.message || "Ошибка распознавания аудиопотока.",
      });
    }
  });

  // 4. WebSocket Server for Real-Time Gemini Live API (/live) with Context Continuity
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`
    ).pathname;

    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (clientWs: WebSocket, request) => {
    const url = new URL(
      request.url || "/live",
      `http://${request.headers.host || "localhost"}`
    );
    const voiceName = url.searchParams.get("voice") || "Kore";
    const userTitle = url.searchParams.get("title") || "Сэр";
    const tone = url.searchParams.get("tone") || "formal";
    const recentSummary = url.searchParams.get("context") || "";

    let sessionPromise: Promise<any> | null = null;
    let isClosed = false;

    try {
      const ai = getGenAI();
      sessionPromise = ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: ["Kore", "Zephyr", "Puck", "Charon", "Fenrir"].includes(
                  voiceName
                )
                  ? voiceName
                  : "Kore",
              },
            },
          },
          systemInstruction: buildSystemInstruction(
            userTitle,
            tone,
            voiceName,
            [],
            recentSummary
          ),
          tools: [{ functionDeclarations: yulaFunctionDeclarations }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({ type: "status", status: "connected" })
              );
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;

            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: "audio",
                    audio: part.inlineData.data,
                  })
                );
              }
            }

            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            const inputTranscript =
              (message.serverContent as any)?.inputTranscription?.text;
            if (inputTranscript) {
              clientWs.send(
                JSON.stringify({
                  type: "input_transcript",
                  text: inputTranscript,
                })
              );
            }

            const outputTranscript =
              (message.serverContent as any)?.outputTranscription?.text;
            if (outputTranscript) {
              clientWs.send(
                JSON.stringify({
                  type: "output_transcript",
                  text: outputTranscript,
                })
              );
            }

            if (message.toolCall?.functionCalls?.length) {
              const calls = message.toolCall.functionCalls;
              clientWs.send(
                JSON.stringify({
                  type: "tool_calls",
                  functionCalls: calls,
                })
              );

              if (sessionPromise) {
                sessionPromise
                  .then((session) => {
                    session.sendToolResponse({
                      functionResponses: calls.map((fc: any) => ({
                        id: fc.id,
                        name: fc.name,
                        response: {
                          result:
                            "Директива синхронизирована с интерфейсом и контекстом YULA.",
                        },
                      })),
                    });
                  })
                  .catch((err) => {
                    console.error("Failed to send tool response to Live API:", err);
                  });
              }
            }
          },
          onerror: (err: any) => {
            console.error("Gemini Live session error:", err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message: err?.message || "Ошибка нейро-канала Live API.",
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "status", status: "closed" }));
            }
          },
        },
      });
    } catch (err: any) {
      console.error("Failed to initialize Gemini Live session:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: err?.message || "Не удалось открыть Live-сессию.",
          })
        );
      }
    }

    clientWs.on("message", (raw) => {
      if (isClosed || !sessionPromise) return;
      try {
        const msg = JSON.parse(raw.toString());
        sessionPromise
          .then((session) => {
            if (msg.audio) {
              session.sendRealtimeInput({
                audio: {
                  data: msg.audio,
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            } else if (msg.video) {
              session.sendRealtimeInput({
                video: {
                  data: msg.video,
                  mimeType: "image/jpeg",
                },
              });
            } else if (msg.text) {
              session.sendRealtimeInput({
                text: msg.text,
              });
            }
          })
          .catch((e) => {
            console.error("Error forwarding realtime input:", e);
          });
      } catch (err) {
        console.error("Failed to parse client WS message:", err);
      }
    });

    clientWs.on("close", () => {
      isClosed = true;
      if (sessionPromise) {
        sessionPromise
          .then((session) => session.close())
          .catch(() => {});
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`YULA Tactical Core Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
