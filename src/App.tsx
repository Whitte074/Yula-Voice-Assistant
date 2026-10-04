import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  Send,
  Camera,
  Upload,
  Check,
  Plus,
  Trash2,
  Play,
  Square,
  RefreshCw,
  Sliders,
  Eye,
  ExternalLink,
  Bookmark,
  RotateCcw,
} from "lucide-react";
import {
  ActiveTimer,
  ChatMessage,
  CommunicationTone,
  INITIAL_SYSTEMS,
  MemoryNote,
  SystemModule,
  TONE_OPTIONS,
  TacticalTask,
  VOICE_PROFILES,
  VoiceName,
  YULA_PROTOCOLS,
  YulaState,
} from "./types/yula";
import { float32ToPcm16Base64, soundEngine } from "./utils/audioEngine";
import { YulaOrbCanvas } from "./components/YulaOrbCanvas";
import { RadarCalibrationChart } from "./components/RadarCalibrationChart";

type WorkspaceTab = "all" | "persona" | "systems" | "protocols" | "memory";

const STORAGE_KEYS = {
  MESSAGES: "yula_chat_history_v2",
  MEMORIES: "yula_memories_v2",
  PREFS: "yula_persona_prefs_v2",
};

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    id: "welcome-msg",
    role: "assistant",
    text: "Добро пожаловать, Сэр. Все подсистемы комплекса YULA находятся в штатном режиме. Контекстная память диалога активна — я помню все наши предыдущие решения и готова поддерживать связную беседу.",
    timestamp: new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    contextReference: "Инициализация непрерывного контекстного буфера YULA",
  },
];

const DEFAULT_MEMORIES: MemoryNote[] = [
  {
    id: "mem-1",
    category: "Предпочтение",
    content:
      "Оператор предпочитает сбалансированное освещение 75% и температуру 21.5°C при работе над ключевыми проектами.",
    timestamp: "Базовое досье",
    pinned: true,
  },
  {
    id: "mem-2",
    category: "Контекст диалога",
    content:
      "Активен проект разработки и калибровки персонального голосового ИИ-ассистента YULA в стиле J.A.R.V.I.S.",
    timestamp: "Базовое досье",
    pinned: true,
  },
];

