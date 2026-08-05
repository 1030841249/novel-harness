import { describe, expect, it } from "vitest";
import { formatNumber, projectInitial } from "./utils";

describe("界面格式化工具", () => {
  it("将较大字数压缩为万", () => {
    expect(formatNumber(12500)).toBe("1.3 万");
  });

  it("从书名提取稳定的封面字符", () => {
    expect(projectInitial("短篇-奖励翻倍")).toBe("短篇");
  });
});
