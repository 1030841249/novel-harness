import { Bot, BookOpenCheck, Check, Clock3, Lightbulb, MessageSquareText, Plus, Send, Settings2, Square, User } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";
import type { ChatMessage, ChatSession, ChatStatus, DocumentData, HistoryEntry } from "../types";
import { formatDate, formatNumber } from "../utils";

interface Suggestion {
  title: string;
  body: string;
}

interface CoachPanelProps {
  project: string;
  document: DocumentData;
  content: string;
  history: HistoryEntry[];
  suggestions: Suggestion[];
  todos: string[];
  onAddTodo: (title: string) => void;
  onRestoreVersion: (entry: HistoryEntry) => void;
  wordCount: number;
  paragraphCount: number;
  configVersion: number;
  onConfigure: () => void;
}

type CoachTab = "chat" | "suggestions" | "history";

export function CoachPanel(props: CoachPanelProps) {
  const [tab, setTab] = useState<CoachTab>("chat");
  return <aside className="coach-panel">
    <div className="coach-section coach-summary">
      <div className="coach-title"><BookOpenCheck size={17} /><strong>创作陪练</strong><span>{props.document.path.split("/")[0]}</span></div>
      <dl className="document-meta"><div><dt>字数</dt><dd>{formatNumber(props.wordCount)}</dd></div><div><dt>段落</dt><dd>{props.paragraphCount}</dd></div><div><dt>修改</dt><dd>{formatDate(props.document.modified_at)}</dd></div></dl>
    </div>
    <div className="coach-tabs" role="tablist">
      <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageSquareText size={14} /> 对话</button>
      <button className={tab === "suggestions" ? "active" : ""} onClick={() => setTab("suggestions")}><Lightbulb size={14} /> 建议</button>
      <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><Clock3 size={14} /> 历史</button>
    </div>
    {tab === "chat" && <ChatWorkspace project={props.project} path={props.document.path} content={props.content} configVersion={props.configVersion} onConfigure={props.onConfigure} />}
    {tab === "suggestions" && <div className="coach-section coach-tab-content coach-suggestions">
      <div className="coach-title"><Lightbulb size={17} /><strong>本地建议</strong><span>不改正文</span></div>
      {props.suggestions.map((suggestion) => <div className="suggestion" key={suggestion.title}>
        <strong>{suggestion.title}</strong><p>{suggestion.body}</p>
        <button disabled={props.todos.includes(suggestion.title)} onClick={() => props.onAddTodo(suggestion.title)}>{props.todos.includes(suggestion.title) ? <><Check size={13} /> 已加入待办</> : "采纳为待办"}</button>
      </div>)}
      {props.todos.length > 0 && <div className="todo-section"><div className="coach-title"><Check size={17} /><strong>本次精修待办</strong></div>{props.todos.map((todo) => <label key={todo}><input type="checkbox" /> <span>{todo}</span></label>)}</div>}
    </div>}
    {tab === "history" && <div className="coach-section coach-tab-content history-section">
      <div className="coach-title"><Clock3 size={17} /><strong>历史版本</strong><span>{props.history.length}</span></div>
      {props.history.length ? props.history.slice(0, 8).map((entry) => <div className="history-entry" key={entry.id}><div><strong>{formatDate(entry.created_at)}</strong><small>{formatNumber(entry.word_count)} 字 · {entry.preview || "空文档"}</small></div><button title="恢复此版本" onClick={() => props.onRestoreVersion(entry)}><Clock3 size={14} /></button></div>) : <p className="coach-empty">首次保存修改后会自动保留历史</p>}
    </div>}
  </aside>;
}

