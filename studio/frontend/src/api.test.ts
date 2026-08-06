import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("AI 对话流", () => {
  it("可以提交模型发现请求并返回模型列表", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: ["model-a", "model-b"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.discoverAIModels("https://example.com/v1", "secret", 60)).resolves.toEqual({ models: ["model-a", "model-b"] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      base_url: "https://example.com/v1",
      api_key: "secret",
      timeout_seconds: 60,
    });
  });

  it("可以解析被拆分的 SSE 数据块", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"delta","content":"前半"}\n'));
        controller.enqueue(encoder.encode('\ndata: {"type":"delta","content":"后半"}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const chunks: string[] = [];
    await api.streamChatMessage("项目", "abc", "继续", "正文", (event) => {
      if (event.type === "delta") chunks.push(event.content);
    });
    expect(chunks).toEqual(["前半", "后半"]);
  });

  it("保留后端返回的配置错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "AI 模型尚未配置" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(api.streamChatMessage("项目", "abc", "继续", "正文", () => undefined)).rejects.toEqual(
      expect.objectContaining({ status: 503, message: "AI 模型尚未配置" }),
    );
  });
});
