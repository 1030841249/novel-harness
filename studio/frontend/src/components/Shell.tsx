import {
  BookOpenText,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Search,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Link, useLocation } from "../router";
import type { SearchResult } from "../types";

interface ShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  fullWidth?: boolean;
}

export function Shell({ children, title, subtitle, actions, fullWidth = false }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || !query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api.search(query.trim()).then(setResults).finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">NH</div>
          <div>
            <strong>Novel Harness</strong>
            <span>Writing Studio</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} title="关闭导航">
            <X size={18} />
          </button>
        </div>
        <nav className="primary-nav" aria-label="主导航">
          <Link className={location.pathname === "/" ? "active" : ""} to="/" onClick={() => setMobileOpen(false)}>
            <LayoutDashboard size={18} />
            工作台
          </Link>
          <Link className={location.pathname.startsWith("/projects") ? "active" : "muted-link"} to="/projects" onClick={() => setMobileOpen(false)}>
            <BookOpenText size={18} />
            小说项目
          </Link>
          <button className="muted-link" type="button" disabled title="知识包管理将在后续版本开放">
            <Boxes size={18} />
            知识包
            <span className="nav-badge">后续</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status"><span /> 本地文件模式</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} title="打开导航">
            <Menu size={20} />
          </button>
          <div className="page-heading">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="topbar-search" type="button" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <span>搜索项目与文档</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">{actions}</div>
        </header>
        <div className={fullWidth ? "page-content page-content-full" : "page-content"}>{children}</div>
      </main>
      {mobileOpen && <button className="mobile-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      {searchOpen && (
        <div className="search-backdrop" role="presentation" onMouseDown={() => setSearchOpen(false)}>
          <div className="search-dialog" role="dialog" aria-label="搜索项目与文档" onMouseDown={(event) => event.stopPropagation()}>
            <div className="search-input-row"><Search size={18} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入书名、章节名或路径" /><kbd>Esc</kbd></div>
            <div className="search-results">
              {!query.trim() && <span className="search-hint">输入关键词开始搜索</span>}
              {searching && <span className="search-hint">正在搜索本地文档</span>}
              {query.trim() && !searching && !results.length && <span className="search-hint">没有找到匹配内容</span>}
              {results.map((result) => (
                <Link key={`${result.project}-${result.path}-${result.title}`} to={result.path ? `/editor/${encodeURIComponent(result.project)}?path=${encodeURIComponent(result.path)}` : `/projects/${encodeURIComponent(result.project)}`} onClick={() => setSearchOpen(false)}>
                  <span>{result.type}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div><ChevronRight size={16} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
