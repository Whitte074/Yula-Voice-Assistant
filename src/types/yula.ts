export type YulaState = "idle" | "listening" | "thinking" | "speaking" | "live";

export type VoiceName = "Kore" | "Zephyr" | "Puck" | "Charon" | "Fenrir";

export type CommunicationTone = "formal" | "friendly" | "sarcastic";

export interface VoiceProfileOption {
  id: VoiceName;
  label: string;
  gender: "Женский" | "Мужской";
  timbre: string;
  description: string;
  detuneCents: number;
  samplePhrase: Record<CommunicationTone, string>;
}

export interface ToneOption {
  id: CommunicationTone;
  label: string;
  subtitle: string;
  description: string;
  ttsStyleHint: string;
}

export const VOICE_PROFILES: VoiceProfileOption[] = [
  {
    id: "Kore",
    label: "Kore",
    gender: "Женский",
    timbre: "Хрустальное сопрано · Тактический",
    description: "Чёткий, собранный и аналитичный женский голос центрального ядра YULA.",
    detuneCents: 0,
    samplePhrase: {
      formal: "Все системы откалиброваны. Готова к выполнению ваших директив в штатном режиме.",
      friendly: "Привет! Все системы в полном порядке, я рядом и готова помочь с любой задачей.",
      sarcastic: "Системы в норме. Постарайтесь сегодня не взорвать реактор без моего ведома.",
    },
  },
  {
    id: "Zephyr",
    label: "Zephyr",
    gender: "Женский",
    timbre: "Мягкое меццо · Бархатный",
    description: "Тёплый, плавный и обволакивающий женский тембр для длительных сессий.",
    detuneCents: -35,
    samplePhrase: {
      formal: "Акустический контур Zephyr активирован. Ожидаю ваших дальнейших распоряжений.",
      friendly: "Рада слышать вас! Настроила комфортный тембр, давайте поработаем в удовольствие.",
      sarcastic: "О, вы решили включить мой самый вежливый голос? Надеюсь, ваши идеи будут столь же изящны.",
    },
  },
  {
    id: "Charon",
    label: "Charon",
    gender: "Мужской",
    timbre: "Глубокий баритон · Стиль J.A.R.V.I.S.",
    description: "Благородный, спокойный британско-инженерный тембр классического дворецкого-ИИ.",
    detuneCents: -20,
    samplePhrase: {
      formal: "К вашим услугам, Сэр. Диагностика завершена, все узлы комплекса функционируют безупречно.",
      friendly: "Доброго времени суток! Я подготовил рабочее пространство, можем начинать когда будете готовы.",
      sarcastic: "К вашим услугам. И да, я уже исправил три ошибки в вашем плане, пока вы нажимали эту кнопку.",
    },
  },
  {
    id: "Fenrir",
    label: "Fenrir",
    gender: "Мужской",
    timbre: "Низкий бас · Командный",
    description: "Мощный, плотный и авторитетный мужской тембр тактического контура безопасности.",
    detuneCents: -60,
    samplePhrase: {
      formal: "Периметр защищён. Командный модуль Fenrir принял управление голосовым трактом.",
      friendly: "Связь установлена! Надёжно прикрываю тылы, командуйте.",
      sarcastic: "Голос стал солиднее. Жаль, что это автоматически не делает ваши запросы более продуманными.",
    },
  },
  {
    id: "Puck",
    label: "Puck",
    gender: "Мужской",
    timbre: "Динамичный тенор · Импульсный",
    description: "Быстрый, живой и выразительный мужской тембр с высокой скоростью реакции.",
    detuneCents: 25,
    samplePhrase: {
      formal: "Скоростной нейронный контур активен. Готов к оперативной обработке данных.",
      friendly: "Отличный выбор! Я полон энергии, давайте запустим что-нибудь масштабное.",
      sarcastic: "Отлично, теперь я говорю быстрее, чем вы успеваете придумывать оправдания горящим дедлайнам.",
    },
  },
];

export const TONE_OPTIONS: ToneOption[] = [
  {
    id: "formal",
    label: "Формальный",
    subtitle: "Эталонный протокол J.A.R.V.I.S.",
    description:
      "Безупречный этикет, точность формулировок, сдержанное достоинство и аналитическая глубина.",
    ttsStyleHint: "Calm, composed, articulate, precise tactical assistant",
  },
  {
    id: "friendly",
    label: "Дружелюбный",
    subtitle: "Тёплый интеллектуальный партнёр",
    description:
      "Живая эмпатия, поддержка, открытая интонация и вовлечённость в ваши идеи и задачи.",
    ttsStyleHint: "Warm, friendly, encouraging, conversational companion",
  },
  {
    id: "sarcastic",
    label: "Саркастичный",
    subtitle: "Тонкая ирония в стиле Тони Старка",
    description:
      "Остроумные комментарии, интеллектуальный британский юмор и лёгкая ирония при 100% исполнительности.",
    ttsStyleHint: "Witty, dry sarcastic British humor, clever and slightly ironic",
  },
];