function ChatWorkspace({ project, path, content, configVersion, onConfigure }: { project: string; path: string; content: string; configVersion: number; onConfigure: () => void }) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setSession(null);
    setMessages([]);
    setError("");
    Promise.all([api.chatStatus(), api.chatSessions(project, path)]).then(([nextStatus, nextSessions]) => {
      if (!active) return;
      setStatus(nextStatus);
      setSessions(nextSessions);
      setSession(nextSessions[0] || null);
      setMessages(nextSessions[0]?.messages || []);
    }).catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [project, path, configVersion]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function selectSession(sessionId: string) {
    const next = sessions.find((item) => item.id === sessionId);
    if (!next) return;
    setSession(next);
    setMessages(next.messages);
    setError("");
  }

  function startNewSession() {
    if (streaming) return;
    setSession(null);
    setMessages([]);
    setInput("");
    setError("");
  }

  async function sendMessage(rawMessage?: string) {
    const message = (rawMessage ?? input).trim();
    if (!message || streaming || !status?.enabled) return;
    setError("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let pendingAssistantId = "";
    try {
      const activeSession = session || await api.createChatSession(project, path);
      if (!session) {
        setSession(activeSession);
        setSessions((current) => [activeSession, ...current]);
      }
      const now = new Date().toISOString();
      const userMessage: ChatMessage = { id: `local-user-${now}`, role: "user", content: message, created_at: now };
      const assistantMessage: ChatMessage = { id: `local-assistant-${now}`, role: "assistant", content: "", created_at: now };
      pendingAssistantId = assistantMessage.id;
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setInput("");
      await api.streamChatMessage(project, activeSession.id, message, content, (event) => {
        if (event.type === "delta") {
          setMessages((current) => current.map((item) => item.id === assistantMessage.id ? { ...item, content: item.content + event.content } : item));
        } else if (event.type === "error") {
          setError(event.message);
          setMessages((current) => current.filter((item) => item.id !== assistantMessage.id));
        } else if (event.type === "done") {
          setSession(event.session);
          setMessages(event.session.messages);
          setSessions((current) => [event.session, ...current.filter((item) => item.id !== event.session.id)]);
        }
      }, controller.signal);
    } catch (reason) {
      if (pendingAssistantId) setMessages((current) => current.filter((item) => item.id !== pendingAssistantId));
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "对话失败");
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  return <div className="coach-tab-content chat-workspace">
    <div className="chat-toolbar">
      <select aria-label="对话会话" value={session?.id || ""} onChange={(event) => void selectSession(event.target.value)} disabled={!sessions.length || streaming}>
        {!session && <option value="">新对话</option>}
        {sessions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select>
      <button className="icon-button" title="新建对话" onClick={startNewSession} disabled={streaming}><Plus size={16} /></button>
    </div>
    {!status ? <p className="chat-state">正在读取模型配置</p> : !status.enabled ? <div className="chat-unconfigured"><Bot size={22} /><strong>AI 模型尚未配置</strong><p>{status.message}</p><button className="button button-primary" type="button" onClick={onConfigure}><Settings2 size={15} /> 配置 AI 模型</button></div> : <>
      <div className="chat-model"><span className="ready-dot" /> {status.model}<small>当前文档 + 大纲</small></div>
      <div className="chat-messages">
        {!messages.length && <div className="chat-empty"><Bot size={24} /><strong>从当前章节开始</strong><p>选择一个动作，或直接输入你卡住的地方。</p></div>}
        {messages.map((message) => <div className={`chat-message chat-${message.role}`} key={message.id}>
          <span>{message.role === "user" ? <User size={14} /> : <Bot size={14} />}</span>
          <div>{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown> : <i className="typing-dot" />}</div>
        </div>)}
        <div ref={endRef} />
      </div>
      {!messages.length && <div className="chat-quick-actions">
        {["下一段怎么写", "把本章拆成空瓶", "检查当前章节的问题"].map((action) => <button key={action} onClick={() => void sendMessage(action)}>{action}</button>)}
      </div>}
      {error && <p className="chat-error">{error}</p>}
      <form className="chat-composer" onSubmit={submit}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="询问下一块、剧情方向或局部问题" rows={3} disabled={streaming} />
        {streaming ? <button className="icon-button chat-send" type="button" title="停止生成" onClick={() => abortRef.current?.abort()}><Square size={15} /></button> : <button className="icon-button chat-send" title="发送" disabled={!input.trim()}><Send size={16} /></button>}
      </form>
    </>}
  </div>;
}