export default function App() {
  // Load saved preferences from localStorage
  const savedPrefs = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PREFS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  // Assistant State & Individuality Settings
  const [yulaState, setYulaState] = useState<YulaState>("idle");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("all");
  const [voiceName, setVoiceName] = useState<VoiceName>(
    savedPrefs?.voiceName || "Kore"
  );
  const [tone, setTone] = useState<CommunicationTone>(
    savedPrefs?.tone || "formal"
  );
  const [userTitle, setUserTitle] = useState<string>(
    savedPrefs?.userTitle || "Сэр"
  );
  const [autoSpeak, setAutoSpeak] = useState<boolean>(
    savedPrefs?.autoSpeak ?? true
  );
  const [enableSearch, setEnableSearch] = useState<boolean>(true);
  const [showPersonaDrawer, setShowPersonaDrawer] = useState<boolean>(false);

  // Environment Systems, Tasks, Timers & Persistent Context Memory
  const [systems, setSystems] = useState<SystemModule[]>(INITIAL_SYSTEMS);
  const [activeProtocolTitle, setActiveProtocolTitle] = useState<string | null>(
    null
  );
  const [tasks, setTasks] = useState<TacticalTask[]>([
    {
      id: "tsk-1",
      title: "Калибровка голосовых тембров и тональности YULA",
      priority: "high",
      completed: true,
      createdAt: "09:00",
    },
    {
      id: "tsk-2",
      title: "Проверка долговременного буфера контекста диалога",
      priority: "high",
      completed: false,
      createdAt: "10:15",
    },
    {
      id: "tsk-3",
      title: "Тестирование управления инженерными узлами голосом",
      priority: "normal",
      completed: false,
      createdAt: "10:30",
    },
  ]);

  const [memories, setMemories] = useState<MemoryNote[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MEMORIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_MEMORIES;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_MESSAGES;
  });

  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [inputText, setInputText] = useState<string>("");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [micEnergy, setMicEnergy] = useState<number>(0);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Manual inputs for Tasks & Context Memory
  const [newTaskTitle, setNewTaskTitle] = useState<string>("");
  const [newMemoryCategory, setNewMemoryCategory] =
    useState<string>("Контекст диалога");
  const [newMemoryText, setNewMemoryText] = useState<string>("");

  // Optical Visor (Camera & Image upload)
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live API WebSocket & Audio Capture Refs
  const liveWsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveVideoIntervalRef = useRef<number | null>(null);

  // Push-to-Talk SpeechRecognition / MediaRecorder Refs
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Active voice profile metadata
  const currentVoiceProfile =
    VOICE_PROFILES.find((v) => v.id === voiceName) || VOICE_PROFILES[0];
  const currentToneOption =
    TONE_OPTIONS.find((t) => t.id === tone) || TONE_OPTIONS[0];

  // Persist messages, memories, and persona preferences
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.MESSAGES,
        JSON.stringify(messages.slice(-30))
      );
    } catch {
      // ignore storage quota errors
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
    } catch {
      // ignore
    }
  }, [memories]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.PREFS,
        JSON.stringify({ voiceName, tone, userTitle, autoSpeak })
      );
    } catch {
      // ignore
    }
  }, [voiceName, tone, userTitle, autoSpeak]);

  // Clock for top telemetry bar
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() =>
    new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setCurrentTimeStr(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Countdown Timer Effect
  useEffect(() => {
    if (!timer || !timer.running) return;
    const id = window.setInterval(() => {
      setTimer((prev) => {
        if (!prev || !prev.running) return prev;
        if (prev.remainingSeconds <= 1) {
          soundEngine.playHudCue("alert");
          return { ...prev, remainingSeconds: 0, running: false };
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timer]);

  // Execute tool calls returned by Gemini (both HTTP command and Live WebSocket)
  const executeYulaToolCalls = useCallback((functionCalls: any[]): string[] => {
    const executedLabels: string[] = [];

    for (const call of functionCalls) {
      const name = call.name;
      const args = call.args || {};

      if (name === "controlEnvironment") {
        const sysId = args.systemId;
        setSystems((prev) =>
          prev.map((s) => {
            if (s.id !== sysId) return s;
            const nextActive =
              typeof args.active === "boolean" ? args.active : true;
            const nextVal =
              typeof args.value === "number"
                ? Math.max(s.min, Math.min(s.max, args.value))
                : s.value;
            const nextLabel = args.modeLabel || s.modeLabel;
            return {
              ...s,
              active: nextActive,
              value: nextVal,
              modeLabel: nextLabel,
              status: nextActive ? "NOMINAL" : "STANDBY",
            };
          })
        );
        executedLabels.push(`Узел: ${sysId}`);
        soundEngine.playHudCue("confirm");
      } else if (name === "manageTasks") {
        if (args.action === "add" && args.title) {
          const newTask: TacticalTask = {
            id: `tsk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: String(args.title),
            priority:
              args.priority === "high" || args.priority === "low"
                ? args.priority
                : "normal",
            completed: false,
            createdAt: new Date().toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
          setTasks((prev) => [newTask, ...prev]);
          executedLabels.push(`Задача добавлена: ${args.title}`);
        } else if (args.action === "complete") {
          setTasks((prev) =>
            prev.map((t, idx) =>
              idx === 0 ||
              (args.title &&
                t.title.toLowerCase().includes(String(args.title).toLowerCase()))
                ? { ...t, completed: true }
                : t
            )
          );
          executedLabels.push("Задача отмечена выполненной");
        } else if (args.action === "clear_completed") {
          setTasks((prev) => prev.filter((t) => !t.completed));
          executedLabels.push("Очистка завершённых задач");
        }
        soundEngine.playHudCue("confirm");
      } else if (name === "setTimer") {
        const secs = Number(args.durationSeconds) || 0;
        if (secs <= 0) {
          setTimer(null);
          executedLabels.push("Таймер остановлен");
        } else {
          setTimer({
            id: `tmr-${Date.now()}`,
            label: String(args.label || "Тактический отсчёт"),
            totalSeconds: secs,
            remainingSeconds: secs,
            running: true,
          });
          executedLabels.push(`Таймер: ${args.label || secs + " сек"}`);
        }
        soundEngine.playHudCue("confirm");
      } else if (name === "executeProtocol") {
        const pid = String(args.protocolId);
        const found = YULA_PROTOCOLS.find((p) => p.id === pid);
        setActiveProtocolTitle(found ? found.title : pid);

        if (pid === "deep_work") {
          setSystems((prev) =>
            prev.map((s) => {
              if (s.id === "lighting")
                return {
                  ...s,
                  active: true,
                  value: 45,
                  modeLabel: "Глубокий фокус",
                };
              if (s.id === "focus_shield")
                return {
                  ...s,
                  active: true,
                  value: 55,
                  modeLabel: "Подавление шума активно",
                  status: "BOOST",
                };
              return s;
            })
          );
          setTimer({
            id: `tmr-${Date.now()}`,
            label: "Сессия Гиперфокуса",
            totalSeconds: 2700,
            remainingSeconds: 2700,
            running: true,
          });
        } else if (pid === "fortress") {
          setSystems((prev) =>
            prev.map((s) => {
              if (s.id === "security")
                return {
                  ...s,
                  active: true,
                  value: 100,
                  modeLabel: "Протокол Цитадель",
                  status: "BOOST",
                };
              if (s.id === "power_core")
                return {
                  ...s,
                  active: true,
                  value: 100,
                  modeLabel: "Полная мощность",
                  status: "BOOST",
                };
              return s;
            })
          );
        } else if (pid === "night_watch") {
          setSystems((prev) =>
            prev.map((s) => {
              if (s.id === "lighting")
                return {
                  ...s,
                  active: true,
                  value: 15,
                  modeLabel: "Ночное дежурство",
                };
              if (s.id === "climate")
                return {
                  ...s,
                  active: true,
                  value: 19.5,
                  modeLabel: "Ночной режим",
                };
              return s;
            })
          );
        }
        executedLabels.push(`Протокол: ${found ? found.title : pid}`);
        soundEngine.playHudCue("confirm");
      } else if (name === "saveMemoryNote") {
        const note: MemoryNote = {
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: String(args.category || "Контекст диалога"),
          content: String(args.content || ""),
          timestamp: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          pinned: true,
        };
        setMemories((prev) => [note, ...prev]);
        executedLabels.push(`Запомнено в контекст: ${note.category}`);
        soundEngine.playHudCue("confirm");
      }
    }

    return executedLabels;
  }, []);

  // Synthesize speech via /api/yula/tts with selected voice & tone
  const speakTextWithYula = useCallback(
    async (
      text: string,
      overrideVoice?: VoiceName,
      overrideTone?: CommunicationTone
    ) => {
      if (!text.trim()) return;
      const targetVoice = overrideVoice || voiceName;
      const targetTone = overrideTone || tone;
      const profile =
        VOICE_PROFILES.find((v) => v.id === targetVoice) || VOICE_PROFILES[0];

      try {
        setYulaState("speaking");
        const res = await fetch("/api/yula/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceName: targetVoice,
            tone: targetTone,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.audioWavBase64) {
          setYulaState("idle");
          return;
        }
        await soundEngine.playWavBase64(
          data.audioWavBase64,
          profile.detuneCents,
          () => setYulaState("speaking"),
          () => setYulaState((prev) => (prev === "live" ? "live" : "idle"))
        );
      } catch {
        setYulaState((prev) => (prev === "live" ? "live" : "idle"));
      }
    },
    [voiceName, tone]
  );

  // Capture current video frame if camera is active
  const captureFrameFromVideo = useCallback((): {
    base64: string;
    mimeType: string;
    previewUrl: string;
  } | null => {
    if (!cameraActive || !videoRef.current) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = Math.floor((video.videoHeight / video.videoWidth) * 640);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64 = dataUrl.split(",")[1];
    return { base64, mimeType: "image/jpeg", previewUrl: dataUrl };
  }, [cameraActive]);

  // Send command to YULA backend (/api/yula/command) with full conversation history & context memories
  const sendCommandToYula = useCallback(
    async (overridePrompt?: string) => {
      const promptToSend = (overridePrompt ?? inputText).trim();
      const visualAttachment = capturedImage || captureFrameFromVideo();

      if (!promptToSend && !visualAttachment) return;

      setErrorBanner(null);
      if (!overridePrompt) setInputText("");
      setLiveTranscript("");

      const nowStr = new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMsg: ChatMessage = {
        id: `usr-${Date.now()}`,
        role: "user",
        text: promptToSend || "Анализ кадра с оптического визора",
        timestamp: nowStr,
        imagePreview: visualAttachment?.previewUrl,
      };

      // Build context history including pinned messages + recent 18 messages
      const pinnedMsgs = messages.filter((m) => m.pinnedInContext);
      const recentMsgs = messages.slice(-18);
      const combinedHistoryMap = new Map<string, ChatMessage>();
      for (const m of [...pinnedMsgs, ...recentMsgs]) {
        combinedHistoryMap.set(m.id, m);
      }
      const contextHistoryPayload = Array.from(combinedHistoryMap.values()).map(
        (m) => ({
          role: m.role,
          text: m.text,
        })
      );

      setMessages((prev) => [...prev, userMsg]);
      setYulaState("thinking");

      try {
        const systemsSummary = systems.reduce((acc, s) => {
          acc[s.id] = {
            active: s.active,
            value: `${s.value}${s.unit}`,
            mode: s.modeLabel,
          };
          return acc;
        }, {} as Record<string, any>);

        const response = await fetch("/api/yula/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptToSend,
            history: contextHistoryPayload,
            memories: memories.map((m) => ({
              category: m.category,
              content: m.content,
            })),
            imageBase64: visualAttachment?.base64,
            imageMimeType: visualAttachment?.mimeType,
            userTitle,
            tone,
            voiceName,
            enableSearch,
            currentSystemsState: systemsSummary,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Ошибка связи с ядром YULA.");
        }

        let executedTools: string[] = [];
        if (data.functionCalls?.length) {
          executedTools = executeYulaToolCalls(data.functionCalls);
        }

        const assistantMsg: ChatMessage = {
          id: `ast-${Date.now()}`,
          role: "assistant",
          text: data.text,
          timestamp: new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          executedTools: executedTools.length > 0 ? executedTools : undefined,
          contextReference: data.contextReference,
          sources: data.sources?.length > 0 ? data.sources : undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setCapturedImage(null);

        if (autoSpeak && data.text) {
          await speakTextWithYula(data.text);
        } else {
          setYulaState("idle");
        }
      } catch (err: any) {
        setErrorBanner(err?.message || "Не удалось выполнить директиву.");
        setYulaState("idle");
      }
    },
    [
      inputText,
      capturedImage,
      captureFrameFromVideo,
      systems,
      messages,
      memories,
      userTitle,
      tone,
      voiceName,
      enableSearch,
      executeYulaToolCalls,
      autoSpeak,
      speakTextWithYula,
    ]
  );

  // Stop Live WebSocket Session
  const stopLiveSession = useCallback(() => {
    if (liveVideoIntervalRef.current) {
      clearInterval(liveVideoIntervalRef.current);
      liveVideoIntervalRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (liveWsRef.current) {
      liveWsRef.current.close();
      liveWsRef.current = null;
    }
    soundEngine.stopAllPlayback();
    soundEngine.playHudCue("deactivate");
    setMicEnergy(0);
    setLiveTranscript("");
    setYulaState("idle");
  }, []);

  // Start Full-Duplex Gemini Live Session (/live WebSocket) with Context Summary
  const startLiveSession = useCallback(async () => {
    try {
      setErrorBanner(null);
      soundEngine.stopAllPlayback();
      soundEngine.playHudCue("wake");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      // Summarize recent turns + memories for Live API context continuity
      const recentSnippet = messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? userTitle : "YULA"}: ${m.text}`)
        .join(" | ")
        .slice(0, 900);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({
        voice: voiceName,
        title: userTitle,
        tone,
        context: recentSnippet,
      });
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/live?${params.toString()}`
      );
      liveWsRef.current = ws;

      ws.onopen = () => {
        setYulaState("live");
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const inputCtx = new AudioCtx({ sampleRate: 16000 });
        inputAudioCtxRef.current = inputCtx;

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (
            !liveWsRef.current ||
            liveWsRef.current.readyState !== WebSocket.OPEN
          )
            return;
          const channelData = e.inputBuffer.getChannelData(0);
          let sumSq = 0;
          for (let i = 0; i < channelData.length; i++) {
            sumSq += channelData[i] * channelData[i];
          }
          const rms = Math.min(1, Math.sqrt(sumSq / channelData.length) * 6);
          setMicEnergy(rms);

          const pcmBase64 = float32ToPcm16Base64(channelData);
          liveWsRef.current.send(JSON.stringify({ audio: pcmBase64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);

        liveVideoIntervalRef.current = window.setInterval(() => {
          if (
            liveWsRef.current &&
            liveWsRef.current.readyState === WebSocket.OPEN &&
            videoRef.current &&
            videoRef.current.videoWidth > 0
          ) {
            const frame = captureFrameFromVideo();
            if (frame) {
              liveWsRef.current.send(JSON.stringify({ video: frame.base64 }));
            }
          }
        }, 1000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "audio" && msg.audio) {
            soundEngine.playLivePcmChunk(
              msg.audio,
              currentVoiceProfile.detuneCents
            );
          } else if (msg.type === "interrupted") {
            soundEngine.stopAllPlayback();
          } else if (msg.type === "input_transcript" && msg.text) {
            setLiveTranscript(msg.text);
          } else if (msg.type === "output_transcript" && msg.text) {
            setLiveTranscript(msg.text);
          } else if (msg.type === "tool_calls" && msg.functionCalls) {
            const executed = executeYulaToolCalls(msg.functionCalls);
            if (executed.length > 0) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `live-tool-${Date.now()}`,
                  role: "assistant",
                  text: "Голосовая директива выполнена в реальном времени и сохранена в контексте.",
                  timestamp: new Date().toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  executedTools: executed,
                },
              ]);
            }
          } else if (msg.type === "error") {
            setErrorBanner(msg.message || "Ошибка Live-сессии.");
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setErrorBanner("Потеряно соединение с голосовым потоком Live API.");
        stopLiveSession();
      };

      ws.onclose = () => {
        setYulaState((prev) => (prev === "live" ? "idle" : prev));
      };
    } catch (err: any) {
      setErrorBanner(
        err?.message ||
          "Доступ к микрофону отклонён. Разрешите использование микрофона в браузере."
      );
      setYulaState("idle");
    }
  }, [
    voiceName,
    userTitle,
    tone,
    messages,
    currentVoiceProfile.detuneCents,
    captureFrameFromVideo,
    executeYulaToolCalls,
    stopLiveSession,
  ]);

  // Push-to-Talk Single Voice Command
  const toggleSingleVoiceCommand = useCallback(async () => {
    if (yulaState === "live") {
      stopLiveSession();
      return;
    }

    if (yulaState === "listening") {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      setYulaState("idle");
      setMicEnergy(0);
      return;
    }

    soundEngine.stopAllPlayback();
    soundEngine.playHudCue("wake");
    setErrorBanner(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "ru-RU";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      let finalTranscript = "";

      recognition.onstart = () => {
        setYulaState("listening");
        setMicEnergy(0.45);
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }
        setLiveTranscript(finalTranscript || interim);
        setMicEnergy(0.35 + Math.random() * 0.45);
      };

      recognition.onerror = () => {
        setYulaState("idle");
        setMicEnergy(0);
      };

      recognition.onend = () => {
        setMicEnergy(0);
        if (finalTranscript.trim()) {
          sendCommandToYula(finalTranscript.trim());
        } else {
          setYulaState("idle");
        }
      };

      recognition.start();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setMicEnergy(0);
          const blob = new Blob(recordedChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64data = String(reader.result).split(",")[1];
            if (!base64data) {
              setYulaState("idle");
              return;
            }
            setYulaState("thinking");
            try {
              const res = await fetch("/api/yula/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  audioBase64: base64data,
                  mimeType: blob.type || "audio/webm",
                }),
              });
              const data = await res.json();
              if (data.text) {
                sendCommandToYula(data.text);
              } else {
                setYulaState("idle");
              }
            } catch {
              setYulaState("idle");
            }
          };
          reader.readAsDataURL(blob);
        };

        setYulaState("listening");
        setMicEnergy(0.5);
        setLiveTranscript("Говорите команду... (нажмите снова для отправки)");
        recorder.start();
      } catch {
        setErrorBanner("Микрофон недоступен. Проверьте разрешения браузера.");
        setYulaState("idle");
      }
    }
  }, [yulaState, stopLiveSession, sendCommandToYula]);

  // Optical Visor Camera Toggle
  const toggleCameraVisor = async () => {
    if (cameraActive) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      setCameraActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setErrorBanner("Оптический сенсор (камера) недоступен в браузере.");
    }
  };

  // Image File Upload for Visor
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1];
      setCapturedImage({
        base64,
        mimeType: file.type || "image/jpeg",
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const pinnedMessagesCount = messages.filter((m) => m.pinnedInContext).length;

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800/90 bg-[#07090E]/95 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("all");
          }}
          className="font-display text-xl font-bold tracking-[0.18em] text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          YULA
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            onClick={() => setActiveTab("all")}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeTab === "all"
                ? "text-slate-100 border-cyan-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Консоль ядра
          </button>
          <button
            onClick={() => setActiveTab("persona")}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeTab === "persona"
                ? "text-slate-100 border-cyan-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Голос и Характер
          </button>
          <button
            onClick={() => setActiveTab("systems")}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeTab === "systems"
                ? "text-slate-100 border-cyan-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Системы
          </button>
          <button
            onClick={() => setActiveTab("protocols")}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeTab === "protocols"
                ? "text-slate-100 border-cyan-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Протоколы
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeTab === "memory"
                ? "text-slate-100 border-cyan-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Контекст и Память
          </button>
        </nav>

        {/* Zone 3: 2 primary actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPersonaDrawer((prev) => !prev)}
            className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-[#0F1522] border border-slate-800 hover:border-slate-700 hover:text-white transition-colors whitespace-nowrap flex items-center gap-2"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Тембр и Тон</span>
          </button>

          <button
            onClick={() =>
              yulaState === "live" ? stopLiveSession() : startLiveSession()
            }
            className={`px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${
              yulaState === "live"
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>
              {yulaState === "live" ? "Завершить Live-эфир" : "Прямой Live-эфир"}
            </span>
          </button>
        </div>
      </header>

      {/* SUBTLE TELEMETRY & CONTEXT RIBBON */}
      <div className="px-6 py-2 bg-[#0B0E17] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-emerald-400">● КОНТЕКСТ АКТИВЕН</span>
          <span aria-hidden="true">·</span>
          <span>
            ГОЛОС: {currentVoiceProfile.label.toUpperCase()} (
            {currentVoiceProfile.gender.toUpperCase()})
          </span>
          <span aria-hidden="true">·</span>
          <span>ТОНАЛЬНОСТЬ: {currentToneOption.label.toUpperCase()}</span>
          <span aria-hidden="true">·</span>
          <span>
            БУФЕР ДИАЛОГА: {messages.length} РЕПЛИК / {memories.length} ФАКТОВ
          </span>
          <span aria-hidden="true">·</span>
          <span>ВРЕМЯ: {currentTimeStr}</span>
        </div>

        <div className="flex items-center gap-4">
          {timer && (
            <div className="flex items-center gap-2 text-amber-400">
              <span>▲ ТАЙМЕР ({timer.label}):</span>
              <span className="font-bold text-sm">
                {formatSeconds(timer.remainingSeconds)}
              </span>
              <button
                onClick={() => setTimer(null)}
                className="text-slate-400 hover:text-rose-400 ml-1 underline"
              >
                Сброс
              </button>
            </div>
          )}
          <button
            onClick={() => {
              if (yulaState === "speaking") {
                soundEngine.stopAllPlayback();
                setYulaState("idle");
              } else {
                setAutoSpeak((prev) => !prev);
              }
            }}
            className="flex items-center gap-1.5 text-slate-300 hover:text-cyan-400 transition-colors whitespace-nowrap"
          >
            {autoSpeak ? (
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>{autoSpeak ? "Озвучивание: ВКЛ" : "Озвучивание: ВЫКЛ"}</span>
          </button>
        </div>
      </div>

      {/* VOICE TIMBRE & COMMUNICATION TONE STUDIO (Drawer or Dedicated Tab) */}
      {(showPersonaDrawer || activeTab === "persona") && (
        <section className="px-6 py-5 bg-[#0F1522] border-b border-slate-800">
          <div className="max-w-[1552px] mx-auto flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Настройка индивидуальности YULA: Голосовые тембры и Тональность общения
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Выберите мужской или женский голос с нужным тембром и задайте характер ответов (Формальный, Дружелюбный или Саркастичный в духе J.A.R.V.I.S.).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-mono">Обращение:</span>
                  <select
                    value={userTitle}
                    onChange={(e) => setUserTitle(e.target.value)}
                    className="bg-[#07090E] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Сэр">«Сэр»</option>
                    <option value="Командир">«Командир»</option>
                    <option value="Создатель">«Создатель»</option>
                    <option value="Шеф">«Шеф»</option>
                  </select>
                </div>

                {activeTab !== "persona" && (
                  <button
                    onClick={() => setShowPersonaDrawer(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-800 bg-[#07090E] whitespace-nowrap"
                  >
                    Свернуть панель
                  </button>
                )}
              </div>
            </div>

            {/* 1. Tone of Communication Selector (Formal, Friendly, Sarcastic) */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-mono text-slate-400">
                01. Тональность общения и характер (Влияет на стиль речи, юмор и интонацию синтезатора)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {TONE_OPTIONS.map((tOpt) => {
                  const isSelected = tone === tOpt.id;
                  return (
                    <button
                      key={tOpt.id}
                      onClick={() => {
                        setTone(tOpt.id);
                        soundEngine.playHudCue("confirm");
                      }}
                      className={`p-4 text-left border transition-colors flex flex-col justify-between gap-2 ${
                        isSelected
                          ? "bg-[#07090E] border-cyan-400"
                          : "bg-[#07090E]/60 border-slate-800/90 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-display text-sm font-semibold text-slate-100">
                            {tOpt.label}
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              isSelected ? "text-cyan-400" : "text-slate-500"
                            }`}
                          >
                            {isSelected ? "● АКТИВЕН" : "ВЫБРАТЬ"}
                          </span>
                        </div>
                        <div className="text-xs text-cyan-400/90 font-mono mt-0.5">
                          {tOpt.subtitle}
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          {tOpt.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Voice Profiles Selector (Male / Female, Different Timbres) */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-mono text-slate-400">
                02. Голосовой профиль и тембр (Женские и Мужские голоса с индивидуальной акустической окраской)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {VOICE_PROFILES.map((vProf) => {
                  const isSelected = voiceName === vProf.id;
                  return (
                    <div
                      key={vProf.id}
                      onClick={() => {
                        setVoiceName(vProf.id);
                        soundEngine.playHudCue("confirm");
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setVoiceName(vProf.id);
                        }
                      }}
                      className={`p-3.5 border transition-colors cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? "bg-[#07090E] border-cyan-400"
                          : "bg-[#07090E]/60 border-slate-800/90 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span
                            className={
                              vProf.gender === "Мужской"
                                ? "text-amber-400"
                                : "text-cyan-400"
                            }
                          >
                            {vProf.gender.toUpperCase()}
                          </span>
                          <span className="text-slate-400">
                            {isSelected ? "● ВЫБРАН" : ""}
                          </span>
                        </div>
                        <div className="font-display text-base font-bold text-slate-100 mt-1">
                          {vProf.label}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {vProf.timbre}
                        </div>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          {vProf.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoiceName(vProf.id);
                          speakTextWithYula(
                            vProf.samplePhrase[tone],
                            vProf.id,
                            tone
                          );
                        }}
                        className="w-full py-1.5 px-2.5 bg-[#0F1522] hover:bg-slate-800 border border-slate-700/80 text-xs font-mono text-cyan-300 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Volume2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Проба голоса ({currentToneOption.label.slice(0, 4)}.)</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ERROR BANNER IF ANY */}
      {errorBanner && (
        <div className="px-6 py-2.5 bg-rose-950/80 border-b border-rose-500/40 flex items-center justify-between text-xs text-rose-200">
          <span>✖ ВНИМАНИЕ: {errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-300 hover:text-white underline ml-4"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* MAIN ASYMMETRIC SPLIT WORKSPACE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-[1600px] w-full mx-auto">
        {/* LEFT COLUMN: ENGINEERING SYSTEMS & RADAR TELEMETRY */}
        {(activeTab === "all" || activeTab === "systems") && (
          <aside
            className={`${
              activeTab === "systems" ? "lg:col-span-12" : "lg:col-span-3"
            } flex flex-col gap-5`}
          >
            {/* Radar Parameter Calibration Card */}
            <div className="p-5 bg-[#0F1522] border border-slate-800/90">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  01. Матрица подсистем комплекса
                </h2>
                <span className="font-mono text-xs text-cyan-400">
                  {systems.filter((s) => s.active).length}/{systems.length} АКТИВНЫ
                </span>
              </div>

              <RadarCalibrationChart systems={systems} />

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>СТАТУС КОНТУРА</span>
                <span className="text-emerald-400">● СИНХРОНИЗИРОВАНО</span>
              </div>
            </div>

            {/* Individual Smart System Controls */}
            <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  02. Инженерные узлы (Управление)
                </h2>
                <button
                  onClick={() => setSystems(INITIAL_SYSTEMS)}
                  className="text-xs font-mono text-slate-400 hover:text-cyan-400 flex items-center gap-1"
                  title="Сбросить к эталонным параметрам"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Эталон</span>
                </button>
              </div>

              <div
                className={`grid gap-4 ${
                  activeTab === "systems"
                    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1"
                }`}
              >
                {systems.map((sys) => (
                  <div
                    key={sys.id}
                    className="p-3.5 bg-[#07090E] border border-slate-800/90 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200">
                        {sys.name}
                      </span>
                      <button
                        onClick={() =>
                          setSystems((prev) =>
                            prev.map((item) =>
                              item.id === sys.id
                                ? {
                                    ...item,
                                    active: !item.active,
                                    status: !item.active ? "NOMINAL" : "STANDBY",
                                  }
                                : item
                            )
                          )
                        }
                        className={`text-[11px] font-mono px-2 py-0.5 transition-colors whitespace-nowrap ${
                          sys.active
                            ? "text-emerald-400 bg-emerald-500/10"
                            : "text-slate-500 bg-slate-800/50"
                        }`}
                      >
                        {sys.active ? "● ВКЛ" : "○ ВЫКЛ"}
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="font-mono">
                        <span className="text-xl font-semibold text-slate-100">
                          {sys.active ? sys.value : 0}
                        </span>
                        <span className="text-xs uppercase font-mono text-slate-400 ml-1">
                          {sys.unit}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate max-w-[150px]">
                        {sys.modeLabel}
                      </span>
                    </div>

                    <input
                      type="range"
                      min={sys.min}
                      max={sys.max}
                      step={sys.step}
                      disabled={!sys.active}
                      value={sys.value}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSystems((prev) =>
                          prev.map((item) =>
                            item.id === sys.id ? { ...item, value: val } : item
                          )
                        );
                      }}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 cursor-pointer disabled:opacity-40"
                    />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* CENTER STAGE: HOLOGRAPHIC YULA CORE, CONTEXT CONTINUITY & COMMAND CONSOLE */}
        <section
          className={`${
            activeTab === "all"
              ? "lg:col-span-6"
              : activeTab === "systems"
              ? "hidden"
              : "lg:col-span-8"
          } flex flex-col gap-5`}
        >
          {/* 1. Interactive Holographic Core Canvas */}
          <div className="h-[350px] w-full relative">
            <YulaOrbCanvas
              state={yulaState}
              micEnergy={micEnergy}
              onOrbClick={toggleSingleVoiceCommand}
              liveTranscript={liveTranscript}
              activeProtocolTitle={activeProtocolTitle}
            />
          </div>

          {/* 2. Primary Voice & Text Command Control Bar + Context Continuity Quick Prompts */}
          <div className="p-4 bg-[#0F1522] border border-slate-800/90 flex flex-col gap-3">
            {/* Quick Context Follow-Up Prompts */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-slate-400">
                Проверка контекста:
              </span>
              {[
                "Напомни, о чём мы говорили ранее?",
                "Как это связано с моим предыдущим вопросом?",
                "Запомни: мой главный проект — Квантовый Ядро-Реактор",
              ].map((quickPrompt) => (
                <button
                  key={quickPrompt}
                  onClick={() => sendCommandToYula(quickPrompt)}
                  disabled={yulaState === "thinking"}
                  className="px-2.5 py-1 bg-[#07090E] border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
                >
                  {quickPrompt}
                </button>
              ))}
            </div>

            {capturedImage && (
              <div className="flex items-center justify-between p-2.5 bg-[#07090E] border border-cyan-500/30">
                <div className="flex items-center gap-3">
                  <img
                    src={capturedImage.previewUrl}
                    alt="Кадр оптического сенсора"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 object-cover border border-slate-700"
                  />
                  <div className="text-xs">
                    <div className="text-cyan-300 font-medium">
                      Изображение прикреплено к запросу
                    </div>
                    <div className="text-slate-400">
                      YULA проведёт визуальный анализ с учётом текущего контекста
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCapturedImage(null)}
                  className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1"
                >
                  Удалить
                </button>
              </div>
            )}

            <div className="flex items-center gap-2.5">
              {/* Push-to-Talk Voice Command Button */}
              <button
                onClick={toggleSingleVoiceCommand}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-2 shrink-0 ${
                  yulaState === "listening"
                    ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                    : "bg-[#07090E] text-cyan-400 border border-cyan-500/40 hover:border-cyan-400"
                }`}
                title="Голосовая команда (Нажмите и говорите)"
              >
                {yulaState === "listening" ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Слушаю...</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Голос</span>
                  </>
                )}
              </button>

              {/* Optical Visor Quick Upload / Camera Trigger */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 bg-[#07090E] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-cyan-400 transition-colors shrink-0"
                title="Прикрепить изображение для анализа YULA"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                onClick={toggleCameraVisor}
                className={`p-2.5 border transition-colors shrink-0 ${
                  cameraActive
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                    : "bg-[#07090E] border-slate-800 hover:border-slate-700 text-slate-300 hover:text-cyan-400"
                }`}
                title="Включить оптический визор (Камера)"
              >
                <Camera className="w-4 h-4" />
              </button>

              {/* Command Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendCommandToYula();
                  }
                }}
                placeholder={`Отдайте приказ или продолжите мысль, ${userTitle} (голос: ${currentVoiceProfile.label}, тон: ${currentToneOption.label})...`}
                className="flex-1 bg-[#07090E] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />

              <button
                onClick={() => sendCommandToYula()}
                disabled={yulaState === "thinking"}
                className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Выполнить</span>
              </button>
            </div>
          </div>

          {/* 3. Optical Visor Live Camera Stream (when active) */}
          {cameraActive && (
            <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    Оптический тактический визор YULA
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      sendCommandToYula(
                        "Юла, проанализируй текущий кадр с оптического сенсора и свяжи его с нашим текущим контекстом."
                      )
                    }
                    className="px-3 py-1.5 bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition-colors whitespace-nowrap"
                  >
                    Сканировать кадр
                  </button>
                  <button
                    onClick={toggleCameraVisor}
                    className="px-3 py-1.5 bg-[#07090E] border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Отключить камеру
                  </button>
                </div>
              </div>

              <div className="relative bg-[#07090E] border border-cyan-500/30 overflow-hidden aspect-video max-h-[260px] flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 text-[11px] font-mono text-cyan-400 bg-[#07090E]/80 px-2 py-0.5">
                  ● ОПТИЧЕСКИЙ ПОТОК АКТИВЕН · 1 FPS LIVE SYNC
                </div>
              </div>
            </div>
          )}

          {/* 4. J.A.R.V.I.S. Tactical Protocols Matrix */}
          {(activeTab === "all" || activeTab === "protocols") && (
            <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  03. Комплексные протоколы YULA
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  МГНОВЕННОЕ ИСПОЛНЕНИЕ
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {YULA_PROTOCOLS.map((proto) => (
                  <button
                    key={proto.id}
                    onClick={() => sendCommandToYula(proto.promptCommand)}
                    disabled={yulaState === "thinking"}
                    className="p-3.5 bg-[#07090E] border border-slate-800/90 hover:border-cyan-500/60 text-left transition-colors flex flex-col justify-between gap-2 group"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
                        <span className="text-cyan-400">{proto.code}</span>
                        <span className="group-hover:text-cyan-300 transition-colors">
                          ЗАПУСК →
                        </span>
                      </div>
                      <div className="font-display text-sm font-semibold text-slate-100">
                        {proto.title}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {proto.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Context-Aware Dialogue & Operational Log */}
          <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex-1 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  04. Связный диалог и журнал оперативной памяти
                </h2>
                <p className="text-xs text-slate-400">
                  YULA удерживает в активном контексте до 20 последних реплик, все закреплённые сообщения ({pinnedMessagesCount}) и банк фактов ({memories.length}).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setMessages(DEFAULT_MESSAGES);
                    soundEngine.playHudCue("deactivate");
                  }}
                  className="text-xs font-mono text-slate-400 hover:text-rose-400 flex items-center gap-1 whitespace-nowrap"
                  title="Очистить кратковременную историю реплик (долгосрочная память сохранится)"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Сброс буфера реплик</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 max-h-[440px] overflow-y-auto pr-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 border transition-colors ${
                    msg.pinnedInContext
                      ? "bg-[#07090E] border-cyan-500/60"
                      : msg.role === "assistant"
                      ? "bg-[#07090E] border-slate-800/90"
                      : "bg-[#0B0E17] border-slate-800/50"
                  }`}
                >
                  {/* Unboxed clean metadata header (Zero-Pill Rule) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          msg.role === "assistant"
                            ? "text-cyan-400 font-semibold"
                            : "text-amber-400 font-semibold"
                        }
                      >
                        {msg.role === "assistant"
                          ? `YULA (${currentVoiceProfile.label})`
                          : userTitle.toUpperCase()}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{msg.timestamp}</span>
                      {msg.executedTools && msg.executedTools.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400">
                            {msg.executedTools.join(" / ")}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id
                                ? { ...m, pinnedInContext: !m.pinnedInContext }
                                : m
                            )
                          )
                        }
                        className={`flex items-center gap-1 transition-colors ${
                          msg.pinnedInContext
                            ? "text-cyan-400"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                        title="Закрепить реплику в постоянном контексте диалога"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>
                          {msg.pinnedInContext ? "В контексте" : "Закрепить"}
                        </span>
                      </button>

                      {msg.role === "assistant" && (
                        <button
                          onClick={() => speakTextWithYula(msg.text)}
                          className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1"
                          title="Озвучить ответ текущим голосом YULA"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Озвучить</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {msg.imagePreview && (
                    <img
                      src={msg.imagePreview}
                      alt="Прикреплённый кадр визора"
                      referrerPolicy="no-referrer"
                      className="w-28 h-20 object-cover border border-slate-800 mb-2"
                    />
                  )}

                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {msg.text}
                  </p>

                  {/* Context Continuity Trace */}
                  {msg.contextReference && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
                      Контекстная связь: {msg.contextReference}
                    </div>
                  )}

                  {/* Search Grounding Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span className="font-mono text-slate-500">
                        Источники разведки:
                      </span>
                      {msg.sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline flex items-center gap-1 truncate max-w-[240px]"
                        >
                          <span className="truncate">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: PERSISTENT CONTEXT MEMORY BANK, TASKS & TIMER */}
        {(activeTab === "all" ||
          activeTab === "memory" ||
          activeTab === "persona" ||
          activeTab === "protocols") && (
          <aside
            className={`${
              activeTab === "all" ? "lg:col-span-3" : "lg:col-span-4"
            } flex flex-col gap-5`}
          >
            {/* 1. YULA Persistent Context & Fact Memory Bank */}
            <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  05. Досье контекстной памяти YULA
                </h2>
                <span className="text-xs font-mono text-cyan-400">
                  ФАКТОВ: {memories.length}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Эти факты автоматически передаются в системное ядро при каждом запросе, позволяя YULA помнить ваши предпочтения, имена и прошлые решения.
              </p>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <select
                    value={newMemoryCategory}
                    onChange={(e) => setNewMemoryCategory(e.target.value)}
                    className="bg-[#07090E] border border-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Контекст диалога">Контекст</option>
                    <option value="Предпочтение">Предпочтение</option>
                    <option value="Проект">Проект</option>
                    <option value="Директива">Директива</option>
                  </select>
                  <input
                    type="text"
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newMemoryText.trim()) {
                        setMemories((prev) => [
                          {
                            id: `mem-${Date.now()}`,
                            category: newMemoryCategory,
                            content: newMemoryText.trim(),
                            timestamp: new Date().toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                            pinned: true,
                          },
                          ...prev,
                        ]);
                        setNewMemoryText("");
                      }
                    }}
                    placeholder="Добавить факт в память..."
                    className="flex-1 bg-[#07090E] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => {
                      if (!newMemoryText.trim()) return;
                      setMemories((prev) => [
                        {
                          id: `mem-${Date.now()}`,
                          category: newMemoryCategory,
                          content: newMemoryText.trim(),
                          timestamp: new Date().toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                          pinned: true,
                        },
                        ...prev,
                      ]);
                      setNewMemoryText("");
                    }}
                    className="p-1.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors shrink-0"
                    title="Сохранить факт в контекстную память"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3 bg-[#07090E] border border-slate-800/90 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-cyan-400">{mem.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{mem.timestamp}</span>
                      </div>
                      <button
                        onClick={() =>
                          setMemories((prev) =>
                            prev.filter((item) => item.id !== mem.id)
                          )
                        }
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                        title="Удалить запись из памяти"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {mem.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Tactical Directives & Tasks */}
            <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  06. Тактические директивы
                </h2>
                <span className="text-xs font-mono text-cyan-400">
                  АКТИВНО: {tasks.filter((t) => !t.completed).length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTaskTitle.trim()) {
                      setTasks((prev) => [
                        {
                          id: `tsk-${Date.now()}`,
                          title: newTaskTitle.trim(),
                          priority: "normal",
                          completed: false,
                          createdAt: new Date().toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        },
                        ...prev,
                      ]);
                      setNewTaskTitle("");
                    }
                  }}
                  placeholder="Новая задача..."
                  className="flex-1 bg-[#07090E] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => {
                    if (!newTaskTitle.trim()) return;
                    setTasks((prev) => [
                      {
                        id: `tsk-${Date.now()}`,
                        title: newTaskTitle.trim(),
                        priority: "normal",
                        completed: false,
                        createdAt: new Date().toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      },
                      ...prev,
                    ]);
                    setNewTaskTitle("");
                  }}
                  className="p-1.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors"
                  title="Добавить задачу"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-[#07090E] border border-slate-800/90 flex items-start justify-between gap-2.5"
                  >
                    <button
                      onClick={() =>
                        setTasks((prev) =>
                          prev.map((t) =>
                            t.id === task.id
                              ? { ...t, completed: !t.completed }
                              : t
                          )
                        )
                      }
                      className={`mt-0.5 w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${
                        task.completed
                          ? "bg-cyan-500 border-cyan-500 text-slate-950"
                          : "border-slate-600 hover:border-cyan-400"
                      }`}
                    >
                      {task.completed && <Check className="w-3 h-3" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs leading-snug ${
                          task.completed
                            ? "line-through text-slate-500"
                            : "text-slate-200"
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mt-1">
                        <span>{task.createdAt}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            task.priority === "high"
                              ? "text-amber-400"
                              : "text-slate-400"
                          }
                        >
                          {task.priority === "high" ? "ПРИОРИТЕТ" : "ШТАТНАЯ"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setTasks((prev) => prev.filter((t) => t.id !== task.id))
                      }
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                      title="Удалить директиву"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Quick Countdown Timer Control */}
            <div className="p-5 bg-[#0F1522] border border-slate-800/90 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  07. Хронометр комплекса
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  {timer ? (timer.running ? "● ОТСЧЁТ" : "ПАУЗА") : "ОЖИДАНИЕ"}
                </span>
              </div>

              {timer ? (
                <div className="p-3.5 bg-[#07090E] border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">{timer.label}</div>
                    <div className="text-2xl font-mono font-bold text-amber-400 mt-0.5">
                      {formatSeconds(timer.remainingSeconds)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setTimer((prev) =>
                          prev ? { ...prev, running: !prev.running } : null
                        )
                      }
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      {timer.running ? (
                        <Square className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setTimer(null)}
                      className="p-2 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "5 мин", secs: 300 },
                    { label: "15 мин", secs: 900 },
                    { label: "45 мин", secs: 2700 },
                  ].map((preset) => (
                    <button
                      key={preset.secs}
                      onClick={() =>
                        setTimer({
                          id: `tmr-${Date.now()}`,
                          label: `Синхронизация (${preset.label})`,
                          totalSeconds: preset.secs,
                          remainingSeconds: preset.secs,
                          running: true,
                        })
                      }
                      className="py-2 px-3 bg-[#07090E] border border-slate-800 hover:border-cyan-500/50 text-xs font-mono text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
