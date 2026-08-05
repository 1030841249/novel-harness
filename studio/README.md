# Novel Harness Studio

Studio 是 `novel-harness` 的本地可视化创作工作台。它直接读取仓库根目录的 `projects/`，不把小说正文复制到数据库。

## 功能

- Dashboard 汇总小说、章节、字数、待精修项和最近编辑。
- 项目页按正文、大纲、设定、状态、记忆管理 Markdown 文档。
- 支持 `正文/*.md` 与根目录单文件 `正文.md` 两种项目结构。
- Markdown 编辑、分栏预览和新建文档。
- 创建小说项目，维护题材、平台、目标字数和连载状态。
- 文档重命名、回收站恢复和历史版本恢复。
- 浏览器本地草稿、离开提醒和磁盘外部修改检测。
- `Ctrl+K` 搜索全部项目与 Markdown 文档。
- 保存前校验文件版本；外部程序改过文件时返回冲突，不静默覆盖。
- 每次内容变更前，将旧版本保存在项目内 `.novel-harness/history/`。

## 启动

在仓库根目录执行：

```powershell
python studio/run.py
```

首次运行会自动安装前端依赖并构建页面，随后打开 `http://127.0.0.1:8765`。服务只监听本机地址。

如果缺少 Python 依赖，先执行：

```powershell
pip install -r studio/backend/requirements.txt
```

开发前端时可以分别启动服务：

```powershell
cd studio/frontend
npm.cmd install
npm.cmd run dev
cd ../..
python -m uvicorn studio.backend.app:app --host 127.0.0.1 --port 8765
```

## 边界

当前陪练建议来自本地文档结构检查，不调用模型，也不会自动改正文。后续接入 Agent 时，建议仍应以提案或差异形式展示，必须由用户确认后才能写入 Markdown。

项目内 `.novel-harness/` 属于 Studio 运行数据，其中包含元数据、活动、历史和回收站。小说项目整体仍由根目录 `.gitignore` 排除，不会随公开仓库上传。
