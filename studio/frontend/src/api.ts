import type { ChapterState, DashboardData, DocumentData, HistoryEntry, ProjectDetail, ProjectInput, SearchResult, TrashEntry } from "./types";

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
};
