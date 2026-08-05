import { ArchiveRestore, ArrowLeft, FilePlus2, FileText, History, PenLine, Plus, ScrollText, Settings, Settings2, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState, StatusBadge } from "../components/Common";
import { Shell } from "../components/Shell";
import { Link, useNavigate, useParams } from "../router";
import type { ChapterState, DocumentData, DocumentSummary, ProjectDetail, ProjectInput, TrashEntry } from "../types";
import { formatDate, formatNumber } from "../utils";

const tabs = ["正文", "大纲", "设定", "状态", "记忆", "全部"];

export function ProjectWorkspace() {
  const { project = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [activeTab, setActiveTab] = useState("正文");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [managedDocument, setManagedDocument] = useState<DocumentSummary | null>(null);

  const load = () => api.project(project).then(setData).catch((reason: Error) => setError(reason.message));
  useEffect(() => {
    void load();
  }, [project]);

  const visibleDocuments = useMemo(() => {
    if (!data) return [];
    return activeTab === "全部" ? data.documents : data.documents.filter((item) => item.kind === activeTab);
  }, [activeTab, data]);

  async function updateStatus(document: DocumentSummary, value: ChapterState) {
    await api.setStatus(project, document.path, value);
    setData((current) => current ? {
      ...current,
      documents: current.documents.map((item) => item.path === document.path ? { ...item, status: value } : item),
    } : current);
  }

  if (error) return <Shell title="项目工作台"><ErrorState message={error} /></Shell>;
  if (!data) return <Shell title="项目工作台"><LoadingState label="正在整理项目文档" /></Shell>;

  return (
    <Shell
      title={data.title}
      subtitle={`${data.genre || "未设题材"} · ${data.platform} · ${data.project_status}`}
      actions={<div className="action-group">
        <button className="button" onClick={() => setEditingProject(true)}><Settings size={16} /> 项目资料</button>
        <button className="icon-button button-bordered" title="回收站" onClick={() => setTrashOpen(true)}><Trash2 size={16} /></button>
        <button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} /> 新建文档</button>
      </div>}
    >
      <Link className="back-link" to="/"><ArrowLeft size={15} /> 返回全部项目</Link>
      <section className="project-overview">
        <div className="project-progress-block">
          <span>{data.target_words ? "目标字数进度" : "章节定稿进度"}</span>
          <strong>{data.target_words ? data.word_progress : data.progress}%</strong>
          <div className="wide-progress"><span style={{ width: `${data.target_words ? data.word_progress : data.progress}%` }} /></div>
        </div>
        <div><small>正文篇章</small><strong>{data.chapter_count}</strong></div>
        <div><small>待人工精修</small><strong>{data.pending_revisions}</strong></div>
        <div><small>{data.target_words ? "目标总字数" : "项目文档"}</small><strong>{data.target_words ? formatNumber(data.target_words) : data.document_count}</strong></div>
        <div><small>最后更新</small><strong className="date-value">{formatDate(data.modified_at)}</strong></div>
      </section>

      <div className="tabs" role="tablist">
        {tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)} key={tab}>{tab}<span>{tab === "全部" ? data.documents.length : (data.groups[tab]?.length || 0)}</span></button>)}
      </div>

      <section className="table-section project-documents">
        <div className="section-heading">
          <div><h2>{activeTab}文档</h2><p>点击标题进入 Markdown 编辑器</p></div>
        </div>
        {visibleDocuments.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>文档</th><th>类型</th><th>状态</th><th>字数</th><th>最近修改</th><th aria-label="操作" /></tr></thead>
              <tbody>{visibleDocuments.map((document) => (
                <tr key={document.path}>
                  <td><Link className="document-link" to={`/editor/${encodeURIComponent(project)}?path=${encodeURIComponent(document.path)}`}><FileText size={17} /><span><strong>{document.title}</strong><small>{document.path}</small></span></Link></td>
                  <td>{document.kind}</td>
                  <td>{document.kind === "正文" ? (
                    <select className="status-select" value={document.status} onChange={(event) => updateStatus(document, event.target.value as ChapterState)} aria-label={`${document.title}状态`}>
                      {data.chapter_states.map((state) => <option key={state}>{state}</option>)}
                    </select>
                  ) : <StatusBadge value={document.status} />}</td>
                  <td>{formatNumber(document.word_count)}</td>
                  <td>{formatDate(document.modified_at)}</td>
                  <td><div className="row-actions"><Link className="icon-button" title="编辑文档" to={`/editor/${encodeURIComponent(project)}?path=${encodeURIComponent(document.path)}`}><PenLine size={16} /></Link><button className="icon-button" title="重命名或移入回收站" onClick={() => setManagedDocument(document)}><Settings2 size={16} /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-documents"><FilePlus2 size={25} /><strong>还没有{activeTab}文档</strong><button className="button" onClick={() => setCreating(true)}>创建第一份</button></div>}
      </section>

      <section className="project-bottom-grid">
        <div className="panel outline-panel">
          <div className="section-heading"><div><h2><ScrollText size={18} /> 当前大纲</h2><p>项目中第一份大纲的内容片段</p></div></div>
          {data.outline_excerpt ? <pre>{data.outline_excerpt}</pre> : <div className="empty-inline">尚未建立大纲</div>}
        </div>
        <div className="panel readiness-panel">
          <div className="section-heading"><div><h2><Settings2 size={18} /> 创作准备</h2><p>进入正文前的基础材料</p></div></div>
          <Readiness label="大纲" ready={data.has_outline} />
          <Readiness label="世界与人物设定" ready={data.has_settings} />
          <Readiness label="正文文档" ready={data.chapter_count > 0} />
        </div>
        <div className="panel activity-panel">
          <div className="section-heading"><div><h2><History size={18} /> 最近活动</h2><p>由 Studio 记录的文件操作</p></div></div>
          {data.recent_activity.length ? data.recent_activity.slice(0, 6).map((activity) => <div className="activity-row" key={`${activity.at}-${activity.action}-${activity.path}`}><span>{activityLabel(activity.action)}</span><div><strong>{activity.path || data.title}</strong><small>{formatDate(activity.at)}{activity.word_delta ? ` · ${activity.word_delta > 0 ? "+" : ""}${activity.word_delta} 字` : ""}</small></div></div>) : <div className="empty-inline">暂无 Studio 活动记录</div>}
        </div>
      </section>

      {creating && <CreateDocumentDialog project={project} defaultKind={activeTab === "全部" ? "正文" : activeTab} onClose={() => setCreating(false)} onCreated={(path) => navigate(`/editor/${encodeURIComponent(project)}?path=${encodeURIComponent(path)}`)} />}
      {editingProject && <ProjectSettingsDialog data={data} onClose={() => setEditingProject(false)} onSaved={(next) => { setData(next); setEditingProject(false); }} />}
      {managedDocument && <ManageDocumentDialog project={project} summary={managedDocument} onClose={() => setManagedDocument(null)} onChanged={() => { setManagedDocument(null); void load(); }} />}
      {trashOpen && <TrashDialog project={project} onClose={() => setTrashOpen(false)} onRestored={() => void load()} />}
    </Shell>
  );
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return <div className="readiness-row"><span className={ready ? "ready-dot" : "missing-dot"} /><strong>{label}</strong><small>{ready ? "已建立" : "待补充"}</small></div>;
}

function activityLabel(action: string): string {
  return ({
    create_project: "创建",
    update_project: "资料",
    create_document: "新建",
    save_document: "保存",
    rename_document: "改名",
    delete_document: "删除",
    restore_history: "恢复",
    restore_trash: "找回",
  } as Record<string, string>)[action] || "操作";
}

function ProjectSettingsDialog({ data, onClose, onSaved }: { data: ProjectDetail; onClose: () => void; onSaved: (data: ProjectDetail) => void }) {
  const [input, setInput] = useState<ProjectInput>({ title: data.title, genre: data.genre, platform: data.platform, target_words: data.target_words, status: data.project_status });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.title.trim()) return setError("书名不能为空");
    setBusy(true);
    try {
      onSaved(await api.updateProject(data.id, input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
      setBusy(false);
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><form className="dialog project-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
    <div><h2>项目资料</h2><p>这些信息只用于 Studio 管理，不会改动正文</p></div>
    <div className="form-grid">
      <label className="form-span">书名<input value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} /></label>
      <label>题材<input value={input.genre} onChange={(event) => setInput({ ...input, genre: event.target.value })} placeholder="尚未确定" /></label>
      <label>目标平台<select value={input.platform} onChange={(event) => setInput({ ...input, platform: event.target.value })}>{data.platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>项目状态<select value={input.status} onChange={(event) => setInput({ ...input, status: event.target.value })}>{data.project_states.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>目标总字数<input type="number" min="0" step="10000" value={input.target_words || ""} onChange={(event) => setInput({ ...input, target_words: Number(event.target.value) })} placeholder="不填写则按定稿章节显示进度" /></label>
    </div>
    {error && <span className="form-error">{error}</span>}
    <div className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy}>{busy ? "保存中" : "保存资料"}</button></div>
  </form></div>;
}

function ManageDocumentDialog({ project, summary, onClose, onChanged }: { project: string; summary: DocumentSummary; onClose: () => void; onChanged: () => void }) {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [newPath, setNewPath] = useState(summary.path);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api.document(project, summary.path).then(setDocument).catch((reason: Error) => setError(reason.message));
  }, [project, summary.path]);

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!document || newPath === document.path) return;
    const normalized = newPath.trim().replace(/\\/g, "/");
    if (!normalized.endsWith(".md")) return setError("文档路径必须以 .md 结尾");
    setBusy(true);
    try {
      await api.renameDocument(document, normalized);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重命名失败");
      setBusy(false);
    }
  }

  async function remove() {
    if (!document) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await api.deleteDocument(document);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
      setBusy(false);
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><form className="dialog" onSubmit={rename} onMouseDown={(event) => event.stopPropagation()}>
    <div><h2>管理文档</h2><p>重命名会保留状态；删除只会移入项目回收站</p></div>
    <label>项目内路径<input value={newPath} onChange={(event) => { setNewPath(event.target.value); setConfirmDelete(false); }} /></label>
    {error && <span className="form-error">{error}</span>}
    <div className="dialog-actions dialog-actions-split"><button className={`button ${confirmDelete ? "button-danger" : ""}`} type="button" disabled={busy || !document} onClick={remove}><Trash2 size={15} /> {confirmDelete ? "再次点击确认" : "移入回收站"}</button><span /><button className="button" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy || !document || newPath === document?.path}>保存路径</button></div>
  </form></div>;
}

