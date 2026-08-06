export type ChapterState = "构思中" | "待写" | "写作中" | "待人工精修" | "已定稿";

export interface ProjectSummary {
  id: string;
  name: string;
  title: string;
  genre: string;
  platform: string;
  project_status: string;
  target_words: number;
  chapter_count: number;
  document_count: number;
  word_count: number;
  pending_revisions: number;
  progress: number;
  word_progress: number;
  modified_at: string;
  has_outline: boolean;
  has_settings: boolean;
}

export interface DocumentSummary {
  path: string;
  title: string;
  kind: string;
  status: ChapterState | "资料";
  word_count: number;
  modified_at: string;
  project?: string;
}

export interface DashboardData {
  projects: ProjectSummary[];
  totals: {
    projects: number;
    chapters: number;
    words: number;
    pending_revisions: number;
  };
  recent_documents: DocumentSummary[];
  writing_trend: { date: string; words: number }[];
  warnings: { project: string; message: string }[];
}

export interface ProjectDetail extends ProjectSummary {
  documents: DocumentSummary[];
  groups: Record<string, DocumentSummary[]>;
  outline_excerpt: string;
  chapter_states: ChapterState[];
  project_states: string[];
  platforms: string[];
  recent_activity: ActivityEntry[];
}

export interface DocumentData {
  project: string;
  path: string;
  content: string;
  revision: string;
  modified_at: string;
  word_count: number;
}

export interface SearchResult {
  type: string;
  title: string;
  detail: string;
  project: string;
  path: string | null;
}

export interface ActivityEntry {
  at: string;
  action: string;
  path: string;
  word_delta: number;
}

export interface HistoryEntry {
  id: string;
  created_at: string;
  word_count: number;
  preview: string;
}

export interface TrashEntry {
  id: string;
  original_path: string;
  deleted_at: string;
  word_count: number;
}

export interface ProjectInput {
  name?: string;
  title: string;
  genre: string;
  platform: string;
  target_words: number;
  status?: string;
}

export interface ChatStatus {
  enabled: boolean;
  provider: string;
  model: string;
  message: string;
  configurable?: boolean;
  source?: "local" | "environment" | "none" | "injected";
}

export interface AIProviderPreset {
  id: string;
  label: string;
  base_url: string;
  requires_api_key: boolean;
}

export interface AIConfig {
  preset: string;
  base_url: string;
  model: string;
  api_key_set: boolean;
  timeout_seconds: number;
  source: "local" | "environment" | "none";
  presets: AIProviderPreset[];
}

export interface AIConfigInput {
  preset: string;
  base_url: string;
  model: string;
  api_key?: string;
  clear_api_key?: boolean;
  timeout_seconds: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatSession {
  id: string;
  project: string;
  path: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export type ChatStreamEvent =
  | { type: "start"; session_id: string }
  | { type: "delta"; content: string }
  | { type: "error"; message: string }
  | { type: "done"; session: ChatSession };
