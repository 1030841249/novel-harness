# 系统架构

> 本文档详细说明 novel-harness 的四层架构设计、入口边界和目录结构。

---

## 四层架构（L0-L3）

```
L0（项目上下文）
   ├── 当前写哪本小说
   ├── 创作约束（成长曲线/防膨胀/阶段天花板）
   └── 文件：.harness/

L1（总编层）
   ├── 理解需求 → 分派任务 → 协调流程
   ├── 不执行具体工作，只做调度和质量管理
   └── 文件：.harness/agents/总编Agent.md

L2（专业 Agent 层）
   ├── 上下文 Agent — 状态管理 + 信息打包
   ├── 规划 Agent — 剧情构思 + 大纲生成
   ├── 写作 Agent — 分块陪写 + 可选正文粗稿
   ├── 审稿 Agent — 质量审查
   ├── subagent 运行时 — 受总编调度，知识只在任务作用域内生效
   └── 文件：agents/*.md

L3（数据层）
   ├── 本地项目文件：projects/{项目名}/正文/ 状态/ 记忆/（不随仓库上传）
   ├── 知识包：.harness/knowledge/included/ remote/ user/
   ├── 审查规则：game-datafied/ human-linguistics/ plot-review/ rhythm-review/
   ├── 案例库：cases/
   └── RAG 知识检索层：rag/ (混合检索 + Context Pack)
```

### L0 — 项目上下文

最底层，定义"当前在写什么"。

- `.harness/current-project.md`：指向当前激活的小说项目
- `.harness/project-templates/`：各题材的创作约束模板（成长曲线、防膨胀策略等）
- 所有上层 Agent 在做出决策前都会读取 L0 的约束

### L1 — 总编层

系统入口。唯一直接面对用户的层。

- 定义在 `.harness/agents/总编Agent.md` 中
- 接收用户的自然语言需求，理解意图，分派给对应的 L2 Agent
- 不做具体执行，只做调度和质量管理

### L2 — 专业 Agent 层

四个专业 Agent，各司其职：

| Agent | 职责 | 交付物 |
|-------|------|--------|
| 上下文 Agent | 主角状态追踪、伏笔管理、事件索引 | 上下文包 |
| 规划 Agent | 定向追问、剧情构思、大纲与设定候选 | 关键问题 + 2-3 个方向 |
| 写作 Agent | 按大纲拆分写作块；明确要求时生成正文粗稿 | 分块指引 / 待人工精修粗稿 |
| 审稿 Agent | 质量审查（语感/设定/情节/节奏） | 审查报告 |

subagent 运行时规则见 `.harness/rules/subagent-runtime.md`。总编 Agent 可以在知识包推荐、MCP 下载、RAG 重建、用户确认等待、临时 subagent 查询或脚本扫描时挂起主任务；临时任务完成后恢复原上下文继续执行，避免插队任务吃掉原任务，也避免题材包和 RAG 结果污染全局项目设定。

### L3 — 数据层

所有的数据和知识存储：

- **项目文件**：正文、大纲、设定、状态、记忆
- **知识包**：`.harness/knowledge/` 中的内置、远程、用户私有资料
- **审查规则**：各 skill 模块的规则和参考文档
- **RAG 知识检索**：为 Agent 提供即时知识查询的混合检索层

---

## 入口与目录边界

系统不再把多个独立 skill 直接暴露给用户选择，而是收束为一个总编入口：

- `README.md`：用户入口，说明项目怎么用、目录怎么理解。
- `skills/novel-core/SKILL.md`：Codex Skill 安装入口，负责触发 `/novel-core` 并路由到总编 Agent。
- `.harness/agents/总编Agent.md`：Agent 核心入口，由总编 Agent 识别需求、分派上下文/规划/写作/审稿任务。
- `.harness/skills/`：Harness 内部能力模块，只由 Agent 或工作流按需调用。
- `legacy-skills/`：旧版导入 skill 资产，不作为当前主入口。其中有价值的资料后续逐步迁移到 Harness 模块或 RAG 参考库。

这种收束是一次架构升级：用户不需要在大量 skill 中猜该调用哪一个，只需要描述目标，由总编 Agent 负责判断该走哪条流程、加载哪些模块和参考资料。

---

## 文件结构

```
novel-harness/
│
├── README.md                          ← 用户入口
├── AGENTS.md                          ← Codex / OpenCode 项目入口规则
├── CLAUDE.md                          ← Claude Code / Cursor 可参考入口规则
├── skills/novel-core/                 ← Codex Skill 安装入口
│
├── .harness/                         ← Harness 核心工程系统
│   ├── current-project.md            ← 当前项目指针
│   ├── project-templates/            ← 项目约束模板
│   ├── knowledge/                    ← RAG 知识包层
│   │   ├── included/                 ← 随项目自带的知识包
│   │   ├── packs/                    ← 知识包 manifest
│   │   ├── remote/                   ← MCP 下载的远程知识包（本地）
│   │   └── user/                     ← 用户私有知识包（本地）
│   ├── agents/
│   │   ├── 总编Agent.md              ← L1 协调层
│   │   ├── 上下文Agent.md            ← 记忆中枢
│   │   ├── 规划Agent.md              ← 剧情构思
│   │   ├── 写作Agent.md              ← 正文生成
│   │   └── 审稿Agent.md              ← 质量审查
│   ├── skills/
│   │   ├── game-datafied/            ← 题材审查
│   │   ├── human-linguistics/        ← 语感审查
│   │   ├── plot-review/              ← 情节审查
│   │   ├── rhythm-review/            ← 节奏审查
│   │   └── plot-ideation/            ← 创作灵感
│   ├── rules/                        ← 辅助规则、运行协议、总编按需索引
│   ├── memory/                       ← 记忆系统模板
│   └── cases/                        ← 案例/反馈
│
├── rag/                              ← L3 知识检索层
│   ├── src/                          ← 索引、检索、路由、服务
│   ├── scripts/                      ← 构建/查询 CLI
│   ├── config/                       ← 知识源/路由配置
│   ├── test/                         ← 验收测试
│   └── OPERATIONS.md                 ← 操作手册
│
├── docs/                             ← 详细文档
│   ├── architecture.md               ← 本文
│   ├── agents.md                     ← Agent 体系
│   ├── pipeline.md                   ← 创作管线
│   ├── usage.md                      ← 使用指南
│   └── scripts/install-skill.ps1      ← 可选 Skill 本地安装脚本
│
└── legacy-skills/                    ← 旧版导入 skill 资产（保留待迁移）
```

### 重要注释

- `.workspace/` 旧入口已废弃；当前项目指针统一使用 `.harness/current-project.md`
- `projects/{项目名}/` 是本地创作目录，仓库不保留空目录占位；开始创作时由 Agent 或用户在本地创建
- `legacy-skills/` 不是当前主入口。当前主入口是根目录 `README.md`、`AGENTS.md`、`CLAUDE.md`、`skills/novel-core/` 和 `.harness/agents/总编Agent.md`
- `.harness/skills/` 是内部模块目录，当前仍被 Agent 文档引用