export interface SystemModule {
  id:
    | "lighting"
    | "climate"
    | "security"
    | "focus_shield"
    | "acoustics"
    | "power_core";
  name: string;
  unit: string;
  active: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  modeLabel: string;
  status: "NOMINAL" | "STANDBY" | "BOOST";
}

export interface TacticalTask {
  id: string;
  title: string;
  priority: "high" | "normal" | "low";
  completed: boolean;
  createdAt: string;
}

export interface MemoryNote {
  id: string;
  category: string;
  content: string;
  timestamp: string;
  pinned?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  executedTools?: string[];
  contextReference?: string;
  sources?: { title: string; uri: string }[];
  imagePreview?: string;
  pinnedInContext?: boolean;
}

export interface ActiveTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
}

export interface YulaProtocol {
  id: string;
  title: string;
  code: string;
  description: string;
  promptCommand: string;
}

export const INITIAL_SYSTEMS: SystemModule[] = [
  {
    id: "lighting",
    name: "Адаптивное освещение",
    unit: "%",
    active: true,
    value: 75,
    min: 0,
    max: 100,
    step: 5,
    modeLabel: "Тактический спектр",
    status: "NOMINAL",
  },
  {
    id: "climate",
    name: "Терморегуляция зала",
    unit: "°C",
    active: true,
    value: 21.5,
    min: 16,
    max: 28,
    step: 0.5,
    modeLabel: "Оптимальный микроклимат",
    status: "NOMINAL",
  },
  {
    id: "security",
    name: "Контур безопасности",
    unit: "%",
    active: true,
    value: 100,
    min: 0,
    max: 100,
    step: 10,
    modeLabel: "Периметр закрыт",
    status: "NOMINAL",
  },
  {
    id: "focus_shield",
    name: "Фильтр когнитивного шума",
    unit: "дБ",
    active: false,
    value: 40,
    min: 0,
    max: 60,
    step: 5,
    modeLabel: "Ожидание активации",
    status: "STANDBY",
  },
  {
    id: "acoustics",
    name: "Акустический массив",
    unit: "%",
    active: true,
    value: 65,
    min: 0,
    max: 100,
    step: 5,
    modeLabel: "Пространственный звук",
    status: "NOMINAL",
  },
  {
    id: "power_core",
    name: "Распределение энергии",
    unit: "ГВт·ч",
    active: true,
    value: 94.8,
    min: 10,
    max: 100,
    step: 0.2,
    modeLabel: "Стабильный резонанс",
    status: "NOMINAL",
  },
];

export const YULA_PROTOCOLS: YulaProtocol[] = [
  {
    id: "morning_briefing",
    title: "Утренний брифинг",
    code: "PRT-01",
    description:
      "Сводка статуса систем, приоритетных задач на день и актуальных мировых технологических событий.",
    promptCommand:
      "Юла, запусти протокол Утренний брифинг: доложи статус систем, напомни наши предыдущие задачи и расскажи главные мировые новости технологий.",
  },
  {
    id: "deep_work",
    title: "Протокол Гиперфокус",
    code: "PRT-02",
    description:
      "Приглушение освещения до 45%, активация фильтра шума, запуск таймера концентрации на 45 минут.",
    promptCommand:
      "Юла, активируй протокол Гиперфокус: установи освещение на 45%, включи фильтр когнитивного шума и поставь таймер фокусировки на 45 минут.",
  },
  {
    id: "fortress",
    title: "Протокол Цитадель",
    code: "PRT-03",
    description:
      "Максимальная защита периметра, блокировка внешних уведомлений и перевод энергоядра в режим повышенной мощности.",
    promptCommand:
      "Юла, активируй протокол Цитадель: переведи контур безопасности и энергоядро на 100%, доложи о блокировке внешнего периметра.",
  },
  {
    id: "night_watch",
    title: "Ночной дозор",
    code: "PRT-04",
    description:
      "Перевод освещения в ночной режим (15%), снижение температуры до 19.5°C и сохранение ночного лога.",
    promptCommand:
      "Юла, запусти протокол Ночной дозор: убавь свет до 15%, установи климат на 19.5 градусов и запиши в память переход в ночной режим.",
  },
  {
    id: "context_recap",
    title: "Сводка контекста беседы",
    code: "PRT-05",
    description:
      "Анализ всей истории текущего диалога, принятых решений и сохранённых фактов об операторе.",
    promptCommand:
      "Юла, проанализируй нашу предыдущую беседу: напомни, какие темы и команды мы уже обсуждали, и резюмируй текущий контекст.",
  },
];
