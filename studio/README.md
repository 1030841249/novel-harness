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
- 编辑器内实时 AI 对话，自动携带当前文档、项目资料和大纲摘要。
- AI 会话保存在项目 `.novel-harness/chat/`，刷新后可以继续。
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

## AI 对话配置

Studio 支持 OpenAI 兼容的 `chat/completions` 流式接口。启动后点击左侧 **AI 模型设置**，或编辑器顶部的齿轮按钮：

1. 选择 OpenAI、DeepSeek、硅基流动、Ollama、LM Studio 或其他兼容服务。
2. 确认接口地址；在线服务填写 API Key，本地服务通常可以留空。
3. 点击 **读取模型**，从服务返回的模型中选择；如果服务不支持模型列表，可以直接填写模型 ID。
4. 点击 **保存并启用**。设置立即生效，不需要重启 Studio。

本地配置保存在 `.harness/local/studio-ai.json`，该目录已加入 `.gitignore`。API Key 只由本地 Python 后端读取，读取配置的接口只返回“是否已设置”，不会向浏览器回显密钥，也不会写入小说正文。

服务器部署或自动化启动时，也可以使用环境变量：

```powershell
$env:NOVEL_HARNESS_AI_BASE_URL="https://你的模型服务/v1"
$env:NOVEL_HARNESS_AI_MODEL="模型名称"
$env:NOVEL_HARNESS_AI_API_KEY="模型服务密钥"
python studio/run.py
```

使用 Ollama、LM Studio 等不需要密钥的本地兼容服务时，可以不设置 `NOVEL_HARNESS_AI_API_KEY`。默认请求超时为 120 秒，可以通过 `NOVEL_HARNESS_AI_TIMEOUT_SECONDS` 调整。网页保存的本地设置优先于环境变量；清除本地设置后会重新使用环境变量。

当前对话能力只提供陪练建议，不会自动改写 Markdown。发送消息时会把当前编辑器里尚未保存的内容作为临时上下文交给模型；会话历史作为 Studio 运行数据保存在当前项目中。

## 边界

本地结构建议不依赖模型；AI 对话是可选能力。两者都不会自动修改正文，后续文件操作仍应以提案或差异形式展示，必须由用户确认后才能写入 Markdown。

项目内 `.novel-harness/` 属于 Studio 运行数据，其中包含元数据、活动、历史和回收站。小说项目整体仍由根目录 `.gitignore` 排除，不会随公开仓库上传。
