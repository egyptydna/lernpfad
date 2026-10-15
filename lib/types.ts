export type Source = { documentId: string; page: number; quote: string };
export type Question = {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  matching?: { terms: string[]; definitions: string[] };
  answer: string;
  explanation: string;
  difficulty: number;
  sources: Source[];
};
export type Chapter = {
  variants?: Record<
    string,
    Pick<
      Chapter,
      | "introduction"
      | "explanation"
      | "example"
      | "definitions"
      | "summary"
      | "sources"
    >
  >;
  parentTitle?: string;
  id: string;
  title: string;
  introduction: string;
  explanation: string;
  example: string;
  definitions: string;
  summary: string;
  questions: Question[];
  sources: Source[];
};
export type Course = {
  id: string;
  title: string;
  description: string;
  documentIds: string[];
  chapters: Chapter[];
  createdAt: string;
  color: string;
};
export type Doc = {
  id: string;
  name: string;
  originalName: string;
  mime: string;
  size: number;
  status: "queued" | "processing" | "ready" | "error";
  progress: number;
  error?: string;
  pages: { page: number; text: string }[];
  createdAt: string;
  courseId?: string;
  batchId?: string;
  extractedAt?: string;
};
export type Attempt = {
  id: string;
  questionId: string;
  chapterId: string;
  courseId: string;
  answer: string;
  correct: boolean;
  feedback: string;
  xp: number;
  at: string;
  difficulty: number;
  examId?: string;
  seconds: number;
  followUpId?: string;
  remediationError?: string;
};
export type Mastery = {
  score: number;
  streak: number;
  interval: number;
  due: string;
  attempts: number;
};
export type Exam = {
  id: string;
  title: string;
  courseId: string;
  chapterIds: string[];
  questions: Question[];
  answers: Record<string, string>;
  results?: { questionId: string; correct: boolean; feedback: string }[];
  status: "active" | "completed";
  startedAt: string;
  duration: number;
  pass: number;
  hints: boolean;
  score?: number;
  submittedAt?: string;
};
export type Preferences = {
  language: string;
  difficulty: string;
  theme: string;
  dailyGoal: number;
  thresholds: number[];
  name: string;
};
export type Workspace = {
  documents: Doc[];
  courses: Course[];
  attempts: Attempt[];
  exams: Exam[];
  mastery: Record<string, Mastery>;
  questionMastery?: Record<string, Mastery>;
  notes: Record<string, string>;
  preferences: Preferences;
  chats: { role: string; content: string; at: string; courseId: string }[];
  studySeconds: number;
  phases?: Record<string, number>;
  achievements?: string[];
  jobs?: { id: string; kind: string; status: string; error?: string }[];
  checkpoint?: {
    courseId: string;
    chapterId: string;
    tab: string;
    view: string;
    qIndex: number;
    answer?: string;
    questionId?: string;
    requestId?: string;
    method?: string;
    difficulty?: string;
    count?: number;
    phase?: number;
    scope?: string;
    selectedChapters?: string[];
    onlyErrors?: boolean;
  };
};
export const emptyWorkspace = (): Workspace => ({
  documents: [],
  courses: [],
  attempts: [],
  exams: [],
  mastery: {},
  notes: {},
  preferences: {
    language: "de",
    difficulty: "Normal",
    theme: "light",
    dailyGoal: 100,
    thresholds: [40, 70, 90],
    name: "",
  },
  chats: [],
  studySeconds: 0,
});
