import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FilePenLine,
  LibraryBig,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/Common";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { Shell } from "../components/Shell";
import { Link, useNavigate } from "../router";
import type { DashboardData } from "../types";
import { formatDate, formatNumber, projectInitial } from "../utils";

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.dashboard().then(setData).catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) return <Shell title="创作工作台"><ErrorState message={error} /></Shell>;
  if (!data) return <Shell title="创作工作台"><LoadingState /></Shell>;

  const activeProject = data.projects[0];

  return (
    <Shell
      title="创作工作台"
      subtitle="从项目进度继续，而不是从空白对话重新开始"
      actions={<div className="action-group">
        <button className="button" onClick={() => setCreating(true)}><Plus size={16} /> 新建小说</button>
        {activeProject && <Link className="button button-primary" to={`/projects/${encodeURIComponent(activeProject.id)}`}>继续创作 <ArrowRight size={16} /></Link>}
      </div>}
    >
      <section className="stats-grid" aria-label="创作统计">
        <Stat label="小说项目" value={data.totals.projects} detail="本地项目" icon={<LibraryBig size={19} />} tone="ink" />
        <Stat label="正文篇章" value={data.totals.chapters} detail="已建立文档" icon={<BookOpen size={19} />} tone="green" />
        <Stat label="正文总字数" value={formatNumber(data.totals.words)} detail="Markdown 统计" icon={<FilePenLine size={19} />} tone="blue" />
        <Stat label="待人工精修" value={data.totals.pending_revisions} detail="建议优先处理" icon={<Clock3 size={19} />} tone="amber" />
      </section>

      <section className="dashboard-grid">
        <div className="panel trend-panel">
          <div className="section-heading">
            <div><h2>写作活动趋势</h2><p>按 Studio 保存产生的字数变化统计</p></div>
            <span className="range-label">近 7 天</span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.writing_trend} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#267a57" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#267a57" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} axisLine={false} tickLine={false} tick={{ fill: "#798079", fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${formatNumber(Number(value))} 字`, "活跃文档"]} labelFormatter={(value) => String(value)} />
                <Area type="monotone" dataKey="words" stroke="#267a57" strokeWidth={2} fill="url(#activityFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel risk-panel">
          <div className="section-heading"><div><h2>项目提醒</h2><p>缺失的创作基础资料</p></div></div>
          <div className="risk-list">
            {data.warnings.length ? data.warnings.slice(0, 5).map((warning) => (
              <Link key={`${warning.project}-${warning.message}`} to={`/projects/${encodeURIComponent(warning.project)}`}>
                <AlertTriangle size={17} />
                <span><strong>{warning.project}</strong>{warning.message}</span>
                <ArrowRight size={15} />
              </Link>
            )) : (
              <div className="empty-inline"><CheckCircle2 size={18} /> 当前项目资料完整</div>
            )}
          </div>
        </div>
      </section>

      <section id="projects" className="table-section">
        <div className="section-heading">
          <div><h2>小说项目</h2><p>直接扫描 projects/，不复制正文</p></div>
          <span className="count-label">{data.projects.length} 个项目</span>
        </div>
        <div className="table-scroll">
          <table className="data-table project-table">
            <thead><tr><th>项目</th><th>篇章</th><th>字数进度</th><th>字数</th><th>待精修</th><th>最近修改</th><th aria-label="操作" /></tr></thead>
            <tbody>
              {data.projects.map((project, index) => (
                <tr key={project.id}>
                  <td>
                    <Link className="project-cell" to={`/projects/${encodeURIComponent(project.id)}`}>
                      <span className={`project-cover cover-${index % 4}`}>{projectInitial(project.title)}</span>
                      <span><strong>{project.title}</strong><small>{[project.genre, project.platform, `${project.document_count} 份文档`].filter(Boolean).join(" · ")}</small></span>
                    </Link>
                  </td>
                  <td>{project.chapter_count}</td>
                  <td><div className="progress-cell"><div><span style={{ width: `${project.target_words ? project.word_progress : project.progress}%` }} /></div><small>{project.target_words ? `${project.word_progress}%` : `${project.progress}%`}</small></div></td>
                  <td>{formatNumber(project.word_count)}</td>
                  <td>{project.pending_revisions ? <span className="pending-number">{project.pending_revisions}</span> : "-"}</td>
                  <td>{formatDate(project.modified_at)}</td>
                  <td><Link className="icon-button" title="打开项目" to={`/projects/${encodeURIComponent(project.id)}`}><ArrowRight size={17} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="recent-section">
        <div className="section-heading"><div><h2>最近编辑</h2><p>快速返回上一次工作的文档</p></div></div>
        <div className="recent-list">
          {data.recent_documents.map((document) => (
            <Link key={`${document.project}-${document.path}`} to={`/editor/${encodeURIComponent(document.project!)}?path=${encodeURIComponent(document.path)}`}>
              <span className="file-icon"><FilePenLine size={17} /></span>
              <span className="recent-main"><strong>{document.title}</strong><small>{document.project} · {document.path}</small></span>
              <span>{formatNumber(document.word_count)} 字</span>
              <time>{formatDate(document.modified_at)}</time>
            </Link>
          ))}
        </div>
      </section>
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} onCreated={(project) => navigate(`/projects/${encodeURIComponent(project)}`)} />}
    </Shell>
  );
}

function Stat({ label, value, detail, icon, tone }: { label: string; value: string | number; detail: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="stat-item">
      <span className={`stat-icon stat-${tone}`}>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>
    </div>
  );
}
