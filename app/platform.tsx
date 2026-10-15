"use client";
import { useEffect, useRef, useState } from "react";
import ChatGPTConnection from "./chatgpt-connection";
import CourseTransfer from "./course-transfer";
import { uploadDocuments } from "./upload-client";
import {
  BookOpen,
  LayoutDashboard,
  Files,
  GraduationCap,
  ClipboardCheck,
  RotateCcw,
  ChartNoAxesCombined,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Flame,
  Zap,
  Clock3,
  Target,
  Sparkles,
  Upload,
  X,
  Check,
  CheckCheck,
  Send,
  LogOut,
  Menu,
  Sun,
  Moon,
  MoreHorizontal,
  Download,
  Pencil,
  Trash2,
  LoaderCircle,
  FileText,
  Image,
  Presentation,
  CircleHelp,
  Trophy,
  Leaf,
  Layers,
  LockKeyhole,
  MessageCircle,
  Play,
  GripVertical,
  CircleCheck,
  AlertCircle,
  FolderOpen,
  MoveUp,
  MoveDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type {
  Workspace,
  Course,
  Chapter,
  Question,
  Exam,
  Preferences,
  Source,
} from "@/lib/types";
import { adaptiveDifficulty } from "@/lib/learning";
import { emptyWorkspace } from "@/lib/types";
type View =
  | "dashboard"
  | "documents"
  | "courses"
  | "learn"
  | "exams"
  | "review"
  | "statistics"
  | "settings";
const navigation = [
  ["dashboard", "Übersicht", LayoutDashboard],
  ["documents", "Meine Dokumente", Files],
  ["courses", "Meine Kurse", GraduationCap],
  ["learn", "Lernen", BookOpen],
  ["exams", "Prüfungen", ClipboardCheck],
  ["review", "Wiederholen", RotateCcw],
  ["statistics", "Statistiken", ChartNoAxesCombined],
] as const;
const typeNames: Record<string, string> = {
  single: "Multiple Choice",
  multiple: "Mehrfachauswahl",
  cloze: "Lückentext",
  boolean: "Richtig oder falsch",
  open: "Verständnisfrage",
  matching: "Definitionen zuordnen",
  connecting: "Begriffe verbinden",
  ordering: "Reihenfolge",
  calculation: "Rechenaufgabe",
  case: "Fallbeispiel",
  flashcard: "Karteikarte",
  exam: "Prüfungsfrage",
};
async function api(route: string, body?: any, method = "POST") {
  const r = await fetch("/api/" + route, {
    method: body === undefined ? "GET" : method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}
function Markdown({
  children,
  inline = false,
}: {
  children: string;
  inline?: boolean;
}) {
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className={"markdown" + (inline ? " inline-markdown" : "")}>
      <ReactMarkdown
        components={{
          img: ({ alt }) => (
            <span>[Abbildung: {alt || "ohne Beschreibung"}]</span>
          ),
          p: ({ children }) =>
            inline ? <span>{children}</span> : <p>{children}</p>,
        }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </Wrapper>
  );
}
function Progress({
  value,
  color = "purple",
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className={"progress " + color}>
      <span style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
    </div>
  );
}
function Empty({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  label,
}: {
  icon?: any;
  title: string;
  description: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={29} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={action}>
          <Plus size={16} />
          {label}
        </button>
      )}
    </div>
  );
}
function BookArt() {
  return (
    <div className="book-art" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="art-spark s1">✧</span>
      <span className="art-spark s2">✧</span>
      <span className="art-dot d1" />
      <span className="art-dot d2" />
      <div className="floating-badge">
        <CheckCheck size={22} />
      </div>
      <div className="book book-back">
        <div />
      </div>
      <div className="book book-front">
        <span className="book-line" />
        <span className="book-star">
          <Sparkles size={32} />
        </span>
        <span className="book-label">
          Ein bisschen
          <br />
          besser. Jeden Tag.
        </span>
        <span className="book-line small" />
      </div>
      <div className="art-leaf leaf1" />
      <div className="art-leaf leaf2" />
      <div className="art-base" />
    </div>
  );
}
export default function Platform() {
  const [view, setView] = useState<View>("dashboard"),
    [w, setW] = useState<Workspace>(emptyWorkspace()),
    [account, setAccount] = useState<any>(null),
    [configured, setConfigured] = useState(false),
    [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<"login" | "register" | null>(null),
    [upload, setUpload] = useState(false),
    [busy, setBusy] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState("");
  const [courseId, setCourseId] = useState(""),
    [chapterId, setChapterId] = useState(""),
    [tab, setTab] = useState<"explain" | "practice" | "notes">("explain"),
    [qIndex, setQIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [result, setResult] = useState<any>(null),
    [method, setMethod] = useState("mixed"),
    [difficulty, setDifficulty] = useState("adaptive"),
    [count, setCount] = useState(5),
    [onlyErrors, setOnlyErrors] = useState(false),
    [tutor, setTutor] = useState(false),
    [chatText, setChatText] = useState(""),
    [examId, setExamId] = useState("");
  const [explainLevel, setExplainLevel] = useState("");
  const [phase, setPhase] = useState(0),
    [scope, setScope] = useState("chapter"),
    [selectedChapters, setSelectedChapters] = useState<string[]>([]),
    [forcedQuestionId, setForcedQuestionId] = useState("");
  const [docPreview, setDocPreview] = useState<any>(null),
    [editing, setEditing] = useState<Question | null>(null),
    [note, setNote] = useState(""),
    [now, setNow] = useState(Date.now());
  const userNavigated = useRef(false);
  const noteDirty = useRef(false);
  const restored = useRef(false),
    checkpointRestore = useRef<any>(null);
  const start = useRef(Date.now()),
    requestId = useRef(""),
    fileInput = useRef<HTMLInputElement>(null);
  const course = w.courses.find((c) => c.id === courseId) || w.courses[0];
  const chapter =
    course?.chapters.find((c) => c.id === chapterId) || course?.chapters[0];
  const lesson =
    chapter?.variants?.[
      (explainLevel || w.preferences.difficulty) + ":" + w.preferences.language
    ] || chapter;
  const xp = w.attempts.reduce((n, a) => n + a.xp, 0),
    level = 1 + Math.floor(xp / 250),
    today = new Date().toISOString().slice(0, 10),
    todayXP = w.attempts
      .filter((a) => a.at.startsWith(today))
      .reduce((n, a) => n + a.xp, 0),
    correct = w.attempts.filter((a) => a.correct).length;
  const due = Object.entries(w.mastery).filter(
    ([, m]) => new Date(m.due).getTime() <= Date.now(),
  ).length;
  const errorIds = new Set(
    w.attempts
      .filter(
        (a) =>
          !a.correct &&
          !w.attempts.some(
            (b) => b.questionId === a.questionId && b.correct && b.at > a.at,
          ),
      )
      .map((a) => a.questionId),
  );
  const scopedChapters =
    course?.chapters.filter(
      (ch) =>
        scope === "course" ||
        (scope === "selected"
          ? selectedChapters.includes(ch.id)
          : ch.id === chapter?.id),
    ) || [];
  const questions = scopedChapters
    .flatMap((ch) => ch.questions)
    .filter(
      (q) =>
        (method === "mixed" || method === "explain" || q.type === method) &&
        (!onlyErrors || errorIds.has(q.id)) &&
        (phase !== 3 ||
          ["cloze", "matching", "connecting", "ordering", "multiple"].includes(
            q.type,
          )) &&
        (difficulty === "adaptive" ||
          difficulty === "mixed" ||
          q.difficulty === Number(difficulty)),
    );
  const adaptive = adaptiveDifficulty(
    chapter ? w.mastery[chapter.id] : undefined,
    w.preferences.thresholds,
  );
  const ordered =
    difficulty === "adaptive"
      ? [...questions].sort(
          (a, b) =>
            Math.abs(a.difficulty - adaptive) -
            Math.abs(b.difficulty - adaptive),
        )
      : questions;
  const activeQuestion = result
    ? course?.chapters
        .flatMap((ch) => ch.questions)
        .find((q) => q.id === result.questionId)
    : forcedQuestionId
      ? course?.chapters
          .flatMap((ch) => ch.questions)
          .find((q) => q.id === forcedQuestionId)
      : ordered[qIndex % Math.max(1, Math.min(count, ordered.length))];
  const questionChapter =
    course?.chapters.find((ch) =>
      ch.questions.some((q) => q.id === activeQuestion?.id),
    ) || chapter;
  const followUp = w.attempts.find((a) => a.id === result?.id);
  const currentExam = w.exams.find((e) => e.id === examId);
  async function reload() {
    const a = await api("auth/me");
    setAccount(a.user);
    setConfigured(a.aiConfigured);
    if (a.user) {
      const state = await api("state");
      setW(state);
      if (!restored.current && state.checkpoint) {
        restored.current = true;
        checkpointRestore.current = state.checkpoint;
        setCourseId(state.checkpoint.courseId);
        setChapterId(state.checkpoint.chapterId);
        setTab(state.checkpoint.tab);
        if (!userNavigated.current) setView(state.checkpoint.view as View);
        setQIndex(state.checkpoint.qIndex);
        setMethod(state.checkpoint.method || "mixed");
        setDifficulty(state.checkpoint.difficulty || "adaptive");
        setCount(state.checkpoint.count || 5);
        setPhase(state.checkpoint.phase || 0);
        setScope(state.checkpoint.scope || "chapter");
        setSelectedChapters(state.checkpoint.selectedChapters || []);
        setOnlyErrors(state.checkpoint.onlyErrors || false);
        setForcedQuestionId(state.checkpoint.questionId || "");
      }
      restored.current = true;
      document.documentElement.dataset.theme = state.preferences.theme;
    } else {
      setW(emptyWorkspace());
      restored.current = false;
      checkpointRestore.current = null;
    }
    setReady(true);
  }
  useEffect(() => {
    reload().catch((e) => {
      setError(e.message);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!account) return;
    const id = setInterval(
      () =>
        api("state")
          .then(setW)
          .catch(() => {}),
      5000,
    );
    return () => clearInterval(id);
  }, [account]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (
      checkpointRestore.current &&
      checkpointRestore.current.chapterId === chapter?.id
    ) {
      requestId.current =
        checkpointRestore.current.requestId || crypto.randomUUID();
      setQIndex(checkpointRestore.current.qIndex || 0);
      setAnswer(checkpointRestore.current.answer || "");
      checkpointRestore.current = null;
    } else {
      setQIndex(0);
      setAnswer("");
      setForcedQuestionId("");
      requestId.current = crypto.randomUUID();
    }
    setResult(null);
    start.current = Date.now();
    setNote(chapter ? w.notes[chapter.id] || "" : "");
  }, [chapter?.id, method, difficulty, onlyErrors]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!account || !course || !chapter) return;
    const timer = setTimeout(() => {
      void api("checkpoint", {
        courseId: course.id,
        chapterId: chapter.id,
        tab,
        view,
        qIndex,
        answer,
        questionId: activeQuestion?.id,
        requestId: requestId.current,
        method,
        difficulty,
        count,
        phase,
        scope,
        selectedChapters,
        onlyErrors,
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [
    account?.id,
    course?.id,
    chapter?.id,
    tab,
    view,
    qIndex,
    answer,
    activeQuestion?.id,
    method,
    difficulty,
    count,
    phase,
    scope,
    selectedChapters,
    onlyErrors,
  ]);
  useEffect(() => {
    if (!account || !chapter || !course || !noteDirty.current) return;
    const timer = setTimeout(() => {
      void api("note", {
        courseId: course.id,
        chapterId: chapter.id,
        content: note,
      })
        .then(() => {
          noteDirty.current = false;
        })
        .catch((e) => setError(e.message));
    }, 800);
    return () => clearTimeout(timer);
  }, [note, chapter?.id, account?.id]);
  async function perform(label: string, fn: () => Promise<any>) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  function requireAccount(fn: () => void) {
    if (!account) setAuth("register");
    else fn();
  }
  function go(next: View) {
    userNavigated.current = true;
    setView(next);
    setMobile(false);
    setQuery("");
  }
  function openLesson(c: Course, ch?: Chapter, practice = false) {
    setPhase(0);
    setScope("chapter");
    setForcedQuestionId("");
    setCourseId(c.id);
    setChapterId((ch || c.chapters[0])?.id || "");
    setTab(practice ? "practice" : "explain");
    go("learn");
  }
  async function sendAnswer() {
    if (!course || !chapter || !activeQuestion) return;
    await perform("Antwort wird geprüft", async () => {
      const r = await api("answer", {
        courseId: course.id,
        chapterId: questionChapter!.id,
        questionId: activeQuestion.id,
        answer,
        requestId: requestId.current,
        seconds: Math.round((Date.now() - start.current) / 1000),
      });
      setResult(r);
      await reload();
    });
  }
  function nextQuestion() {
    setForcedQuestionId(followUp?.followUpId || "");
    setQIndex(qIndex + 1);
    setAnswer("");
    setResult(null);
    start.current = Date.now();
    requestId.current = crypto.randomUUID();
  }
  const streak = (() => {
    const days = new Set(w.attempts.map((a) => a.at.slice(0, 10)));
    let n = 0;
    const d = new Date();
    if (!days.has(d.toISOString().slice(0, 10)))
      d.setUTCDate(d.getUTCDate() - 1);
    while (days.has(d.toISOString().slice(0, 10))) {
      n++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return n;
  })();
  const searchResults = query.trim()
    ? w.courses.flatMap((c) =>
        c.chapters
          .filter((ch) =>
            (ch.title + " " + ch.explanation)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((ch) => ({ c, ch })),
      )
    : [];
  const title = navigation.find((n) => n[0] === view)?.[1] || "Einstellungen";
  function sourceBlock(sources: Source[]) {
    return (
      sources?.length > 0 && (
        <div className="sources">
          <span>
            <Files size={14} /> Aus deinen Unterlagen
          </span>
          {sources.map((s, i) => (
            <button
              key={i}
              title={s.quote}
              onClick={() =>
                perform("Quelle öffnen", async () => {
                  setDocPreview(await api("document?id=" + s.documentId));
                })
              }
            >
              {w.documents.find((d) => d.id === s.documentId)?.name ||
                "Gelöschte Quelle"}{" "}
              · S. / Folie {s.page}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )
    );
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "is-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <span className="brand-symbol">
            <BookOpen size={24} />
            <i />
          </span>
          lernpfad<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          DEIN LERNRAUM <span>✦</span>
        </div>
        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={"nav-item " + (view === id ? "active" : "")}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "review" && due > 0 && <b>{due}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="growth-card">
            <span className="growth-icon">
              <Leaf size={22} />
            </span>
            <strong>
              Kleine Schritte.
              <br />
              Große Fortschritte.
            </strong>
            <p>
              Dein nächstes Aha-Erlebnis
              <br />
              wartet schon auf dich.
            </p>
            <button onClick={() => requireAccount(() => setUpload(true))}>
              Neues Wissen entdecken <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={"nav-item " + (view === "settings" ? "active" : "")}
            onClick={() => go("settings")}
          >
            <Settings size={19} />
            <span>Einstellungen</span>
          </button>
          <div
            className="profile"
            onClick={() => (account ? go("settings") : setAuth("login"))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                account ? go("settings") : setAuth("login");
            }}
          >
            <div className="avatar">
              {(w.preferences.name || account?.email || "D")
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div>
              <strong>
                {w.preferences.name ||
                  account?.email?.split("@")[0] ||
                  "Dein Lernraum"}
              </strong>
              <small>{account ? "Persönliches Konto" : "Jetzt anmelden"}</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Menü"
            >
              <Menu size={21} />
            </button>
            <span>Mein Lernraum</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <div className="search">
              <Search size={16} />
              <input
                placeholder="Kurse & Inhalte durchsuchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
              {query && (
                <div className="search-results">
                  {searchResults.length ? (
                    searchResults.slice(0, 8).map(({ c, ch }) => (
                      <button key={ch.id} onClick={() => openLesson(c, ch)}>
                        {ch.title}
                        <small>{c.title}</small>
                      </button>
                    ))
                  ) : (
                    <p>Keine passenden Kapitel gefunden.</p>
                  )}
                </div>
              )}
            </div>
            <div className="top-streak">
              <Flame size={18} />
              <b>{streak}</b>
              <span>Tage</span>
            </div>
            <button
              className="icon-button"
              aria-label="Design wechseln"
              onClick={() => {
                const theme =
                  document.documentElement.dataset.theme === "dark"
                    ? "light"
                    : "dark";
                document.documentElement.dataset.theme = theme;
                if (account)
                  void api("preferences", { ...w.preferences, theme }).then(
                    reload,
                  );
              }}
            >
              <Sun size={19} />
            </button>
          </div>
        </header>
        <div className="page-content">
          {error && (
            <div className="alert error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Fehler schließen"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="loading">
              <LoaderCircle className="spin" /> Dein Lernraum wird geladen …
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {view === "dashboard"
                      ? "DEIN WISSEN. DEIN WEG."
                      : "DEIN PERSÖNLICHER LERNRAUM"}
                  </div>
                  <h1>
                    {view === "dashboard" ? (
                      <>
                        Schön, dass du da bist
                        {w.preferences.name
                          ? ", " + w.preferences.name
                          : ""}{" "}
                        <span className="wave">✺</span>
                      </>
                    ) : (
                      title
                    )}
                  </h1>
                  <p>
                    {
                      {
                        dashboard:
                          "Ein guter Tag, um etwas Neues zu verstehen.",
                        documents:
                          "Deine Unterlagen. Die Grundlage für dein nächstes Aha-Erlebnis.",
                        courses:
                          "Aus deinen Unterlagen wird ein Weg, der zu dir passt.",
                        learn:
                          "Verstehen, ausprobieren und über dich hinauswachsen.",
                        exams:
                          "Gut vorbereitet. Mit einem guten Gefühl in die Prüfung.",
                        review: "Mach aus gelerntem Wissen bleibendes Wissen.",
                        statistics:
                          "Jeder kleine Schritt macht einen Unterschied.",
                        settings:
                          "Dein Lernraum, ganz nach deinen Vorstellungen.",
                      }[view]
                    }
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => requireAccount(() => setUpload(true))}
                >
                  <Plus size={17} /> Dokumente hochladen
                </button>
              </div>
              {view === "dashboard" && (
                <>
                  <div className="dashboard-grid">
                    <div className="dashboard-main">
                      <section className="hero-card">
                        <div className="hero-copy">
                          <div className="hero-tag">
                            <span /> DEIN PERSÖNLICHER KI-TUTOR
                          </div>
                          <h2>
                            Große Ziele beginnen
                            <br />
                            mit einem kleinen Schritt.
                          </h2>
                          <p>
                            Mach aus deinen Unterlagen echtes Wissen.
                            <br />
                            In deinem Tempo. Auf deinem Lernpfad.
                          </p>
                          <button
                            className="button dark"
                            onClick={() =>
                              course
                                ? openLesson(course)
                                : requireAccount(() => setUpload(true))
                            }
                          >
                            {course
                              ? "Weiterlernen"
                              : "Meinen Lernpfad starten"}
                            <ArrowRight size={17} />
                          </button>
                          <span className="hero-foot">
                            <Sparkles size={13} /> Individuell für dich. Mit KI.
                          </span>
                        </div>
                        <BookArt />
                      </section>
                      <div className="stat-grid">
                        <div className="stat-card">
                          <span className="stat-icon amber">
                            <Zap size={19} />
                          </span>
                          <span className="stat-label">Gesammelte XP</span>
                          <div>
                            <strong>{xp.toLocaleString("de-DE")}</strong>
                            <span className="stat-detail">Level {level}</span>
                          </div>
                          <Progress
                            value={((xp % 250) / 250) * 100}
                            color="amber"
                          />
                        </div>
                        <div className="stat-card">
                          <span className="stat-icon mint">
                            <Target size={19} />
                          </span>
                          <span className="stat-label">Deine Erfolgsquote</span>
                          <div>
                            <strong>
                              {w.attempts.length
                                ? Math.round(
                                    (correct / w.attempts.length) * 100,
                                  )
                                : 0}
                              <small>%</small>
                            </strong>
                            <span className="stat-detail">
                              {w.attempts.length} Antworten
                            </span>
                          </div>
                          <Progress
                            value={
                              w.attempts.length
                                ? (correct / w.attempts.length) * 100
                                : 0
                            }
                            color="mint"
                          />
                        </div>
                        <div className="stat-card">
                          <span className="stat-icon lilac">
                            <Clock3 size={19} />
                          </span>
                          <span className="stat-label">Deine Lernzeit</span>
                          <div>
                            <strong>
                              {Math.round(w.studySeconds / 60)}
                              <small> Min.</small>
                            </strong>
                            <span className="stat-detail">
                              Schritt für Schritt
                            </span>
                          </div>
                          <div className="mini-bars">
                            {[
                              25, 40, 30, 60, 45, 80, 55, 65, 40, 90, 60, 80,
                              50, 70, 60, 90, 55, 75,
                            ].map((v, i) => (
                              <i
                                key={i}
                                style={{
                                  height: v + "%",
                                  opacity: w.studySeconds ? 0.8 : 0.18,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <section className="section">
                        <div className="section-heading">
                          <h2>
                            Deine Lernpfade <span>{w.courses.length}</span>
                          </h2>
                          <button
                            className="text-button"
                            onClick={() => go("courses")}
                          >
                            Alle Kurse ansehen <ArrowRight size={15} />
                          </button>
                        </div>
                        {w.courses.length ? (
                          <div className="course-grid">
                            {w.courses.slice(0, 4).map((c) => courseCard(c))}
                          </div>
                        ) : (
                          <div className="start-course-card">
                            <div className="start-illustration">
                              <Files size={36} />
                              <span>
                                <Sparkles size={17} />
                              </span>
                            </div>
                            <div>
                              <span className="small-label">
                                PLATZ FÜR DEINE NEUGIER
                              </span>
                              <h3>Dein erster Lernpfad wartet auf dich.</h3>
                              <p>
                                Lade eine Zusammenfassung, ein Skript oder deine
                                Vorlesungsfolien hoch.
                                <br />
                                Dein KI-Tutor macht daraus einen persönlichen
                                Lernkurs.
                              </p>
                              <button
                                className="text-button purple-text"
                                onClick={() =>
                                  requireAccount(() => setUpload(true))
                                }
                              >
                                Unterlagen hinzufügen <ArrowRight size={16} />
                              </button>
                            </div>
                            <div className="format-stack">
                              <span>PDF</span>
                              <span>DOCX</span>
                              <span>PPTX</span>
                            </div>
                          </div>
                        )}
                      </section>
                      <section className="section">
                        <div className="section-heading">
                          <h2>Dein nächster Schritt</h2>
                          <span className="muted small">
                            Einfach anfangen. Weiter wachsen.
                          </span>
                        </div>
                        <div className="steps-row">
                          {[
                            {
                              icon: Upload,
                              title: "Unterlagen hochladen",
                              text: "Alles Wichtige an einem Ort.",
                            },
                            {
                              icon: Sparkles,
                              title: "Deinen Lernpfad entdecken",
                              text: "Von der KI für dich strukturiert.",
                            },
                            {
                              icon: Trophy,
                              title: "Wissen, das bleibt",
                              text: "Verstehen. Üben. Über dich hinauswachsen.",
                            },
                          ].map((s, i) => (
                            <button
                              className="step-card"
                              key={s.title}
                              onClick={() =>
                                i === 0
                                  ? requireAccount(() => setUpload(true))
                                  : go(i === 1 ? "courses" : "review")
                              }
                            >
                              <span className={"step-icon step-" + i}>
                                <s.icon size={20} />
                              </span>
                              <span className="step-number">0{i + 1}</span>
                              <h4>{s.title}</h4>
                              <p>{s.text}</p>
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>
                    <aside className="dashboard-side">
                      <section className="daily-card">
                        <div className="section-heading">
                          <h3>Dein Tagesziel</h3>
                          <span className="stat-icon amber small-icon">
                            <Flame size={17} />
                          </span>
                        </div>
                        <div
                          className="daily-ring"
                          style={{
                            background: `conic-gradient(#8b72d9 ${Math.min(100, (todayXP / w.preferences.dailyGoal) * 100)}%, var(--line) 0)`,
                          }}
                        >
                          <div>
                            <Zap size={21} />
                            <strong>
                              {todayXP}
                              <small> / {w.preferences.dailyGoal}</small>
                            </strong>
                            <span>XP gesammelt</span>
                          </div>
                        </div>
                        <h4>
                          {todayXP >= w.preferences.dailyGoal
                            ? "Ziel erreicht. Stark gemacht!"
                            : "Heute ist dein Tag."}
                        </h4>
                        <p>
                          {todayXP
                            ? "Jeder Schritt bringt dich weiter."
                            : "Ein kleiner Anfang ist schon Fortschritt."}
                        </p>
                        <div className="week-days">
                          {Array.from({ length: 7 }, (_, i) => {
                            const date = new Date();
                            const day = (date.getUTCDay() + 6) % 7;
                            date.setUTCDate(date.getUTCDate() - day + i);
                            const done = w.attempts.some(
                              (a) =>
                                a.at.slice(0, 10) ===
                                date.toISOString().slice(0, 10),
                            );
                            return (
                              <div key={i}>
                                <span>
                                  {["M", "D", "M", "D", "F", "S", "S"][i]}
                                </span>
                                <i
                                  className={
                                    done ? "done" : day === i ? "today" : ""
                                  }
                                >
                                  {done ? (
                                    <Check size={13} />
                                  ) : day === i ? (
                                    <span />
                                  ) : null}
                                </i>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                      <section className="tutor-card">
                        <div className="tutor-avatar">
                          <Sparkles size={23} />
                          <span />
                        </div>
                        <span className="small-label">
                          ZUSAMMEN WIRD’S LEICHTER
                        </span>
                        <h3>
                          Dein Aha-Moment
                          <br />
                          ist nur eine Frage entfernt.
                        </h3>
                        <p>
                          Etwas noch nicht ganz verstanden?
                          <br />
                          Dein KI-Tutor nimmt sich Zeit für dich.
                        </p>
                        <button
                          className="button outline"
                          onClick={() =>
                            requireAccount(() => {
                              if (course) setTutor(true);
                              else {
                                go("documents");
                                setToast("Lade zuerst deine Unterlagen hoch.");
                              }
                            })
                          }
                        >
                          Frag deinen KI-Tutor <ArrowUpRight size={16} />
                        </button>
                        <div className="tutor-powered">
                          <span /> MIT DEINEN UNTERLAGEN VERBUNDEN
                        </div>
                      </section>
                      <section className="review-nudge">
                        <span className="stat-icon mint">
                          <RotateCcw size={20} />
                        </span>
                        <div>
                          <h4>Bleib im Kopf.</h4>
                          <p>
                            {due
                              ? `${due} Themen sind bereit für eine Wiederholung.`
                              : "Wiederholen zur richtigen Zeit macht den Unterschied."}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => go("review")}
                          >
                            Zur Wiederholung <ArrowRight size={14} />
                          </button>
                        </div>
                      </section>
                      <p className="side-quote">
                        „Lernen ist Erfahrung.
                        <br />
                        Alles andere ist einfach nur Information.“
                        <span>ALBERT EINSTEIN</span>
                      </p>
                    </aside>
                  </div>
                </>
              )}
              {view === "documents" && (
                <>
                  {account && (
                    <CourseTransfer
                      documents={w.documents}
                      onImported={async (id) => {
                        await reload();
                        setCourseId(id);
                        go("courses");
                      }}
                    />
                  )}

                  <div className="info-banner">
                    <span className="stat-icon lilac">
                      <Sparkles size={21} />
                    </span>
                    <div>
                      <strong>
                        Deine Unterlagen werden zu deinem Lernpfad.
                      </strong>
                      <p>
                        PDF, Word, PowerPoint, Text und Bilder. Bis zu 10
                        Dateien gleichzeitig, je 25 MB.
                      </p>
                    </div>
                    <span className="privacy-tag">
                      <LockKeyhole size={13} /> Nur für dich
                    </span>
                  </div>
                  {!w.documents.length ? (
                    <Empty
                      icon={Files}
                      title="Hier beginnt dein Wissen."
                      description="Lade deine ersten Unterlagen hoch. Die KI erkennt Themen und erstellt Erklärungen, Übungen und Kapitel."
                      action={() => requireAccount(() => setUpload(true))}
                      label="Erste Dokumente hochladen"
                    />
                  ) : (
                    <div className="panel document-list">
                      <div className="list-header">
                        <span>Dokument</span>
                        <span>Status</span>
                        <span>Hinzugefügt</span>
                        <span />
                      </div>
                      {w.documents.map((d: any) => (
                        <div className="document-row" key={d.id}>
                          <span
                            className={
                              "file-icon " +
                              (d.originalName.endsWith("pdf")
                                ? "rose"
                                : "lilac")
                            }
                          >
                            <FileText size={22} />
                          </span>
                          <button
                            className="document-name"
                            onClick={() =>
                              perform("Dokument öffnen", async () =>
                                setDocPreview(await api("document?id=" + d.id)),
                              )
                            }
                          >
                            <strong>{d.name}</strong>
                            <small>
                              {(d.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                              {d.pageCount || 0} Seiten / Folien
                            </small>
                          </button>
                          <div className="doc-status">
                            {d.status === "ready" ? (
                              <span className="pill green">
                                <Check size={12} /> Bereit
                              </span>
                            ) : d.status === "error" ? (
                              <span
                                className={
                                  "pill " +
                                  (d.extractedAt &&
                                  d.error?.includes("OPENAI_API_KEY")
                                    ? "amber"
                                    : "red")
                                }
                              >
                                {d.extractedAt &&
                                d.error?.includes("OPENAI_API_KEY")
                                  ? "Text bereit · Kurs ausstehend"
                                  : "Fehler"}
                              </span>
                            ) : (
                              <>
                                <span className="pill purple">
                                  <LoaderCircle size={12} className="spin" />
                                  {d.progress}% · Analyse
                                </span>
                                <Progress value={d.progress} />
                              </>
                            )}
                            {d.error && (
                              <p>
                                {d.extractedAt &&
                                d.error?.includes("OPENAI_API_KEY")
                                  ? "Dein Text ist gespeichert. Du kannst ihn oben als Lernauftrag für ChatGPT exportieren und den fertigen Kurs wieder importieren."
                                  : d.error}
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    perform("Neu starten", async () => {
                                      await api("retry", { id: d.id });
                                      await reload();
                                    })
                                  }
                                >
                                  Erneut versuchen
                                </button>
                              </p>
                            )}
                          </div>
                          <span className="small muted">
                            {new Date(d.createdAt).toLocaleDateString("de-DE")}
                          </span>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label="Umbenennen"
                              onClick={() => {
                                const name = prompt(
                                  "Neuer Dokumentname",
                                  d.name,
                                );
                                if (name)
                                  perform("Umbenennen", async () => {
                                    await api(
                                      "document?id=" + d.id,
                                      { name },
                                      "PATCH",
                                    );
                                    await reload();
                                  });
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <a
                              className="icon-button"
                              aria-label="Original herunterladen"
                              href={"/api/document?id=" + d.id + "&download=1"}
                            >
                              <Download size={15} />
                            </a>
                            <button
                              className="icon-button danger"
                              aria-label="Löschen"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Dokument und Originaldatei löschen? Vorhandene Lerninhalte bleiben erhalten; ihre Quellen sind danach nicht mehr abrufbar.",
                                  )
                                )
                                  perform("Löschen", async () => {
                                    await api(
                                      "document?id=" + d.id,
                                      {},
                                      "DELETE",
                                    );
                                    await reload();
                                  });
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="help-caption">
                    <LockKeyhole size={14} /> Deine Originaldateien und
                    Lernfortschritte bleiben in deinem privaten Arbeitsbereich
                    gespeichert.
                  </div>
                </>
              )}
              {view === "courses" && (
                <>
                  {!w.courses.length ? (
                    <Empty
                      icon={GraduationCap}
                      title="Wissen bekommt einen roten Faden."
                      description="Sobald deine Dokumente analysiert sind, findest du hier deine Kurse mit Kapiteln und persönlichen Lernlevels."
                      action={() => requireAccount(() => setUpload(true))}
                      label="Lernkurs erstellen"
                    />
                  ) : (
                    <>
                      <div className="course-grid all-courses">
                        {w.courses.map((c) => courseCard(c))}
                      </div>
                      <div className="section-heading">
                        <h2>Deine Kapitel im Überblick</h2>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => {
                            if (
                              course &&
                              confirm(
                                "Kurs aus allen verknüpften Dokumenten neu strukturieren? Bestehende Kapitel und ihre Zuordnung zum Lernfortschritt werden ersetzt; Antwortverlauf bleibt erhalten.",
                              )
                            )
                              perform(
                                "Kurs wird neu strukturiert",
                                async () => {
                                  await api("course/regenerate", {
                                    id: course.id,
                                  });
                                  await reload();
                                  setToast(
                                    "Kurs aus allen Unterlagen neu erstellt.",
                                  );
                                },
                              );
                          }}
                        >
                          <Sparkles size={14} /> Neu generieren
                        </button>
                        <select
                          value={course?.id}
                          onChange={(e) => {
                            setCourseId(e.target.value);
                            setChapterId("");
                          }}
                        >
                          {w.courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      {course && (
                        <div className="panel chapter-list">
                          {course.chapters.map((ch, i) => (
                            <div className="chapter-row" key={ch.id}>
                              <span
                                className={
                                  "chapter-number " +
                                  ((w.mastery[ch.id]?.score || 0) >=
                                  w.preferences.thresholds[1]
                                    ? "completed"
                                    : "")
                                }
                              >
                                {(w.mastery[ch.id]?.score || 0) >=
                                w.preferences.thresholds[1] ? (
                                  <Check size={18} />
                                ) : (
                                  String(i + 1).padStart(2, "0")
                                )}
                              </span>
                              <button
                                className="chapter-info"
                                onClick={() => openLesson(course, ch)}
                              >
                                {ch.parentTitle && (
                                  <small>{ch.parentTitle}</small>
                                )}
                                <strong>{ch.title}</strong>
                                <span>
                                  {ch.questions.length} Aufgaben ·{" "}
                                  {w.mastery[ch.id]?.score || 0}% Beherrschung
                                </span>
                                <Progress
                                  value={w.mastery[ch.id]?.score || 0}
                                />
                              </button>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  title="Nach oben"
                                  disabled={i === 0}
                                  onClick={() =>
                                    perform("Sortieren", async () => {
                                      const ids = course.chapters.map(
                                        (c) => c.id,
                                      );
                                      [ids[i - 1], ids[i]] = [
                                        ids[i],
                                        ids[i - 1],
                                      ];
                                      await api(
                                        "course",
                                        { id: course.id, chapters: ids },
                                        "PATCH",
                                      );
                                      await reload();
                                    })
                                  }
                                >
                                  <MoveUp size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  title="Nach unten"
                                  disabled={i === course.chapters.length - 1}
                                  onClick={() =>
                                    perform("Sortieren", async () => {
                                      const ids = course.chapters.map(
                                        (c) => c.id,
                                      );
                                      [ids[i], ids[i + 1]] = [
                                        ids[i + 1],
                                        ids[i],
                                      ];
                                      await api(
                                        "course",
                                        { id: course.id, chapters: ids },
                                        "PATCH",
                                      );
                                      await reload();
                                    })
                                  }
                                >
                                  <MoveDown size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  title="Kapitel umbenennen"
                                  onClick={() => {
                                    const title = prompt(
                                      "Kapitel umbenennen",
                                      ch.title,
                                    );
                                    if (title)
                                      perform("Umbenennen", async () => {
                                        await api(
                                          "course",
                                          {
                                            id: course.id,
                                            chapterId: ch.id,
                                            chapterTitle: title,
                                          },
                                          "PATCH",
                                        );
                                        await reload();
                                      });
                                  }}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="button subtle"
                                  onClick={() => openLesson(course, ch)}
                                >
                                  Level öffnen <ArrowRight size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {view === "learn" &&
                (!course || !chapter ? (
                  <Empty
                    icon={BookOpen}
                    title="Dein nächstes Aha-Erlebnis wartet."
                    description="Erstelle zuerst einen Kurs aus deinen Unterlagen. Hier kannst du dann frei zwischen allen Kapiteln wählen."
                    action={() => requireAccount(() => setUpload(true))}
                    label="Unterlagen hochladen"
                  />
                ) : (
                  <div className="learn-layout">
                    <aside className="panel lesson-sidebar">
                      <span className="small-label">DEIN LERNPFAD</span>
                      <select
                        value={course.id}
                        onChange={(e) => {
                          setCourseId(e.target.value);
                          setChapterId("");
                        }}
                      >
                        {w.courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                      {course.chapters.map((ch, i) => (
                        <button
                          key={ch.id}
                          className={
                            "lesson-link " +
                            (chapter.id === ch.id ? "selected" : "")
                          }
                          onClick={() => setChapterId(ch.id)}
                        >
                          <span>{i + 1}</span>
                          <div>
                            {ch.parentTitle && <small>{ch.parentTitle}</small>}
                            <strong>{ch.title}</strong>
                            <small>
                              {w.mastery[ch.id]?.score || 0}% beherrscht
                            </small>
                          </div>
                          {(w.mastery[ch.id]?.score || 0) >=
                            w.preferences.thresholds[1] && <Check size={15} />}
                        </button>
                      ))}
                      <p className="small muted">
                        Alle Kapitel sind frei zugänglich. Du bestimmst dein
                        Tempo.
                      </p>
                    </aside>
                    <div className="lesson-content">
                      <div className="panel lesson-head">
                        <div className="lesson-title">
                          <span className="pill purple">
                            LEVEL{" "}
                            {course.chapters.findIndex(
                              (c) => c.id === chapter.id,
                            ) + 1}
                          </span>
                          <span className="muted small">
                            {w.mastery[chapter.id]?.score || 0}% Beherrschung
                          </span>
                        </div>
                        <h2>{chapter.title}</h2>
                        <Progress value={w.mastery[chapter.id]?.score || 0} />
                        {chapter.parentTitle && (
                          <p className="small muted">{chapter.parentTitle}</p>
                        )}
                        <div className="phase-path">
                          {[
                            "Verstehen",
                            "Grundlagen",
                            "Anwenden",
                            "Vertiefen",
                            "Abschlusstest",
                          ].map((name, i) => (
                            <button
                              key={name}
                              className={phase === i + 1 ? "selected" : ""}
                              onClick={() => {
                                setPhase(i + 1);
                                setForcedQuestionId("");
                                setScope("chapter");
                                setMethod("mixed");
                                setDifficulty(
                                  i === 1 ? "1" : i === 3 ? "3" : "adaptive",
                                );
                                setTab(i === 0 ? "explain" : "practice");
                              }}
                            >
                              <span>
                                {(w.phases?.[chapter.id] || 0) >= i + 1 ? (
                                  <Check size={12} />
                                ) : (
                                  i + 1
                                )}
                              </span>
                              {name}
                            </button>
                          ))}
                        </div>
                        {phase > 0 && phase < 5 && (
                          <button
                            className="text-button"
                            onClick={() =>
                              perform("Lernphase speichern", async () => {
                                await api("phase", {
                                  courseId: course.id,
                                  chapterId: chapter.id,
                                  phase,
                                });
                                await reload();
                                setPhase(phase + 1);
                                setTab("practice");
                                setMethod("mixed");
                                setDifficulty(
                                  phase === 1
                                    ? "1"
                                    : phase === 3
                                      ? "3"
                                      : "adaptive",
                                );
                              })
                            }
                          >
                            Phase {phase} abschließen und weiter{" "}
                            <ArrowRight size={13} />
                          </button>
                        )}
                        {phase === 5 && (
                          <button
                            className="button primary"
                            disabled={!chapter.questions.length || !!busy}
                            onClick={() =>
                              perform(
                                "Kapitelprüfung vorbereiten",
                                async () => {
                                  const e = await api("exam/create", {
                                    courseId: course.id,
                                    chapterIds: [chapter.id],
                                    count: Math.min(
                                      5,
                                      chapter.questions.length,
                                    ),
                                    duration: 15,
                                    pass: 70,
                                    hints: false,
                                  });
                                  await reload();
                                  setExamId(e.id);
                                  go("exams");
                                },
                              )
                            }
                          >
                            <ClipboardCheck size={16} /> Kapitelprüfung starten
                          </button>
                        )}
                        <div className="tabs">
                          {[
                            ["explain", "Verstehen"],
                            ["practice", "Üben"],
                            ["notes", "Meine Notizen"],
                          ].map(([id, title]) => (
                            <button
                              className={tab === id ? "active" : ""}
                              key={id}
                              onClick={() => setTab(id as any)}
                            >
                              {title}
                            </button>
                          ))}
                        </div>
                      </div>
                      {tab === "explain" && (
                        <div className="panel lesson-body">
                          <div className="lesson-adapt">
                            <label>
                              Erklärniveau
                              <select
                                value={explainLevel || w.preferences.difficulty}
                                onChange={(e) =>
                                  setExplainLevel(e.target.value)
                                }
                              >
                                {[
                                  "Sehr einfach",
                                  "Normal",
                                  "Fortgeschritten",
                                  "Universitätsniveau",
                                ].map((level) => (
                                  <option key={level}>{level}</option>
                                ))}
                              </select>
                            </label>
                            <button
                              className="button subtle"
                              disabled={!!busy}
                              onClick={() =>
                                perform(
                                  "Erklärung wird angepasst",
                                  async () => {
                                    await api("lesson/adapt", {
                                      courseId: course.id,
                                      chapterId: chapter.id,
                                      level:
                                        explainLevel ||
                                        w.preferences.difficulty,
                                    });
                                    await reload();
                                    setToast(
                                      "Erklärung angepasst und gespeichert.",
                                    );
                                  },
                                )
                              }
                            >
                              <Sparkles size={15} /> Erklärung anpassen
                            </button>
                          </div>
                          <div className="lesson-intro">
                            <Sparkles size={20} />
                            <Markdown>{lesson!.introduction}</Markdown>
                          </div>
                          <h3>Schritt für Schritt verstehen</h3>
                          <Markdown>{lesson!.explanation}</Markdown>
                          <div className="definition-box">
                            <h4>
                              <BookOpen size={17} /> Wichtige Begriffe
                            </h4>
                            <Markdown>{lesson!.definitions}</Markdown>
                          </div>
                          <h3>Ein Beispiel macht’s leichter</h3>
                          <Markdown>{lesson!.example}</Markdown>
                          <div className="summary-box">
                            <h4>
                              <Leaf size={18} /> Das nimmst du mit
                            </h4>
                            <Markdown>{lesson!.summary}</Markdown>
                          </div>
                          {sourceBlock(lesson!.sources)}
                          <div className="lesson-footer">
                            <button
                              className="button outline"
                              onClick={() => setTutor(true)}
                            >
                              <MessageCircle size={16} /> Noch eine Frage?
                            </button>
                            <button
                              className="button primary"
                              onClick={() => setTab("practice")}
                            >
                              Jetzt ausprobieren <ArrowRight size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                      {tab === "practice" && (
                        <>
                          <div className="panel learning-controls">
                            <label>
                              Lerninhalt
                              <select
                                value={scope}
                                onChange={(e) => {
                                  setScope(e.target.value);
                                  setPhase(0);
                                  setQIndex(0);
                                  setResult(null);
                                  setForcedQuestionId("");
                                }}
                              >
                                <option value="chapter">
                                  Aktuelles Unterkapitel
                                </option>
                                <option value="course">
                                  Gesamter Kurs / alle Dokumente
                                </option>
                                <option value="selected">
                                  Mehrere Kapitel auswählen
                                </option>
                              </select>
                            </label>
                            {scope === "selected" && (
                              <div className="chapter-chips">
                                {course.chapters.map((ch) => (
                                  <button
                                    key={ch.id}
                                    className={
                                      selectedChapters.includes(ch.id)
                                        ? "selected"
                                        : ""
                                    }
                                    onClick={() =>
                                      setSelectedChapters(
                                        selectedChapters.includes(ch.id)
                                          ? selectedChapters.filter(
                                              (id) => id !== ch.id,
                                            )
                                          : [...selectedChapters, ch.id],
                                      )
                                    }
                                  >
                                    {ch.title}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              className="text-button"
                              onClick={() => {
                                setPhase(0);
                                setTab("explain");
                              }}
                            >
                              Nur Erklärungen <BookOpen size={14} />
                            </button>
                          </div>
                          <div className="panel learning-controls">
                            <label>
                              Lernmethode
                              <select
                                value={method}
                                onChange={(e) => {
                                  setMethod(e.target.value);
                                  setPhase(0);
                                }}
                              >
                                <option value="mixed">Gemischte Übungen</option>
                                {Object.entries(typeNames).map(([id, name]) => (
                                  <option value={id} key={id}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Schwierigkeit
                              <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value)}
                              >
                                <option value="adaptive">
                                  Adaptiv ·{" "}
                                  {["Leicht", "Mittel", "Schwer"][adaptive - 1]}
                                </option>
                                <option value="1">Leicht</option>
                                <option value="2">Mittel</option>
                                <option value="3">Schwer</option>
                                <option value="mixed">Gemischt</option>
                              </select>
                            </label>
                            <label>
                              Umfang
                              <select
                                value={count}
                                onChange={(e) =>
                                  setCount(Number(e.target.value))
                                }
                              >
                                {![5, 10, 20, 50].includes(count) && (
                                  <option value={count}>
                                    {count} Fragen (eigene Anzahl)
                                  </option>
                                )}
                                {[5, 10, 20, 50].map((n) => (
                                  <option key={n} value={n}>
                                    {n} Fragen
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={onlyErrors}
                                onChange={(e) =>
                                  setOnlyErrors(e.target.checked)
                                }
                              />
                              Nur meine Fehler
                            </label>
                            <button
                              className="button subtle"
                              disabled={!!busy}
                              onClick={() =>
                                perform(
                                  "Neue Aufgaben werden erstellt",
                                  async () => {
                                    await api("questions/generate", {
                                      courseId: course.id,
                                      chapterId: chapter.id,
                                      count,
                                      method: phase === 3 ? "cloze" : method,
                                      difficulty:
                                        difficulty === "adaptive"
                                          ? String(adaptive)
                                          : difficulty,
                                    });
                                    await reload();
                                    setToast("Neue Aufgaben sind bereit.");
                                    setQIndex(0);
                                  },
                                )
                              }
                            >
                              <Sparkles size={15} /> Neue Varianten
                            </button>
                          </div>
                          <label className="custom-count">
                            Eigene Fragenanzahl (1–50)
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={count}
                              onChange={(e) =>
                                setCount(
                                  Math.max(
                                    1,
                                    Math.min(50, Number(e.target.value) || 1),
                                  ),
                                )
                              }
                            />
                          </label>
                          {activeQuestion ? (
                            <div className="panel question-card">
                              <div className="question-top">
                                <span className="pill purple">
                                  {typeNames[activeQuestion.type]}
                                </span>
                                <span>
                                  {(qIndex %
                                    Math.max(
                                      1,
                                      Math.min(count, ordered.length),
                                    )) +
                                    1}{" "}
                                  /{" "}
                                  {Math.max(1, Math.min(count, ordered.length))}{" "}
                                  <span className="question-xp">
                                    +{activeQuestion.difficulty === 3 ? 20 : 10}{" "}
                                    XP
                                  </span>
                                </span>
                              </div>
                              <Progress
                                value={
                                  ((qIndex %
                                    Math.max(
                                      1,
                                      Math.min(count, ordered.length),
                                    )) /
                                    Math.max(
                                      1,
                                      Math.min(count, ordered.length),
                                    )) *
                                  100
                                }
                              />
                              <h2>
                                <Markdown inline>
                                  {activeQuestion.prompt}
                                </Markdown>
                              </h2>
                              <AnswerInput
                                question={activeQuestion}
                                value={answer}
                                onChange={setAnswer}
                                disabled={!!result}
                              />
                              {result && (
                                <div
                                  className={
                                    "feedback " +
                                    (result.correct ? "correct" : "incorrect")
                                  }
                                >
                                  <h4>
                                    {result.correct ? (
                                      <CircleCheck size={20} />
                                    ) : (
                                      <CircleHelp size={20} />
                                    )}{" "}
                                    {result.correct
                                      ? "Gut gemacht!"
                                      : "Aus Fehlern wird Verständnis."}{" "}
                                    {result.xp > 0 && (
                                      <span>+{result.xp} XP</span>
                                    )}
                                  </h4>
                                  <Markdown>{result.feedback}</Markdown>
                                  {!result.correct && (
                                    <div className="follow-up">
                                      {followUp?.followUpId ? (
                                        <>
                                          <Sparkles size={15} /> Eine neue
                                          Aufgabe zu diesem Prinzip ist bereit.
                                          „Nächste Aufgabe“ öffnet sie.
                                        </>
                                      ) : followUp?.remediationError ? (
                                        <>
                                          <AlertCircle size={15} />
                                          {followUp.remediationError}
                                        </>
                                      ) : configured ? (
                                        <>
                                          <LoaderCircle
                                            size={15}
                                            className="spin"
                                          />{" "}
                                          Der Tutor erstellt eine ähnliche
                                          Aufgabe mit anderer Formulierung.
                                        </>
                                      ) : null}
                                    </div>
                                  )}
                                  {sourceBlock(activeQuestion.sources)}
                                  <p className="recommendation">
                                    {result.mastery?.score >=
                                    w.preferences.thresholds[1]
                                      ? "Du beherrschst die Grundlagen. Probiere schwierigere Aufgaben oder eine Kapitelprüfung."
                                      : "Nimm dir Zeit. Eine neue Variante oder ein weiteres Beispiel hilft beim Verstehen."}
                                  </p>
                                  {!result.correct && (
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        setTutor(true);
                                        setChatText(
                                          `Ich habe bei „${activeQuestion.prompt}“ mit „${answer}“ geantwortet. Erkläre meinen Denkfehler und zeige mir ein anderes Beispiel.`,
                                        );
                                      }}
                                    >
                                      Denkfehler mit dem Tutor besprechen{" "}
                                      <ArrowUpRight size={14} />
                                    </button>
                                  )}
                                </div>
                              )}
                              <div className="question-footer">
                                <button
                                  className="text-button"
                                  onClick={nextQuestion}
                                >
                                  Überspringen
                                </button>
                                {result ? (
                                  <button
                                    className="button primary"
                                    onClick={nextQuestion}
                                  >
                                    Nächste Aufgabe <ArrowRight size={16} />
                                  </button>
                                ) : (
                                  <button
                                    className="button primary"
                                    disabled={!answer.trim() || !!busy}
                                    onClick={sendAnswer}
                                  >
                                    {busy ? (
                                      <LoaderCircle
                                        size={16}
                                        className="spin"
                                      />
                                    ) : (
                                      <Check size={16} />
                                    )}
                                    Antwort prüfen
                                  </button>
                                )}
                              </div>
                              <div className="question-admin">
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    perform("Frage öffnen", async () => {
                                      setEditing(
                                        await api(
                                          "question?courseId=" +
                                            course.id +
                                            "&chapterId=" +
                                            questionChapter!.id +
                                            "&id=" +
                                            activeQuestion.id,
                                        ),
                                      );
                                    })
                                  }
                                >
                                  Frage bearbeiten <Pencil size={12} />
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    if (confirm("Diese Aufgabe löschen?"))
                                      perform("Löschen", async () => {
                                        await api(
                                          "question",
                                          {
                                            courseId: course.id,
                                            chapterId: questionChapter!.id,
                                            id: activeQuestion.id,
                                          },
                                          "DELETE",
                                        );
                                        nextQuestion();
                                        await reload();
                                      });
                                  }}
                                >
                                  Entfernen <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <Empty
                              title="Hier ist Platz für neue Aufgaben."
                              description="Für diese Auswahl gibt es noch keine Fragen. Wähle einen anderen Filter oder lasse neue Varianten generieren."
                            />
                          )}
                          <CustomQuestion
                            course={course}
                            chapter={chapter}
                            onSave={async (question) => {
                              await api("question", {
                                courseId: course.id,
                                chapterId: chapter.id,
                                question,
                              });
                              await reload();
                              setToast("Eigene Aufgabe gespeichert.");
                            }}
                          />
                        </>
                      )}
                      {tab === "notes" && (
                        <div className="panel lesson-body">
                          <h3>Platz für deine Gedanken</h3>
                          <p className="muted">
                            Halte Aha-Momente, Merksätze und offene Fragen fest.
                          </p>
                          <textarea
                            rows={15}
                            value={note}
                            placeholder="Was möchtest du dir merken?"
                            onChange={(e) => {
                              noteDirty.current = true;
                              setNote(e.target.value);
                            }}
                            onBlur={() => {
                              void api("note", {
                                courseId: course.id,
                                chapterId: chapter.id,
                                content: note,
                              })
                                .then(() => setToast("Notiz gespeichert."))
                                .catch((e) => setError(e.message));
                            }}
                          />
                          <div className="lesson-footer">
                            <span className="small muted">
                              Wird während des Schreibens automatisch
                              gespeichert.
                            </span>
                            <button
                              className="button primary"
                              onClick={() =>
                                perform("Speichern", async () => {
                                  await api("note", {
                                    courseId: course.id,
                                    chapterId: chapter.id,
                                    content: note,
                                  });
                                  await reload();
                                  setToast("Notiz gespeichert.");
                                })
                              }
                            >
                              Notiz speichern
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {view === "review" && (
                <>
                  <div className="review-stats">
                    <div className="panel">
                      <RotateCcw size={23} />
                      <strong>{due}</strong>
                      <span>Fällige Themen</span>
                    </div>
                    <div className="panel">
                      <CircleHelp size={23} />
                      <strong>{errorIds.size}</strong>
                      <span>Noch offene Fehler</span>
                    </div>
                    <div className="panel">
                      <Layers size={23} />
                      <strong>
                        {
                          w.courses
                            .flatMap((c) => c.chapters)
                            .flatMap((c) => c.questions)
                            .filter((q) => q.type === "flashcard").length
                        }
                      </strong>
                      <span>Karteikarten</span>
                    </div>
                  </div>
                  <div className="section-heading">
                    <h2>Das lohnt sich zu wiederholen</h2>
                    <span className="muted small">
                      Spaced Repetition · passend zu deinem Fortschritt
                    </span>
                  </div>
                  {w.courses
                    .flatMap((c) =>
                      c.chapters.map((ch) => ({ c, ch, m: w.mastery[ch.id] })),
                    )
                    .filter(({ m }) => m)
                    .sort((a, b) => a.m.score - b.m.score)
                    .map(({ c, ch, m }) => (
                      <div className="panel review-row" key={ch.id}>
                        <span className="stat-icon lilac">
                          <RotateCcw size={21} />
                        </span>
                        <div>
                          <h3>{ch.title}</h3>
                          <p>
                            {c.title} · {m.score}% Beherrschung ·{" "}
                            {new Date(m.due) <= new Date()
                              ? "Jetzt fällig"
                              : "Fällig am " +
                                new Date(m.due).toLocaleDateString("de-DE")}
                          </p>
                          <Progress value={m.score} />
                        </div>
                        <button
                          className="button outline"
                          onClick={() => {
                            setOnlyErrors(false);
                            setMethod("mixed");
                            openLesson(c, ch, true);
                          }}
                        >
                          Wiederholen <ArrowRight size={16} />
                        </button>
                      </div>
                    ))}
                  {!Object.keys(w.mastery).length && (
                    <Empty
                      icon={Leaf}
                      title="Was du verstehst, bleibt."
                      description="Sobald du Aufgaben beantwortest, planen wir passende Wiederholungen. Fehler und Stärken werden automatisch gespeichert."
                    />
                  )}
                  {errorIds.size > 0 && (
                    <button
                      className="button primary"
                      onClick={() => {
                        const a = w.attempts.find((a) =>
                          errorIds.has(a.questionId),
                        );
                        const c = w.courses.find((c) => c.id === a?.courseId);
                        if (c) {
                          setOnlyErrors(true);
                          setMethod("mixed");
                          openLesson(
                            c,
                            c.chapters.find((ch) => ch.id === a?.chapterId),
                            true,
                          );
                        }
                      }}
                    >
                      Meine Fehler gezielt üben <ArrowRight size={16} />
                    </button>
                  )}
                </>
              )}
              {view === "exams" && (
                <>
                  {currentExam ? (
                    <ExamSession
                      key={currentExam.id}
                      onRepeat={() =>
                        perform("Prüfung wiederholen", async () => {
                          const r = await api("exam/repeat", {
                            id: currentExam.id,
                          });
                          await reload();
                          setExamId(r.id);
                        })
                      }
                      exam={currentExam}
                      busy={!!busy}
                      now={now}
                      onBack={() => setExamId("")}
                      onSave={async (answers) => {
                        await api("exam/save", { id: currentExam.id, answers });
                      }}
                      onSubmit={(answers) =>
                        perform("Prüfung wird ausgewertet", async () => {
                          await api("exam/submit", {
                            id: currentExam.id,
                            answers,
                          });
                          await reload();
                          setToast("Deine Prüfung ist ausgewertet.");
                        })
                      }
                    />
                  ) : (
                    <>
                      <ExamCreator
                        courses={w.courses}
                        busy={!!busy}
                        onCreate={(settings) =>
                          perform("Prüfung vorbereiten", async () => {
                            const r = await api("exam/create", settings);
                            await reload();
                            setExamId(r.id);
                          })
                        }
                      />
                      <div className="section-heading">
                        <h2>Deine Prüfungen</h2>
                        <span className="small muted">
                          Ergebnisse bleiben gespeichert
                        </span>
                      </div>
                      {w.exams.length ? (
                        <div className="panel">
                          {[...w.exams].reverse().map((e) => (
                            <div className="exam-row" key={e.id}>
                              <span className="stat-icon lilac">
                                <ClipboardCheck size={22} />
                              </span>
                              <div>
                                <h3>{e.title}</h3>
                                <p>
                                  {new Date(e.startedAt).toLocaleDateString(
                                    "de-DE",
                                  )}{" "}
                                  · {e.questions.length} Fragen ·{" "}
                                  {Math.round(e.duration / 60)} Minuten
                                </p>
                              </div>
                              <span
                                className={
                                  "pill " +
                                  (e.status === "active"
                                    ? "purple"
                                    : (e.score || 0) >= e.pass
                                      ? "green"
                                      : "red")
                                }
                              >
                                {e.status === "active"
                                  ? "In Bearbeitung"
                                  : e.score + "%"}
                              </span>
                              <button
                                className="button outline"
                                onClick={() => setExamId(e.id)}
                              >
                                {e.status === "active"
                                  ? "Fortsetzen"
                                  : "Auswertung"}{" "}
                                <ArrowRight size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={ClipboardCheck}
                          title="Bereit, dein Wissen zu testen?"
                          description="Wähle deinen Kurs und erstelle eine Prüfung. Lösungen werden erst nach der Abgabe angezeigt."
                        />
                      )}
                    </>
                  )}
                </>
              )}
              {view === "statistics" && (
                <>
                  <div className="stats-overview">
                    {[
                      { name: "Gesammelte XP", value: xp, icon: Zap },
                      {
                        name: "Beantwortete Fragen",
                        value: w.attempts.length,
                        icon: CheckCheck,
                      },
                      {
                        name: "Erfolgsquote",
                        value:
                          (w.attempts.length
                            ? Math.round((correct / w.attempts.length) * 100)
                            : 0) + "%",
                        icon: Target,
                      },
                      {
                        name: "Lernzeit",
                        value: Math.round(w.studySeconds / 60) + " Min.",
                        icon: Clock3,
                      },
                    ].map((s) => (
                      <div className="panel metric" key={s.name}>
                        <span className="stat-icon lilac">
                          <s.icon size={22} />
                        </span>
                        <strong>{s.value}</strong>
                        <span>{s.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="stats-columns">
                    <section className="panel chart-panel">
                      <div className="section-heading">
                        <h3>Deine letzten 7 Tage</h3>
                        <span className="pill purple">XP</span>
                      </div>
                      <div className="activity-chart">
                        {Array.from({ length: 7 }, (_, i) => {
                          const date = new Date();
                          date.setUTCDate(date.getUTCDate() - 6 + i);
                          const day = date.toISOString().slice(0, 10);
                          const value = w.attempts
                            .filter((a) => a.at.startsWith(day))
                            .reduce((n, a) => n + a.xp, 0);
                          const max = Math.max(
                            100,
                            ...w.attempts.map((a) => a.xp * 5),
                          );
                          return (
                            <div key={i}>
                              <span>{value}</span>
                              <i
                                style={{
                                  height:
                                    Math.max(
                                      3,
                                      Math.min(100, (value / max) * 100),
                                    ) + "%",
                                }}
                              />
                              <small>
                                {date.toLocaleDateString("de-DE", {
                                  weekday: "short",
                                })}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                    <section className="panel chart-panel">
                      <h3>Dein Lernprofil</h3>
                      <div className="badges">
                        {(w.achievements || []).map((id) => (
                          <span key={id} className="pill amber">
                            <Trophy size={12} />
                            {id === "perfect-exam"
                              ? "Perfekte Prüfung"
                              : "Kapitel gemeistert"}
                          </span>
                        ))}
                      </div>
                      <div className="profile-level">
                        <span className="level-emblem">
                          <Trophy size={30} />
                        </span>
                        <div>
                          <span>DEIN AKTUELLES LEVEL</span>
                          <strong>Wissensentdecker · Level {level}</strong>
                          <Progress value={((xp % 250) / 250) * 100} />
                          <small>
                            {250 - (xp % 250)} XP bis Level {level + 1}
                          </small>
                        </div>
                      </div>
                      <div className="profile-stat">
                        <span>Gut beherrschte Kapitel</span>
                        <strong>
                          {
                            Object.values(w.mastery).filter(
                              (m) => m.score >= w.preferences.thresholds[1],
                            ).length
                          }
                        </strong>
                      </div>
                      <div className="profile-stat">
                        <span>Abgeschlossene Prüfungen</span>
                        <strong>
                          {
                            w.exams.filter((e) => e.status === "completed")
                              .length
                          }
                        </strong>
                      </div>
                      <div className="profile-stat">
                        <span>Falsche Antworten</span>
                        <strong>{w.attempts.length - correct}</strong>
                      </div>
                    </section>
                  </div>
                  <section className="panel chart-panel">
                    <div className="section-heading">
                      <h3>Beherrschung nach Kapitel</h3>
                      <button
                        className="button outline"
                        onClick={() =>
                          perform("Export vorbereiten", async () => {
                            const data = await api("export");
                            const blob = new Blob(
                              [JSON.stringify(data, null, 2)],
                              { type: "application/json" },
                            );
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "lernpfad-ergebnisse.json";
                            a.click();
                            URL.revokeObjectURL(url);
                          })
                        }
                      >
                        <Download size={15} /> Ergebnisse exportieren
                      </button>
                    </div>
                    {w.courses.flatMap((c) =>
                      c.chapters.map((ch) => (
                        <div className="mastery-row" key={ch.id}>
                          <span>
                            {ch.title}
                            <small>{c.title}</small>
                          </span>
                          <Progress value={w.mastery[ch.id]?.score || 0} />
                          <strong>{w.mastery[ch.id]?.score || 0}%</strong>
                        </div>
                      )),
                    )}
                    {!w.courses.length && (
                      <p className="muted">
                        Nach deinen ersten Übungen siehst du hier deine Stärken
                        und Lernfelder.
                      </p>
                    )}
                    <p className="small muted">
                      Der Beherrschungsgrad ist eine Lernschätzung aus
                      Richtigkeit, Schwierigkeit und Wiederholungen, keine
                      wissenschaftlich exakte Messung.
                    </p>
                  </section>
                </>
              )}
              {view === "settings" && (
                <SettingsForm
                  preferences={w.preferences}
                  account={account}
                  configured={configured}
                  onLogin={() => setAuth("login")}
                  busy={!!busy}
                  onSave={(p) =>
                    requireAccount(() => {
                      void perform("Speichern", async () => {
                        await api("preferences", p);
                        await reload();
                        setToast("Einstellungen gespeichert.");
                      });
                    })
                  }
                  onLogout={() =>
                    perform("Abmelden", async () => {
                      await api("auth/logout", {});
                      await reload();
                      go("dashboard");
                    })
                  }
                />
              )}
              <footer className="page-footer">
                <span>
                  <span className="footer-mark">
                    <Sparkles size={15} />
                  </span>{" "}
                  In deinem Tempo. Auf deinem Lernpfad.
                </span>
                <span>Mit Neugier wird aus Wissen mehr.</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {account && view === "learn" && !tutor && (
        <button className="floating-tutor" onClick={() => setTutor(true)}>
          <Sparkles size={20} /> Frag deinen Tutor
        </button>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Fehler schließen"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
      {busy && (
        <div className="busy-indicator">
          <LoaderCircle size={16} className="spin" />
          {busy} …
        </div>
      )}
      {editing && course && chapter && (
        <QuestionEditor
          question={editing}
          onClose={() => setEditing(null)}
          onSave={async (question) => {
            await api("question", {
              id: editing.id,
              courseId: course.id,
              chapterId:
                course.chapters.find((ch) =>
                  ch.questions.some((q) => q.id === editing.id),
                )?.id || chapter.id,
              question,
            });
            setEditing(null);
            await reload();
            setToast("Aufgabe aktualisiert.");
          }}
        />
      )}
      {auth && (
        <AuthModal
          mode={auth}
          setMode={setAuth}
          onClose={() => setAuth(null)}
          onSuccess={async () => {
            await reload();
            setAuth(null);
            setToast("Willkommen in deinem Lernraum.");
          }}
        />
      )}
      {upload && (
        <UploadModal
          courses={w.courses}
          configured={configured}
          onClose={() => setUpload(false)}
          onSuccess={async () => {
            setUpload(false);
            go("documents");
            await reload();
            setToast(
              "Unterlagen gespeichert. Die Analyse startet im Hintergrund.",
            );
          }}
        />
      )}
      {docPreview && (
        <div className="modal-backdrop" onClick={() => setDocPreview(null)}>
          <section
            className="modal document-preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="small-label">DEINE QUELLE</span>
                <h2>{docPreview.name}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setDocPreview(null)}
                aria-label="Schließen"
              >
                <X />
              </button>
            </div>
            <input
              className="full-search"
              placeholder="In diesem Dokument suchen …"
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="preview-pages">
              {docPreview.pages
                .filter(
                  (p: any) =>
                    !query ||
                    p.text.toLowerCase().includes(query.toLowerCase()),
                )
                .map((p: any) => (
                  <section key={p.page}>
                    <span className="pill purple">Seite / Folie {p.page}</span>
                    <Markdown>{p.text}</Markdown>
                  </section>
                ))}
            </div>
            <a
              className="button outline"
              href={"/api/document?id=" + docPreview.id + "&download=1"}
            >
              <Download size={16} /> Original herunterladen
            </a>
          </section>
        </div>
      )}
      {tutor && (
        <div className="tutor-drawer">
          <div className="tutor-drawer-head">
            <span className="tutor-avatar">
              <Sparkles size={22} />
            </span>
            <div>
              <strong>Dein KI-Tutor</strong>
              <span>Geduldig. Persönlich. Für dich da.</span>
            </div>
            <button
              className="icon-button"
              onClick={() => setTutor(false)}
              aria-label="Tutor schließen"
            >
              <X size={20} />
            </button>
          </div>
          <select
            value={course?.id || ""}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {!w.courses.length && (
              <option>Bitte zuerst einen Kurs erstellen</option>
            )}
            {w.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <div className="chat-messages">
            {!w.chats.filter((c) => c.courseId === course?.id).length && (
              <div className="chat-welcome">
                <Sparkles size={32} />
                <h3>Was möchtest du verstehen?</h3>
                <p>
                  Frag nach einem Beispiel, einer Formel oder lass dir ein Thema
                  einfacher erklären.
                </p>
                {[
                  "Erkläre mir die Grundlagen.",
                  "Zeige mir ein Beispiel.",
                  "Was sollte ich mir merken?",
                ].map((t) => (
                  <button key={t} onClick={() => setChatText(t)}>
                    {t}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
            {w.chats
              .filter((c) => c.courseId === course?.id)
              .map((c, i) => (
                <div key={i} className={"chat-message " + c.role}>
                  <Markdown>{c.content}</Markdown>
                </div>
              ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (!course || !chatText.trim()) return;
              void perform("Dein Tutor denkt nach", async () => {
                await api("chat", { courseId: course.id, message: chatText });
                setChatText("");
                await reload();
              });
            }}
          >
            <textarea
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Deine Frage …"
              rows={3}
            />
            <button
              type="submit"
              className="button primary"
              disabled={!!busy || !chatText.trim() || !course}
              aria-label="Nachricht senden"
            >
              <Send size={17} />
            </button>
          </form>
          <p className="chat-note">
            KI kann Fehler machen. Prüfe Aussagen anhand deiner Originalquellen.
          </p>
        </div>
      )}
    </div>
  );
  function courseCard(c: Course) {
    const score = Math.round(
      c.chapters.reduce((n, ch) => n + (w.mastery[ch.id]?.score || 0), 0) /
        Math.max(1, c.chapters.length),
    );
    return (
      <article className={"course-card " + c.color} key={c.id}>
        <div className="course-card-top">
          <span className="course-icon">
            <GraduationCap size={23} />
          </span>
          <div className="course-actions">
            <span className="pill">{c.chapters.length} Kapitel</span>
            <button
              className="icon-button"
              title="Kurs umbenennen"
              onClick={() => {
                const title = prompt("Kursname", c.title);
                if (title)
                  perform("Umbenennen", async () => {
                    await api("course", { id: c.id, title }, "PATCH");
                    await reload();
                  });
              }}
            >
              <Pencil size={14} />
            </button>
          </div>
        </div>
        <button className="course-title" onClick={() => openLesson(c)}>
          <h3>{c.title}</h3>
          <p>{c.description}</p>
        </button>
        <div className="course-progress-label">
          <span>Dein Fortschritt</span>
          <strong>{score}%</strong>
        </div>
        <Progress value={score} />
        <div className="course-footer">
          <span>
            <Layers size={13} />
            {c.chapters.flatMap((ch) => ch.questions).length} Aufgaben
          </span>
          <button className="text-button" onClick={() => openLesson(c)}>
            Weiterlernen <ArrowRight size={15} />
          </button>
        </div>
      </article>
    );
  }
}
function AuthModal({
  mode,
  setMode,
  onClose,
  onSuccess,
}: {
  mode: "login" | "register";
  setMode: (v: any) => void;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false),
    [code, setCode] = useState(""),
    [backup, setBackup] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <div className="modal-backdrop">
      <section className="modal auth-modal">
        <button
          className="modal-close icon-button"
          aria-label="Schließen"
          onClick={() => {
            if (backup && !reset) void onSuccess();
            else onClose();
          }}
        >
          <X size={20} />
        </button>
        <div className="auth-symbol">
          <BookOpen size={29} />
        </div>
        <span className="small-label">DEIN WISSEN. DEIN WEG.</span>
        {backup ? (
          <>
            <h2>Dein Wiederherstellungscode</h2>
            <p>
              Bewahre diesen Code in deinem Passwortmanager auf. Er wird nur
              jetzt angezeigt und ermöglicht dir, dein Passwort ohne
              E-Mail-Dienst zurückzusetzen.
            </p>
            <code className="recovery-code">{backup}</code>
            <button
              className="button outline wide"
              onClick={() =>
                navigator.clipboard
                  .writeText(backup)
                  .then(() => setNotice("Code kopiert."))
                  .catch(() =>
                    setNotice("Bitte den angezeigten Code manuell kopieren."),
                  )
              }
            >
              Code kopieren
            </button>
            <p className="small muted">
              Der bisherige Code ist ungültig. Teile diesen Code mit niemandem.
            </p>
            {notice && <p>{notice}</p>}
            <button
              className="button primary wide"
              onClick={() => {
                if (reset) {
                  setBackup("");
                  setReset(false);
                  setMode("login");
                  setNotice(
                    "Passwort geändert. Du kannst dich jetzt anmelden.",
                  );
                } else void onSuccess();
              }}
            >
              Code gesichert · Weiter <ArrowRight size={15} />
            </button>
          </>
        ) : (
          <>
            <h2>
              {reset
                ? "Passwort zurücksetzen"
                : mode === "register"
                  ? "Dein Lernpfad beginnt hier."
                  : "Schön, dich wiederzusehen."}
            </h2>
            <p>
              {reset
                ? "Verwende den persönlichen Wiederherstellungscode, den du bei der Registrierung oder in den Einstellungen gesichert hast."
                : mode === "register"
                  ? "Ein privater Raum für deine Unterlagen, Gedanken und Aha-Momente."
                  : "Deine Unterlagen und Fortschritte warten auf dich."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const r = await api(reset ? "auth/reset" : "auth/" + mode, {
                    email,
                    password,
                    name,
                    code,
                  });
                  if (r.recoveryCode) setBackup(r.recoveryCode);
                  else await onSuccess();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {mode === "register" && !reset && (
                <label>
                  Wie dürfen wir dich nennen?
                  <input
                    required
                    maxLength={80}
                    autoComplete="given-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dein Vorname"
                  />
                </label>
              )}
              <label>
                E-Mail-Adresse
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="du@beispiel.de"
                />
              </label>
              {reset && (
                <label>
                  Wiederherstellungscode
                  <input
                    required
                    value={code}
                    autoComplete="off"
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  />
                </label>
              )}
              <label>
                {reset ? "Neues Passwort" : "Passwort"}
                <input
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete={
                    reset || mode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 10 Zeichen"
                />
              </label>
              {error && <div className="inline-error">{error}</div>}
              {notice && <p className="small muted">{notice}</p>}
              <button className="button primary wide" disabled={busy}>
                {busy ? <LoaderCircle size={17} className="spin" /> : null}
                {reset
                  ? "Passwort ändern"
                  : mode === "register"
                    ? "Kostenlos starten"
                    : "Anmelden"}
                <ArrowRight size={16} />
              </button>
            </form>
            <p className="auth-switch">
              {reset ? (
                <button
                  onClick={() => {
                    setReset(false);
                    setError("");
                  }}
                >
                  Zurück zur Anmeldung
                </button>
              ) : (
                <>
                  {mode === "register"
                    ? "Schon ein Konto?"
                    : "Noch kein Konto?"}{" "}
                  <button
                    onClick={() => {
                      setMode(mode === "register" ? "login" : "register");
                      setError("");
                    }}
                  >
                    {mode === "register" ? "Anmelden" : "Lernraum erstellen"}
                  </button>
                </>
              )}
            </p>
            {!reset && mode === "login" && (
              <button
                className="text-button"
                onClick={() => {
                  setReset(true);
                  setError("");
                }}
              >
                Passwort vergessen?
              </button>
            )}
            <span className="privacy-caption">
              <LockKeyhole size={13} /> Deine Daten gehören nur dir.
            </span>
          </>
        )}
      </section>
    </div>
  );
}
function UploadModal({
  courses,
  configured,
  onClose,
  onSuccess,
}: {
  courses: Course[];
  configured: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [courseId, setCourseId] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function add(incoming: FileList | File[] | null) {
    if (!incoming) return;
    setFiles((old) => [...old, ...Array.from(incoming)].slice(0, 10));
  }
  return (
    <div className="modal-backdrop">
      <section className="modal upload-modal">
        <div className="modal-heading">
          <div>
            <span className="small-label">AUS UNTERLAGEN WIRD WISSEN</span>
            <h2>Womit möchtest du wachsen?</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={21} />
          </button>
        </div>
        <p>
          Lade deine Dokumente hoch. Dein KI-Tutor kümmert sich um den roten
          Faden.
        </p>
        {!configured && (
          <div className="alert warning">
            <CircleHelp size={20} />
            <span>
              Ohne KI-Zugang werden Dateien und lesbare Texte gespeichert. Unter
              „Meine Dokumente“ kannst du einen Lernauftrag für ChatGPT
              exportieren und den fertigen Kurs importieren. Eine automatische
              KI-Analyse benötigt weiterhin eine eingerichtete Verbindung.
            </span>
          </div>
        )}
        <div
          className={"dropzone " + (drag ? "drag" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            add(e.dataTransfer.files);
          }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") input.current?.click();
          }}
        >
          <span className="upload-circle">
            <Upload size={26} />
          </span>
          <h3>Deine Unterlagen dürfen hier landen.</h3>
          <p>
            Dateien hierher ziehen oder <strong>Dateien auswählen</strong>
          </p>
          <span>PDF, DOCX, PPTX, TXT, PNG, JPG · je max. 25 MB</span>
          <input
            ref={input}
            hidden
            multiple
            type="file"
            accept=".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg"
            onChange={(e) => add(e.target.files)}
          />
        </div>
        {files.length > 0 && (
          <div className="selected-files">
            {files.map((f, i) => (
              <div key={i}>
                <FileText size={17} />
                <span>
                  {f.name}
                  <small>{(f.size / 1024 / 1024).toFixed(2)} MB</small>
                </span>
                <button
                  className="icon-button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label="Datei entfernen"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label>
          Zu einem Lernpfad hinzufügen
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Einen gemeinsamen Lernpfad erstellen</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        {busy && <p role="status">{progress}</p>}
        <div className="modal-footer">
          <span>
            <LockKeyhole size={13} /> Privat & dauerhaft gespeichert
          </span>
          <button
            className="button primary"
            disabled={!files.length || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await uploadDocuments(files, courseId, setProgress);
                await onSuccess();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Sparkles size={17} />
            )}
            Lernpfad erstellen
          </button>
        </div>
      </section>
    </div>
  );
}
function AnswerInput({
  question: q,
  value,
  onChange,
  disabled,
}: {
  question: Question;
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  if (["matching", "connecting"].includes(q.type) && q.matching)
    return (
      <MatchingInput
        question={q}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  if (["single", "boolean"].includes(q.type))
    return (
      <div className="answer-options">
        {q.options.map((o, i) => (
          <button
            key={i}
            disabled={disabled}
            className={"answer-option " + (value === o ? "chosen" : "")}
            onClick={() => onChange(o)}
          >
            <span>{String.fromCharCode(65 + i)}</span>
            <Markdown>{o}</Markdown>
            <i>{value === o && <Check size={13} />}</i>
          </button>
        ))}
      </div>
    );
  if (q.type === "multiple") {
    let selected: string[] = [];
    try {
      selected = JSON.parse(value || "[]");
    } catch {}
    return (
      <div className="answer-options">
        <p className="small muted">Mehrere Antworten können richtig sein.</p>
        {q.options.map((o, i) => (
          <label
            className={
              "answer-option " + (selected.includes(o) ? "chosen" : "")
            }
            key={i}
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(o)}
              onChange={() =>
                onChange(
                  JSON.stringify(
                    selected.includes(o)
                      ? selected.filter((v) => v !== o)
                      : [...selected, o],
                  ),
                )
              }
            />
            <Markdown>{o}</Markdown>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "ordering") {
    let ordered: string[] = [];
    try {
      ordered = JSON.parse(value || "[]");
    } catch {}
    const items = ordered.length ? ordered : q.options;
    return (
      <div className="order-options">
        <p className="small muted">
          Bringe die Elemente in die richtige Reihenfolge und bestätige sie.
        </p>
        {items.map((item, i) => (
          <div key={item}>
            <span>{i + 1}</span>
            <Markdown>{item}</Markdown>
            <button
              className="icon-button"
              disabled={disabled || i === 0}
              aria-label="Nach oben"
              onClick={() => {
                const arr = [...items];
                [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                onChange(JSON.stringify(arr));
              }}
            >
              <MoveUp size={16} />
            </button>
            <button
              className="icon-button"
              disabled={disabled || i === items.length - 1}
              aria-label="Nach unten"
              onClick={() => {
                const arr = [...items];
                [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                onChange(JSON.stringify(arr));
              }}
            >
              <MoveDown size={16} />
            </button>
          </div>
        ))}
        {!value && (
          <button
            className="button outline"
            onClick={() => onChange(JSON.stringify(items))}
          >
            Reihenfolge bestätigen
          </button>
        )}
      </div>
    );
  }
  return (
    <div>
      {["matching", "connecting"].includes(q.type) && (
        <div className="matching-items">
          {q.options.map((o, i) => (
            <span key={i}>{o}</span>
          ))}
        </div>
      )}
      <textarea
        rows={q.type === "cloze" ? 2 : 5}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          q.type === "cloze"
            ? "Fehlenden Begriff eintragen …"
            : q.type === "calculation"
              ? "Dein Rechenweg und Ergebnis …"
              : q.type === "flashcard"
                ? "Was weißt du noch? Schreibe deine Antwort vor dem Aufdecken auf."
                : "Deine Antwort – in deinen eigenen Worten …"
        }
      />
    </div>
  );
}
function CustomQuestion({
  course,
  chapter,
  onSave,
}: {
  course: Course;
  chapter: Chapter;
  onSave: (q: any) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [prompt, setPrompt] = useState(""),
    [answer, setAnswer] = useState(""),
    [quote, setQuote] = useState(chapter.sources[0]?.quote || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="panel custom-question">
      <button className="text-button" onClick={() => setOpen(!open)}>
        <Plus size={16} /> Eigene Aufgabe erstellen <ChevronDown size={15} />
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSave({
                type: "open",
                prompt,
                answer,
                options: [],
                explanation: answer,
                difficulty: 2,
                sources: [{ ...chapter.sources[0], quote }],
              });
              setOpen(false);
              setPrompt("");
              setAnswer("");
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Deine Frage
            <textarea
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
            />
          </label>
          <label>
            Musterlösung
            <textarea
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
            />
          </label>
          <label>
            Wörtlicher Quellenbeleg (Seite {chapter.sources[0]?.page})
            <textarea
              required
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={2}
            />
          </label>
          {error && <p className="inline-error">{error}</p>}
          <button className="button primary" disabled={busy}>
            Aufgabe speichern
          </button>
        </form>
      )}
    </div>
  );
}
function ExamCreator({
  courses,
  busy,
  onCreate,
}: {
  courses: Course[];
  busy: boolean;
  onCreate: (s: any) => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id || ""),
    [chapterIds, setChapterIds] = useState<string[]>([]),
    [count, setCount] = useState(5),
    [duration, setDuration] = useState(20),
    [pass, setPass] = useState(60),
    [difficulty, setDifficulty] = useState(0),
    [types, setTypes] = useState<string[]>([]),
    [hints, setHints] = useState(false);
  const course = courses.find((c) => c.id === courseId) || courses[0];
  return (
    <section className="panel exam-creator">
      <div className="section-heading">
        <div>
          <span className="small-label">DEINE GENERALPROBE</span>
          <h2>Eine Prüfung, die zu dir passt.</h2>
        </div>
        <span className="exam-art">
          <ClipboardCheck size={40} />
        </span>
      </div>
      <p className="muted">
        Teste dein Wissen ohne Druck. Lösungen und Feedback erhältst du nach der
        Abgabe.
      </p>
      <div className="form-grid">
        <label>
          Kurs auswählen
          <select
            value={course?.id || ""}
            onChange={(e) => {
              setCourseId(e.target.value);
              setChapterIds([]);
            }}
          >
            {!courses.length && <option>Noch kein Kurs vorhanden</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Anzahl der Fragen
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <label>
          Zeitlimit (Minuten)
          <input
            type="number"
            min={1}
            max={180}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>
        <label>
          Bestehensgrenze (%)
          <input
            type="number"
            min={1}
            max={100}
            value={pass}
            onChange={(e) => setPass(Number(e.target.value))}
          />
        </label>
        <label>
          Schwierigkeit
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          >
            <option value={0}>Gemischt</option>
            <option value={1}>Leicht</option>
            <option value={2}>Mittel</option>
            <option value={3}>Schwer</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={hints}
            onChange={(e) => setHints(e.target.checked)}
          />{" "}
          Hinweise zulassen
        </label>
      </div>
      <label>
        Kapitel <small className="muted">(ohne Auswahl: alle Kapitel)</small>
      </label>
      <div className="chapter-chips">
        {course?.chapters.map((ch) => (
          <button
            className={chapterIds.includes(ch.id) ? "selected" : ""}
            key={ch.id}
            onClick={() =>
              setChapterIds(
                chapterIds.includes(ch.id)
                  ? chapterIds.filter((id) => id !== ch.id)
                  : [...chapterIds, ch.id],
              )
            }
          >
            {chapterIds.includes(ch.id) && <Check size={13} />} {ch.title}
          </button>
        ))}
      </div>
      <label>
        Aufgabentypen{" "}
        <small className="muted">(ohne Auswahl: alle Typen)</small>
      </label>
      <div className="chapter-chips">
        {Object.entries(typeNames).map(([id, name]) => (
          <button
            key={id}
            className={types.includes(id) ? "selected" : ""}
            onClick={() =>
              setTypes(
                types.includes(id)
                  ? types.filter((t) => t !== id)
                  : [...types, id],
              )
            }
          >
            {name}
          </button>
        ))}
      </div>
      <div className="lesson-footer">
        <span className="small muted">
          <LockKeyhole size={13} /> Lösungen bleiben bis zur Abgabe verborgen.
        </span>
        <button
          className="button primary"
          disabled={!course || busy}
          onClick={() =>
            onCreate({
              courseId: course.id,
              chapterIds: chapterIds.length
                ? chapterIds
                : course.chapters.map((c) => c.id),
              count,
              duration,
              pass,
              difficulty,
              types,
              hints,
            })
          }
        >
          <Play size={16} /> Prüfung starten
        </button>
      </div>
    </section>
  );
}
function ExamSession({
  exam,
  busy,
  now,
  onBack,
  onSave,
  onSubmit,
  onRepeat,
}: {
  exam: Exam;
  onRepeat: () => void;
  busy: boolean;
  now: number;
  onBack: () => void;
  onSave: (a: Record<string, string>) => Promise<void>;
  onSubmit: (a: Record<string, string>) => any;
}) {
  const [answers, setAnswers] = useState(exam.answers),
    [status, setStatus] = useState(""),
    [idx, setIdx] = useState(0),
    [hint, setHint] = useState(false);
  const q = exam.questions[idx];
  const remaining = Math.max(
    0,
    Math.floor(
      (new Date(exam.startedAt).getTime() + exam.duration * 1000 - now) / 1000,
    ),
  );
  const completed = exam.status === "completed";
  const submitted = useRef(false);
  useEffect(() => {
    if (completed || answers === exam.answers) return;
    const timer = setTimeout(() => {
      setStatus("Wird gespeichert …");
      onSave(answers)
        .then(() => setStatus("Gespeichert"))
        .catch((e) => setStatus(e.message));
    }, 500);
    return () => clearTimeout(timer);
  }, [answers]);
  useEffect(() => {
    if (!remaining && !completed && !busy && !submitted.current) {
      submitted.current = true;
      onSubmit(answers);
    }
  }, [remaining, busy, completed]);
  return (
    <section className="panel exam-session">
      <div className="section-heading">
        <button className="text-button" onClick={onBack}>
          <ChevronLeft size={16} /> Alle Prüfungen
        </button>
        <span className={"pill " + (remaining < 60 ? "red" : "purple")}>
          {completed ? (
            "Abgeschlossen"
          ) : (
            <>
              <Clock3 size={14} />
              {Math.floor(remaining / 60)}:
              {String(remaining % 60).padStart(2, "0")}
            </>
          )}
        </span>
      </div>
      <h2>{exam.title}</h2>
      {completed && (
        <button className="button outline" disabled={busy} onClick={onRepeat}>
          <RotateCcw size={15} /> Prüfung erneut absolvieren
        </button>
      )}
      {completed && (
        <div
          className={
            "exam-result " +
            ((exam.score || 0) >= exam.pass ? "passed" : "failed")
          }
        >
          <Trophy size={34} />
          <div>
            <strong>
              {exam.score}% ·{" "}
              {(exam.score || 0) >= exam.pass
                ? "Bestanden"
                : "Weiter üben lohnt sich"}
            </strong>
            <p>
              {exam.results?.filter((r) => r.correct).length} von{" "}
              {exam.questions.length} richtig · Bestehensgrenze {exam.pass}%
            </p>
          </div>
          <button
            className="button outline"
            onClick={() => {
              const blob = new Blob([JSON.stringify(exam, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "pruefung-" + exam.id + ".json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={16} /> Exportieren
          </button>
        </div>
      )}
      <div className="exam-dots">
        {exam.questions.map((q, i) => (
          <button
            key={q.id}
            className={
              (idx === i ? "active " : "") + (answers[q.id] ? "answered" : "")
            }
            onClick={() => {
              setIdx(i);
              setHint(false);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <span className="small-label">
        AUFGABE {idx + 1} · {typeNames[q.type]}
      </span>
      <h3 className="exam-question">
        <Markdown inline>{q.prompt}</Markdown>
      </h3>
      <AnswerInput
        question={q}
        value={answers[q.id] || ""}
        onChange={(value) => setAnswers({ ...answers, [q.id]: value })}
        disabled={completed || !remaining}
      />
      {exam.hints && !completed && (
        <button className="text-button" onClick={() => setHint(!hint)}>
          Hinweis {hint ? "ausblenden" : "anzeigen"} <CircleHelp size={14} />
        </button>
      )}
      {hint && !completed && (
        <div className="info-banner">
          Suche zuerst die wichtigen Begriffe in der Frage. Welche Regel oder
          Definition aus dem Kapitel passt dazu? Formuliere deinen Lösungsweg
          schrittweise.
        </div>
      )}

      {completed && (
        <div
          className={
            "feedback " +
            (exam.results?.[idx]?.correct ? "correct" : "incorrect")
          }
        >
          <Markdown>{exam.results?.[idx]?.feedback || ""}</Markdown>
          <h4>Musterlösung</h4>
          <Markdown>{q.answer}</Markdown>
        </div>
      )}
      <div className="lesson-footer">
        <span className="small muted">
          {completed
            ? "Ergebnis dauerhaft gespeichert"
            : status || "Antworten werden automatisch gespeichert."}
        </span>
        <div className="row-actions">
          <button
            className="button outline"
            disabled={idx === 0}
            onClick={() => setIdx(idx - 1)}
          >
            <ChevronLeft size={15} /> Zurück
          </button>
          {idx < exam.questions.length - 1 ? (
            <button className="button primary" onClick={() => setIdx(idx + 1)}>
              Weiter <ArrowRight size={15} />
            </button>
          ) : (
            !completed && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  if (confirm("Prüfung jetzt verbindlich abgeben?"))
                    onSubmit(answers);
                }}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <CheckCheck size={16} />
                )}{" "}
                Prüfung abgeben
              </button>
            )
          )}
        </div>
      </div>
    </section>
  );
}
function SettingsForm({
  preferences,
  account,
  configured,
  onLogin,
  onSave,
  onLogout,
  busy,
}: {
  preferences: Preferences;
  account: any;
  configured: boolean;
  onLogin: () => void;
  onSave: (p: Preferences) => void;
  onLogout: () => any;
  busy: boolean;
}) {
  const [p, setP] = useState(preferences);
  useEffect(() => setP(preferences), [preferences]);
  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="section-heading">
          <h2>Ganz dein Lernraum.</h2>
          <Settings size={23} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(p);
          }}
        >
          <label>
            Dein Name
            <input
              value={p.name}
              maxLength={80}
              onChange={(e) => setP({ ...p, name: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Sprache der KI-Lerninhalte
              <select
                value={p.language}
                onChange={(e) => setP({ ...p, language: e.target.value })}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              Erklärniveau
              <select
                value={p.difficulty}
                onChange={(e) => setP({ ...p, difficulty: e.target.value })}
              >
                {[
                  "Sehr einfach",
                  "Normal",
                  "Fortgeschritten",
                  "Universitätsniveau",
                ].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Design
              <select
                value={p.theme}
                onChange={(e) => setP({ ...p, theme: e.target.value })}
              >
                <option value="light">Hell</option>
                <option value="dark">Dunkel</option>
              </select>
            </label>
            <label>
              Dein tägliches XP-Ziel
              <input
                type="number"
                min={10}
                max={1000}
                value={p.dailyGoal}
                onChange={(e) =>
                  setP({ ...p, dailyGoal: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <h3>Beherrschungsgrad</h3>
          <p className="muted small">
            Ab diesen Werten gelten Grundlagen als verstanden, gut oder sehr gut
            beherrscht.
          </p>
          <div className="thresholds">
            {p.thresholds.map((n, i) => (
              <label key={i}>
                {["Grundlagen", "Gut", "Sehr gut"][i]} (%)
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={n}
                  onChange={(e) => {
                    const values = [...p.thresholds];
                    values[i] = Number(e.target.value);
                    setP({ ...p, thresholds: values });
                  }}
                />
              </label>
            ))}
          </div>
          <button className="button primary" disabled={busy}>
            <Check size={16} /> Einstellungen speichern
          </button>
        </form>
      </section>
      <div>
        <section className="panel settings-panel">
          <span className="stat-icon lilac">
            <LockKeyhole size={23} />
          </span>
          <h3>Dein persönliches Konto</h3>
          {account && <RecoveryControl />}
          <p>
            {account?.email ||
              "Melde dich an, um deinen Lernfortschritt dauerhaft zu speichern."}
          </p>
          {account ? (
            <button className="button outline" onClick={onLogout}>
              <LogOut size={16} /> Abmelden
            </button>
          ) : (
            <button className="button primary" onClick={onLogin}>
              Anmelden
            </button>
          )}
        </section>
        {account && <ChatGPTConnection />}
        <section className="panel settings-panel">
          <h3>KI-Verbindung</h3>
          <span className={"pill " + (configured ? "green" : "amber")}>
            {configured
              ? "KI-Verbindung eingerichtet"
              : "Konfiguration erforderlich"}
          </span>
          <p className="small muted">
            Lokal kannst du dein ChatGPT-Konto verbinden. Alternativ wird ein
            API-Schlüssel ausschließlich serverseitig als OPENAI_API_KEY
            verwaltet. Details findest du in der Installationsanleitung.
          </p>
        </section>
      </div>
    </div>
  );
}
function QuestionEditor({
  question,
  onClose,
  onSave,
}: {
  question: Question;
  onClose: () => void;
  onSave: (q: Question) => Promise<void>;
}) {
  const [q, setQ] = useState(question),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <div className="modal-heading">
          <h2>Aufgabe bearbeiten</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSave(q);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Aufgabentyp
            <select
              value={q.type}
              onChange={(e) => setQ({ ...q, type: e.target.value })}
            >
              {Object.entries(typeNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fragestellung
            <textarea
              required
              rows={3}
              value={q.prompt}
              onChange={(e) => setQ({ ...q, prompt: e.target.value })}
            />
          </label>
          <label>
            Antwortoptionen (eine pro Zeile)
            <textarea
              rows={4}
              value={q.options.join("\n")}
              onChange={(e) =>
                setQ({ ...q, options: e.target.value.split("\n") })
              }
            />
          </label>
          <label>
            Musterlösung
            <textarea
              required
              rows={3}
              value={q.answer}
              onChange={(e) => setQ({ ...q, answer: e.target.value })}
            />
          </label>
          <p className="small muted">
            Bei Mehrfachauswahl und Reihenfolge: JSON-Array, z. B. ["Antwort
            A","Antwort B"].
          </p>
          <label>
            Erklärung
            <textarea
              required
              rows={3}
              value={q.explanation}
              onChange={(e) => setQ({ ...q, explanation: e.target.value })}
            />
          </label>
          <label>
            Schwierigkeit
            <select
              value={q.difficulty}
              onChange={(e) =>
                setQ({ ...q, difficulty: Number(e.target.value) })
              }
            >
              <option value={1}>Leicht</option>
              <option value={2}>Mittel</option>
              <option value={3}>Schwer</option>
            </select>
          </label>
          {q.sources.map((s, i) => (
            <label key={i}>
              Wörtlicher Quellenbeleg · Seite {s.page}
              <textarea
                value={s.quote}
                onChange={(e) =>
                  setQ({
                    ...q,
                    sources: q.sources.map((v, j) =>
                      j === i ? { ...v, quote: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          {error && <p className="inline-error">{error}</p>}
          <button className="button primary" disabled={busy}>
            <Check size={16} /> Änderungen speichern
          </button>
        </form>
      </section>
    </div>
  );
}

function MatchingInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: Question;
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  const [active, setActive] = useState("");
  let matches: Record<string, string> = {};
  try {
    matches = JSON.parse(value || "{}");
  } catch {}
  const data = question.matching!;
  function assign(term: string, definition: string) {
    const next = { ...matches };
    for (const key of Object.keys(next))
      if (next[key] === definition) delete next[key];
    next[term] = definition;
    onChange(JSON.stringify(next));
    setActive("");
  }
  return (
    <div className="match-board">
      <p>
        Tippe einen Begriff und danach die passende Definition an. Du kannst
        Begriffe auch auf Definitionen ziehen.
      </p>
      <div className="match-columns">
        <div>
          {data.terms.map((term) => (
            <button
              key={term}
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", term);
                setActive(term);
              }}
              onClick={() => setActive(term)}
              className={
                active === term ? "selected" : matches[term] ? "matched" : ""
              }
            >
              {term}
              {matches[term] && <small>→ {matches[term]}</small>}
            </button>
          ))}
        </div>
        <div>
          {data.definitions.map((definition) => (
            <button
              key={definition}
              disabled={disabled}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const term = e.dataTransfer.getData("text/plain");
                if (data.terms.includes(term)) assign(term, definition);
              }}
              onClick={() => {
                if (active) assign(active, definition);
              }}
              className={
                Object.values(matches).includes(definition) ? "matched" : ""
              }
            >
              {definition}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecoveryControl() {
  const [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="recovery-control">
      <label>
        Aktuelles Passwort
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button
        className="text-button"
        disabled={!password || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await api("auth/recovery", { password });
            setCode(r.recoveryCode);
            setPassword("");
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Neuen Wiederherstellungscode erstellen
      </button>
      {code && (
        <>
          <code className="recovery-code">{code}</code>
          <p className="small muted">
            Jetzt sicher speichern. Der bisherige Code funktioniert nicht mehr.
          </p>
        </>
      )}
      {error && <p className="inline-error">{error}</p>}
    </div>
  );
}
