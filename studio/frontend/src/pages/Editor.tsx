import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError, api } from "../api";
import { AISettingsDialog } from "../components/AISettingsDialog";
import { CoachPanel } from "../components/CoachPanel";
import { ErrorState, LoadingState } from "../components/Common";
import { Link, useParams, useSearchParams } from "../router";
import type { DocumentData, HistoryEntry, ProjectDetail } from "../types";
import { formatDate } from "../utils";

type EditorMode = "edit" | "split" | "preview";

export function Editor() {
  const { project = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const path = params.get("path") || "";
  const [projectData, setProjectData] = useState<ProjectDetail | null>(null);
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<EditorMode>("split");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 1100);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 正文: true, 大纲: true, 设定: true });
  const [todos, setTodos] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [draft, setDraft] = useState<{ content: string; savedAt: string } | null>(null);
  const [externalChanged, setExternalChanged] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatConfigVersion, setChatConfigVersion] = useState(0);

  const loadDocument = (discardDraft = false) => {
    if (!path) return;
    setError("");
    setExternalChanged(false);
    api.document(project, path).then((next) => {
      setDocument(next);
      setContent(next.content);
      setSavedAt("");
      void api.history(project, path).then(setHistory);
      const key = draftKey(project, path);
      if (discardDraft) localStorage.removeItem(key);
      const stored = discardDraft ? null : readDraft(key);
      setDraft(stored && stored.content !== next.content ? stored : null);
    }).catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    api.project(project).then((detail) => {
      setProjectData(detail);
      if (!path && detail.documents[0]) setParams({ path: detail.documents[0].path }, { replace: true });
    }).catch((reason: Error) => setError(reason.message));
  }, [project]);
  useEffect(() => { loadDocument(); }, [project, path]);

  const dirty = Boolean(document && content !== document.content);
  const suggestions = useMemo(() => buildSuggestions(content), [content]);

  async function save() {
    if (!document || !dirty) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api.saveDocument(document, content);
      setDocument(saved);
      setContent(saved.content);
      setSavedAt(new Date().toISOString());
      localStorage.removeItem(draftKey(project, document.path));
      setDraft(null);
      setHistory(await api.history(project, document.path));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setError("文件在编辑期间被外部修改。当前内容没有被覆盖，请刷新后手动合并。")
      } else {
        setError(reason instanceof Error ? reason.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [document, content, dirty]);

  useEffect(() => {
    if (!document) return;
    const key = draftKey(project, document.path);
    if (!dirty) {
      localStorage.removeItem(key);
      return;
    }
    const timer = window.setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ content, savedAt: new Date().toISOString() }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [content, dirty, document, project]);

  useEffect(() => {
    const preventClose = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty]);

  useEffect(() => {
    if (!document) return;
    const check = async () => {
      try {
        const current = await api.documentRevision(project, document.path);
        setExternalChanged(current.revision !== document.revision);
      } catch {
        setExternalChanged(true);
      }
    };
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [document, project]);

  function openDocument(nextPath: string) {
    if (dirty && !window.confirm("当前修改尚未保存。草稿已保留，确定切换文档吗？")) return;
    setParams({ path: nextPath });
  }

  function restoreDraft() {
    if (!draft) return;
    setContent(draft.content);
    setDraft(null);
  }

  async function restoreVersion(entry: HistoryEntry) {
    if (!document || !window.confirm("恢复该历史版本？当前版本会先自动备份。")) return;
    try {
      const restored = await api.restoreHistory(document, entry.id);
      setDocument(restored);
      setContent(restored.content);
      setHistory(await api.history(project, restored.path));
      localStorage.removeItem(draftKey(project, restored.path));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复历史版本失败");
    }
  }

  if (error && !document) return <div className="editor-error-page"><ErrorState message={error} action={<Link className="button" to={`/projects/${encodeURIComponent(project)}`}>返回项目</Link>} /></div>;
  if (!projectData || !document) return <div className="editor-loading"><LoadingState label="正在打开 Markdown 文档" /></div>;

  return (
    <div className={`editor-shell ${rightOpen ? "" : "right-closed"}`}>
      <header className="editor-topbar">
        <Link className="icon-button" title="返回项目" to={`/projects/${encodeURIComponent(project)}`} onClick={(event) => { if (dirty && !window.confirm("当前修改尚未保存。草稿已保留，确定返回项目吗？")) event.preventDefault(); }}><ArrowLeft size={19} /></Link>
        <div className="editor-title"><strong>{document.path.split("/").pop()?.replace(/\.md$/, "")}</strong><span>{project}</span></div>
        <div className="save-state">{dirty ? <><span className="dirty-dot" /> 未保存</> : <><Check size={14} /> {savedAt ? `${formatDate(savedAt)} 已保存` : "已同步"}</>}</div>
        <div className="mode-switch" aria-label="编辑器显示模式">
          <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>编辑</button>
          <button className={mode === "split" ? "active" : ""} onClick={() => setMode("split")}>分栏</button>
          <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>预览</button>
        </div>
        <button className="icon-button" title="AI 模型设置" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
        <button className="icon-button" title={rightOpen ? "收起陪练栏" : "展开陪练栏"} onClick={() => setRightOpen((value) => !value)}>{rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
        <button className="button button-primary" onClick={save} disabled={!dirty || saving}><Save size={16} /> {saving ? "保存中" : "保存"}</button>
      </header>

      {(error || externalChanged) && <div className="conflict-banner"><span>{error || "磁盘文件已在 Studio 外部发生变化，当前编辑内容尚未被覆盖。"}</span><button onClick={() => loadDocument(true)}><RefreshCw size={15} /> 放弃本地修改并刷新</button></div>}
      {draft && <div className="draft-banner"><span>发现 {formatDate(draft.savedAt)} 保存的本地草稿</span><div><button onClick={() => { localStorage.removeItem(draftKey(project, path)); setDraft(null); }}>忽略</button><button onClick={restoreDraft}><RotateCcw size={14} /> 恢复草稿</button></div></div>}

      <aside className="document-tree">
        <div className="tree-heading">项目文档 <span>{projectData.documents.length}</span></div>
        {Object.entries(projectData.groups).map(([kind, documents]) => (
          <div className="tree-group" key={kind}>
            <button onClick={() => setExpanded((current) => ({ ...current, [kind]: !current[kind] }))}>{expanded[kind] === false ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<strong>{kind}</strong><span>{documents.length}</span></button>
            {expanded[kind] !== false && documents.map((item) => (
              <button className={`tree-file ${item.path === path ? "active" : ""}`} onClick={() => openDocument(item.path)} key={item.path} title={item.path}>
                <FileText size={14} /><span>{item.title}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className={`writing-surface mode-${mode}`}>
        {mode !== "preview" && <div className="editor-pane"><CodeMirror value={content} onChange={setContent} extensions={[markdown()]} theme="light" height="100%" basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} /></div>}
        {mode !== "edit" && <article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></article>}
      </main>

      <CoachPanel
        project={project}
        document={document}
        content={content}
        history={history}
        suggestions={suggestions}
        todos={todos}
        onAddTodo={(title) => setTodos((current) => [...current, title])}
        onRestoreVersion={(entry) => void restoreVersion(entry)}
        wordCount={countWords(content)}
        paragraphCount={content.split(/\n\s*\n/).filter(Boolean).length}
        configVersion={chatConfigVersion}
        onConfigure={() => setSettingsOpen(true)}
      />
      {settingsOpen && <AISettingsDialog onClose={() => setSettingsOpen(false)} onSaved={() => setChatConfigVersion((version) => version + 1)} />}
    </div>
  );
}

function draftKey(project: string, path: string): string {
  return `novel-harness:draft:${project}:${path}`;
}

function readDraft(key: string): { content: string; savedAt: string } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return typeof parsed?.content === "string" && typeof parsed?.savedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function countWords(content: string): number {
  const chinese = content.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latin = content.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:\.\d+)?/g)?.length || 0;
  return chinese + latin;
}

function buildSuggestions(content: string): { title: string; body: string }[] {
  const suggestions = [];
  const words = countWords(content);
  const longParagraphs = content.split(/\n\s*\n/).filter((paragraph) => countWords(paragraph) > 260).length;
  if (words < 1000) suggestions.push({ title: "补足关键镜头", body: "当前内容更接近剧情骨架。优先找一处转折，把人物动作、感受和场景反馈补成一个完整镜头。" });
  else suggestions.push({ title: "检查章节承诺", body: "确认本章开头提出的问题，在章末已经兑现、升级，或留下了清晰的新悬念。" });
  if (longParagraphs) suggestions.push({ title: "拆开长段落", body: `检测到 ${longParagraphs} 个较长段落。可按动作变化或说话人切开，避免信息挤在一块。` });
  else suggestions.push({ title: "保留人物反应", body: "检查关键变化之间是否有人物的迟疑、动作或误判，不要只剩信息推进。" });
  suggestions.push({ title: "人工精修一遍", body: "朗读人物对话，删掉不符合角色口气的解释句；建议只改最突出的几处，不做全文机械替换。" });
  return suggestions;
}
