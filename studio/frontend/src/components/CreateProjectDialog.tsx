import { FormEvent, useState } from "react";
import { api } from "../api";
import type { ProjectInput } from "../types";

export function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (project: string) => void }) {
  const [input, setInput] = useState<ProjectInput>({ name: "", title: "", genre: "", platform: "未指定", target_words: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = input.name?.trim() || input.title.trim();
    if (!name) return setError("请输入书名或项目目录名");
    setBusy(true);
    try {
      const project = await api.createProject({ ...input, name, title: input.title.trim() || name });
      onCreated(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="dialog project-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div><h2>新建小说项目</h2><p>创建本地目录与创作资料分类，不生成正文</p></div>
        <div className="form-grid">
          <label className="form-span">书名<input autoFocus value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} placeholder="暂定书名也可以" /></label>
          <label className="form-span">项目目录名<input value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} placeholder="留空时使用书名" /></label>
          <label>题材<input value={input.genre} onChange={(event) => setInput({ ...input, genre: event.target.value })} placeholder="都市、求生、玄幻" /></label>
          <label>目标平台<select value={input.platform} onChange={(event) => setInput({ ...input, platform: event.target.value })}>{["未指定", "番茄", "起点", "晋江", "知乎", "其他"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="form-span">目标总字数<input type="number" min="0" step="10000" value={input.target_words || ""} onChange={(event) => setInput({ ...input, target_words: Number(event.target.value) })} placeholder="例如 1000000，可暂不填写" /></label>
        </div>
        {error && <span className="form-error">{error}</span>}
        <div className="dialog-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={busy}>{busy ? "正在创建" : "创建项目"}</button></div>
      </form>
    </div>
  );
}
