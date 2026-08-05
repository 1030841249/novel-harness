import { ArrowRight, BookOpenText, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState, StatusBadge } from "../components/Common";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { Shell } from "../components/Shell";
import { Link, useNavigate } from "../router";
import type { DashboardData } from "../types";
import { formatDate, formatNumber, projectInitial } from "../utils";

export function ProjectsLibrary() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.dashboard().then(setData).catch((reason: Error) => setError(reason.message));
  }, []);

  const projects = useMemo(() => {
    if (!data) return [];
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return data.projects;
    return data.projects.filter((project) => `${project.title} ${project.name} ${project.genre} ${project.platform} ${project.project_status}`.toLowerCase().includes(keyword));
  }, [data, filter]);

  if (error) return <Shell title="小说项目"><ErrorState message={error} /></Shell>;
  if (!data) return <Shell title="小说项目"><LoadingState label="正在读取项目列表" /></Shell>;

  return <Shell title="小说项目" subtitle={`${data.projects.length} 个本地项目 · ${formatNumber(data.totals.words)} 正文字数`} actions={<button className="button button-primary" onClick={() => setCreating(true)}><Plus size={16} /> 新建小说</button>}>
    <section className="library-toolbar">
      <div className="library-filter"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选书名、题材、平台或状态" /><span>{projects.length} / {data.projects.length}</span></div>
    </section>

    <section className="table-section library-table-section">
      <div className="section-heading"><div><h2><BookOpenText size={18} /> 全部小说</h2><p>项目目录位于本地 projects/，正文不进入数据库</p></div></div>
      {projects.length ? <div className="table-scroll"><table className="data-table library-table">
        <thead><tr><th>项目</th><th>状态</th><th>题材 / 平台</th><th>正文</th><th>字数进度</th><th>当前字数</th><th>最近修改</th><th aria-label="操作" /></tr></thead>
        <tbody>{projects.map((project, index) => <tr key={project.id}>
          <td><Link className="project-cell" to={`/projects/${encodeURIComponent(project.id)}`}><span className={`project-cover cover-${index % 4}`}>{projectInitial(project.title)}</span><span><strong>{project.title}</strong><small>{project.name}</small></span></Link></td>
          <td><StatusBadge value={project.project_status} /></td>
          <td><strong className="table-primary">{project.genre || "未设题材"}</strong><small className="table-secondary">{project.platform}</small></td>
          <td>{project.chapter_count} 篇</td>
          <td><div className="progress-cell"><div><span style={{ width: `${project.target_words ? project.word_progress : project.progress}%` }} /></div><small>{project.target_words ? `${project.word_progress}%` : `${project.progress}%`}</small></div></td>
          <td>{formatNumber(project.word_count)}</td>
          <td>{formatDate(project.modified_at)}</td>
          <td><Link className="icon-button" title="打开项目" to={`/projects/${encodeURIComponent(project.id)}`}><ArrowRight size={17} /></Link></td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-documents"><BookOpenText size={26} /><strong>{filter ? "没有匹配的小说项目" : "还没有小说项目"}</strong>{!filter && <button className="button" onClick={() => setCreating(true)}>创建第一本小说</button>}</div>}
    </section>
    {creating && <CreateProjectDialog onClose={() => setCreating(false)} onCreated={(project) => navigate(`/projects/${encodeURIComponent(project)}`)} />}
  </Shell>;
}
