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
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/editor/${project}?path=${chapter}`);
  await expect(page.getByText("第001章 版本0.1.0", { exact: true })).toBeVisible();
  await expect(page.getByText("陪练建议", { exact: true })).toBeVisible();
  await expect(page.getByText("历史版本", { exact: true })).toBeVisible();
  await expect(page.locator(".cm-editor")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/editor-desktop.png", fullPage: true });
});