function TrashDialog({ project, onClose, onRestored }: { project: string; onClose: () => void; onRestored: () => void }) {
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [error, setError] = useState("");
  const loadTrash = () => api.trash(project).then(setEntries).catch((reason: Error) => setError(reason.message));
  useEffect(() => { void loadTrash(); }, [project]);

  async function restore(entry: TrashEntry) {
    try {
      await api.restoreTrash(project, entry.id);
      await loadTrash();
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复失败");
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><div className="dialog trash-dialog" onMouseDown={(event) => event.stopPropagation()}>
    <div><h2>项目回收站</h2><p>被删除的 Markdown 文档可以恢复到原位置</p></div>
    {error && <span className="form-error">{error}</span>}
    <div className="trash-list">{entries === null ? <LoadingState label="正在读取回收站" /> : entries.length ? entries.map((entry) => <div key={entry.id}><FileText size={17} /><span><strong>{entry.original_path}</strong><small>{formatDate(entry.deleted_at)} · {formatNumber(entry.word_count)} 字</small></span><button className="button" onClick={() => restore(entry)}><ArchiveRestore size={15} /> 恢复</button></div>) : <div className="empty-inline">回收站为空</div>}</div>
    <div className="dialog-actions"><button className="button" onClick={onClose}>关闭</button></div>
  </div></div>;
}

function CreateDocumentDialog({ project, defaultKind, onClose, onCreated }: { project: string; defaultKind: string; onClose: () => void; onCreated: (path: string) => void }) {
  const [kind, setKind] = useState(["正文", "大纲", "设定", "状态", "记忆"].includes(defaultKind) ? defaultKind : "正文");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const safeName = name.trim().replace(/[\\/:*?"<>|]/g, "");
    if (!safeName) return setError("请输入文档名称");
    const path = `${kind}/${safeName}.md`;
    setBusy(true);
    try {
      await api.createDocument(project, path, `# ${safeName}\n\n`);
      onCreated(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div><h2>新建项目文档</h2><p>文件会直接创建在当前小说项目中</p></div>
        <label>文档类型<select value={kind} onChange={(event) => setKind(event.target.value)}>{["正文", "大纲", "设定", "状态", "记忆"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>文档名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "正文" ? "第004章 章节名" : "第一卷大纲"} /></label>
        {error && <span className="form-error">{error}</span>}
        <div className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy}>{busy ? "正在创建" : "创建并编辑"}</button></div>
      </form>
    </div>
  );
}
