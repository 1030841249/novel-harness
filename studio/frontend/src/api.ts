import type { AIConfig, AIConfigInput, ChapterState, ChatSession, ChatStatus, ChatStreamEvent, DashboardData, DocumentData, HistoryEntry, ProjectDetail, ProjectInput, SearchResult, TrashEntry } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "请求失败" }));
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message;
    throw new ApiError(response.status, detail || `请求失败 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function streamingRequest(url: string, init: RequestInit, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "请求失败" }));
    throw new ApiError(response.status, typeof body.detail === "string" ? body.detail : `请求失败 (${response.status})`);
  }
  if (!response.body) throw new ApiError(502, "模型服务没有返回数据流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (data) onEvent(JSON.parse(data) as ChatStreamEvent);
    }
    if (done) break;
  }
  const finalData = buffer.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim();
  if (finalData) onEvent(JSON.parse(finalData) as ChatStreamEvent);
}

export const api = {
  dashboard: () => request<DashboardData>("/api/dashboard"),
  search: (query: string) => request<SearchResult[]>(`/api/search?query=${encodeURIComponent(query)}`),
  createProject: (input: ProjectInput) => request<ProjectDetail>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  project: (project: string) => request<ProjectDetail>(`/api/projects/${encodeURIComponent(project)}`),
  updateProject: (project: string, input: ProjectInput) => request<ProjectDetail>(`/api/projects/${encodeURIComponent(project)}`, { method: "PATCH", body: JSON.stringify(input) }),
  document: (project: string, path: string) =>
    request<DocumentData>(`/api/files?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`),
  saveDocument: (document: DocumentData, content: string) =>
    request<DocumentData>("/api/files", {
      method: "PUT",
      body: JSON.stringify({
        project: document.project,
        path: document.path,
        content,
        base_revision: document.revision,
      }),
    }),
  createDocument: (project: string, path: string, content: string) =>
    request<DocumentData>("/api/files", {
      method: "POST",
      body: JSON.stringify({ project, path, content }),
    }),
  documentRevision: (project: string, path: string) =>
    request<{ revision: string; modified_at: string }>(`/api/files/revision?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`),
  renameDocument: (document: DocumentData, newPath: string) =>
    request<DocumentData>("/api/files/rename", {
      method: "PATCH",
      body: JSON.stringify({ project: document.project, path: document.path, new_path: newPath, base_revision: document.revision }),
    }),
  deleteDocument: (document: DocumentData) =>
    request<{ status: string; trash_id: string }>("/api/files", {
      method: "DELETE",
      body: JSON.stringify({ project: document.project, path: document.path, base_revision: document.revision }),
    }),
  history: (project: string, path: string) =>
    request<HistoryEntry[]>(`/api/history?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`),
  restoreHistory: (document: DocumentData, historyId: string) =>
    request<DocumentData>("/api/history/restore", {
      method: "POST",
      body: JSON.stringify({ project: document.project, path: document.path, history_id: historyId, base_revision: document.revision }),
    }),
  trash: (project: string) => request<TrashEntry[]>(`/api/trash/${encodeURIComponent(project)}`),
  restoreTrash: (project: string, trashId: string) =>
    request<DocumentData>("/api/trash/restore", { method: "POST", body: JSON.stringify({ project, trash_id: trashId }) }),
  setStatus: (project: string, path: string, value: ChapterState) =>
    request<{ path: string; status: ChapterState }>(
      `/api/projects/${encodeURIComponent(project)}/document-status`,
      { method: "PATCH", body: JSON.stringify({ path, value }) },
    ),
  chatStatus: () => request<ChatStatus>("/api/chat/status"),
  aiConfig: () => request<AIConfig>("/api/chat/config"),
  saveAIConfig: (input: AIConfigInput) => request<ChatStatus>("/api/chat/config", { method: "PUT", body: JSON.stringify(input) }),
  clearAIConfig: () => request<ChatStatus>("/api/chat/config", { method: "DELETE" }),
  discoverAIModels: (baseUrl: string, apiKey: string, timeoutSeconds: number) =>
    request<{ models: string[] }>("/api/chat/models", {
      method: "POST",
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey || undefined, timeout_seconds: timeoutSeconds }),
    }),
  chatSessions: (project: string, path: string) =>
    request<ChatSession[]>(`/api/chat/sessions?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`),
  createChatSession: (project: string, path: string) =>
    request<ChatSession>("/api/chat/sessions", { method: "POST", body: JSON.stringify({ project, path }) }),
  chatSession: (project: string, sessionId: string) =>
    request<ChatSession>(`/api/chat/sessions/${encodeURIComponent(sessionId)}?project=${encodeURIComponent(project)}`),
  streamChatMessage: (
    project: string,
    sessionId: string,
    message: string,
    draftContent: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
  ) => streamingRequest(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    { method: "POST", body: JSON.stringify({ project, message, draft_content: draftContent }), signal },
    onEvent,
  ),
};
