import { expect, test } from "@playwright/test";

const project = encodeURIComponent("游戏入侵现实：我能提前看见版本更新");
const chapter = encodeURIComponent("正文/第001章 版本0.1.0.md");

test("Dashboard 桌面布局可用", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "创作工作台" })).toBeVisible();
  await expect(page.getByText("小说项目", { exact: true }).first()).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("输入书名、章节名或路径").fill("第一卷");
  await expect(page.getByText(/^第一卷大纲/)).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/dashboard-desktop.png", fullPage: true });

  await page.getByRole("link", { name: "小说项目" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "小说项目", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/projects-desktop.png", fullPage: true });
});

test("Dashboard 手机布局无页面级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "创作工作台" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/dashboard-mobile.png", fullPage: true });
});

test("首页可以配置 AI 服务并选择模型", async ({ page }) => {
  await page.route("**/api/chat/config", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ json: { enabled: true, provider: "DeepSeek", model: "deepseek-chat", message: "", configurable: true, source: "local" } });
      return;
    }
    await route.fulfill({ json: {
      preset: "custom",
      base_url: "",
      model: "",
      api_key_set: false,
      timeout_seconds: 120,
      source: "none",
      presets: [
        { id: "deepseek", label: "DeepSeek", base_url: "https://api.deepseek.com", requires_api_key: true },
        { id: "custom", label: "其他 OpenAI 兼容服务", base_url: "", requires_api_key: false },
      ],
    } });
  });
  await page.route("**/api/chat/models", (route) => route.fulfill({ json: { models: ["deepseek-chat", "deepseek-reasoner"] } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await page.getByRole("button", { name: "AI 模型设置" }).click();
  await expect(page.getByRole("heading", { name: "AI 模型设置" })).toBeVisible();
  await page.getByLabel("模型服务").selectOption("deepseek");
  await expect(page.getByLabel("接口地址")).toHaveValue("https://api.deepseek.com");
  await page.getByLabel("API Key").fill("temporary-secret");
  await page.getByRole("button", { name: "读取模型" }).click();
  await expect(page.locator("#available-ai-models option")).toHaveCount(2);
  await page.getByLabel("模型 ID").fill("deepseek-chat");
  await page.screenshot({ path: ".artifacts/ai-settings-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "保存并启用" }).click();
  await expect(page.getByRole("heading", { name: "AI 模型设置" })).not.toBeVisible();
});

test("手机端可以从侧栏打开 AI 模型设置", async ({ page }) => {
  await page.route("**/api/chat/config", (route) => route.fulfill({ json: {
    preset: "ollama",
    base_url: "http://127.0.0.1:11434/v1",
    model: "qwen3",
    api_key_set: false,
    timeout_seconds: 120,
    source: "local",
    presets: [
      { id: "ollama", label: "Ollama（本地）", base_url: "http://127.0.0.1:11434/v1", requires_api_key: false },
      { id: "custom", label: "其他 OpenAI 兼容服务", base_url: "", requires_api_key: false },
    ],
  } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTitle("打开导航").click();
  await page.getByRole("button", { name: "AI 模型设置" }).click();

  await expect(page.getByRole("heading", { name: "AI 模型设置" })).toBeVisible();
  await expect(page.getByLabel("接口地址")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/ai-settings-mobile.png", fullPage: true });
});

test("小说项目手机布局无页面级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "小说项目", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.getByPlaceholder("筛选书名、题材、平台或状态")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/projects-mobile.png", fullPage: true });
});

test("项目工作台包含正式管理入口", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${project}`);
  await expect(page.getByRole("button", { name: "项目资料" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建文档" })).toBeVisible();
  await page.getByRole("button", { name: "项目资料" }).click();
  await expect(page.getByRole("heading", { name: "项目资料" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/project-desktop.png", fullPage: true });
});

test("Markdown 编辑器读取真实章节", async ({ page }) => {
  const session = {
    id: "11111111111111111111111111111111",
    project: decodeURIComponent(project),
    path: decodeURIComponent(chapter),
    title: "新对话",
    created_at: "2026-08-05T10:00:00+08:00",
    updated_at: "2026-08-05T10:00:00+08:00",
    messages: [],
  };
  await page.route("**/api/chat/status", (route) => route.fulfill({ json: { enabled: true, provider: "测试模型", model: "coach-test", message: "" } }));
  await page.route("**/api/chat/sessions**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/messages")) {
      const completed = { ...session, title: "下一段怎么写", messages: [
        { id: "u1", role: "user", content: "下一段怎么写", created_at: session.created_at },
        { id: "a1", role: "assistant", content: "先让人物确认眼前的异常，再给出一个可以立刻执行的小动作。", created_at: session.updated_at },
      ] };
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ type: "delta", content: "先让人物确认眼前的异常，" })}\n\ndata: ${JSON.stringify({ type: "delta", content: "再给出一个可以立刻执行的小动作。" })}\n\ndata: ${JSON.stringify({ type: "done", session: completed })}\n\n`,
      });
    } else if (request.method() === "POST") {
      await route.fulfill({ status: 201, json: session });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/editor/${project}?path=${chapter}`);
  await expect(page.getByText("第001章 版本0.1.0", { exact: true })).toBeVisible();
  await expect(page.getByText("创作陪练", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-model")).toContainText("coach-test");
  await expect(page.locator(".cm-editor")).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  expect(await page.locator(".cm-selectionBackground").first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(185, 221, 201)");
  await page.getByPlaceholder("询问下一块、剧情方向或局部问题").fill("下一段怎么写");
  await page.getByTitle("发送").click();
  await expect(page.locator(".chat-assistant")).toContainText("先让人物确认眼前的异常");
  expect(await page.locator(".coach-panel").evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  expect(await page.locator(".chat-workspace").evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  const coachBounds = await page.locator(".coach-panel").boundingBox();
  const surfaceBounds = await page.locator(".writing-surface").boundingBox();
  expect(coachBounds).not.toBeNull();
  expect(surfaceBounds).not.toBeNull();
  expect(Math.abs((coachBounds?.y || 0) + (coachBounds?.height || 0) - ((surfaceBounds?.y || 0) + (surfaceBounds?.height || 0)))).toBeLessThanOrEqual(1);

  for (const tabName of ["对话", "建议", "历史"]) {
    await page.getByRole("button", { name: tabName, exact: true }).click();
    const tabBounds = await page.locator(".coach-tab-content").boundingBox();
    expect(tabBounds).not.toBeNull();
    expect(Math.abs((tabBounds?.y || 0) + (tabBounds?.height || 0) - ((coachBounds?.y || 0) + (coachBounds?.height || 0)))).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "对话", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/editor-desktop.png", fullPage: true });
});

test("Markdown 编辑器在笔记本宽度优先保留正文空间", async ({ page }) => {
  await page.route("**/api/chat/status", (route) => route.fulfill({ json: { enabled: false, provider: "未配置", model: "", message: "请配置本地模型" } }));
  await page.route("**/api/chat/sessions**", (route) => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(`/editor/${project}?path=${chapter}`);

  await expect(page.getByTitle("展开陪练栏")).toBeVisible();
  await expect.poll(async () => (await page.locator(".writing-surface").boundingBox())?.width || 0).toBeGreaterThan(800);
  await expect.poll(async () => (await page.locator(".editor-pane").boundingBox())?.width || 0).toBeGreaterThan(400);
  await expect.poll(async () => (await page.locator(".markdown-preview").boundingBox())?.width || 0).toBeGreaterThan(400);

  await page.getByTitle("展开陪练栏").click();
  await expect(page.getByTitle("收起陪练栏")).toBeVisible();
  await expect.poll(async () => (await page.locator(".coach-panel").boundingBox())?.x || 0).toBeGreaterThan(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Markdown 编辑器手机端可展开 AI 陪练", async ({ page }) => {
  await page.route("**/api/chat/status", (route) => route.fulfill({ json: { enabled: false, provider: "未配置", model: "", message: "请配置本地模型" } }));
  await page.route("**/api/chat/sessions**", (route) => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/editor/${project}?path=${chapter}`);
  await expect(page.getByTitle("展开陪练栏")).toBeVisible();
  await page.getByTitle("展开陪练栏").click();
  await expect(page.getByTitle("收起陪练栏")).toBeVisible();
  await expect(page.getByText("AI 模型尚未配置", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "配置 AI 模型" })).toBeVisible();
  await expect.poll(async () => (await page.locator(".coach-panel").boundingBox())?.x || 0).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/editor-mobile.png", fullPage: true });
});
