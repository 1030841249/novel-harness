import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from studio.backend.app import ProjectStore, _word_count, create_app
from studio.backend.chat import DisabledChatProvider, _connection_error_message, _provider_http_error


class FakeChatProvider:
    def __init__(self):
        self.calls = []

    @property
    def status(self):
        return {"enabled": True, "provider": "测试模型", "model": "fake-model", "message": ""}

    async def stream(self, messages):
        self.calls.append(messages)
        yield "先写人物的迟疑，"
        yield "再决定下一步。"


class FakeModelResponse:
    status_code = 200

    @staticmethod
    def json():
        return {"data": [{"id": "model-b"}, {"id": "model-a"}, {"id": "model-a"}]}


class FakeModelClient:
    def __init__(self, *args, **kwargs):
        self.headers = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def get(self, url, headers):
        self.headers = headers
        return FakeModelResponse()


class StudioBackendTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.projects = Path(self.temp_dir.name) / "projects"
        novel = self.projects / "测试长篇"
        (novel / "正文").mkdir(parents=True)
        (novel / "大纲").mkdir()
        (novel / "正文" / "第001章.md").write_text("# 第一章\n\n这是正文。\n", encoding="utf-8")
        (novel / "大纲" / "第一卷.md").write_text("# 第一卷\n\n开局。\n", encoding="utf-8")
        short = self.projects / "测试短篇"
        short.mkdir(parents=True)
        (short / "正文.md").write_text("# 短篇\n\n一段内容。\n", encoding="utf-8")
        self.chat_provider = FakeChatProvider()
        self.client = TestClient(create_app(self.projects, self.chat_provider))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_word_count_supports_chinese_and_latin(self):
        self.assertEqual(_word_count("# 标题\n中文 AI 2.0"), 6)

    def test_scans_directory_and_single_file_chapters(self):
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 200)
        projects = {item["name"]: item for item in response.json()["projects"]}
        self.assertEqual(projects["测试长篇"]["chapter_count"], 1)
        self.assertEqual(projects["测试短篇"]["chapter_count"], 1)

    def test_read_only_endpoints_do_not_create_runtime_files(self):
        self.assertEqual(self.client.get("/api/dashboard").status_code, 200)
        self.assertEqual(self.client.get("/api/projects/测试长篇").status_code, 200)
        self.assertFalse((self.projects / "测试长篇" / ".novel-harness").exists())

    def test_searches_all_project_documents(self):
        response = self.client.get("/api/search", params={"query": "第一卷"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["path"], "大纲/第一卷.md")

    def test_rejects_path_traversal(self):
        response = self.client.get("/api/files", params={"project": "测试长篇", "path": "../秘密.md"})
        self.assertEqual(response.status_code, 400)

    def test_save_creates_history_and_changes_revision(self):
        original = self.client.get("/api/files", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        response = self.client.put(
            "/api/files",
            json={
                "project": "测试长篇",
                "path": "正文/第001章.md",
                "content": "# 第一章\n\n修改后的正文。\n",
                "base_revision": original["revision"],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()["revision"], original["revision"])
        history = list((self.projects / "测试长篇" / ".novel-harness" / "history").rglob("*.md"))
        self.assertEqual(len(history), 1)

    def test_save_detects_external_change(self):
        original = self.client.get("/api/files", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        target = self.projects / "测试长篇" / "正文" / "第001章.md"
        target.write_text("外部已经修改", encoding="utf-8")
        response = self.client.put(
            "/api/files",
            json={
                "project": "测试长篇",
                "path": "正文/第001章.md",
                "content": "编辑器中的修改",
                "base_revision": original["revision"],
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(target.read_text(encoding="utf-8"), "外部已经修改")

    def test_create_file_and_reject_duplicate(self):
        payload = {"project": "测试长篇", "path": "正文/第002章.md", "content": "# 第二章\n"}
        self.assertEqual(self.client.post("/api/files", json=payload).status_code, 201)
        self.assertEqual(self.client.post("/api/files", json=payload).status_code, 409)

    def test_creates_project_with_metadata_and_directories(self):
        response = self.client.post(
            "/api/projects",
            json={"name": "新项目", "genre": "都市", "platform": "番茄", "target_words": 500000},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["platform"], "番茄")
        self.assertEqual(response.json()["target_words"], 500000)
        self.assertTrue((self.projects / "新项目" / "正文").is_dir())
        self.assertEqual(self.client.post("/api/projects", json={"name": "CON"}).status_code, 400)

    def test_updates_project_metadata(self):
        response = self.client.patch(
            "/api/projects/测试长篇",
            json={"title": "正式书名", "genre": "求生", "platform": "起点", "target_words": 800000, "status": "连载中"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "正式书名")
        self.assertEqual(response.json()["project_status"], "连载中")

    def test_renames_document_and_preserves_status(self):
        source = self.client.get("/api/files", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        self.client.patch(
            "/api/projects/测试长篇/document-status",
            json={"path": "正文/第001章.md", "value": "写作中"},
        )
        response = self.client.patch(
            "/api/files/rename",
            json={"project": "测试长篇", "path": "正文/第001章.md", "new_path": "正文/第001章 新标题.md", "base_revision": source["revision"]},
        )
        self.assertEqual(response.status_code, 200)
        detail = self.client.get("/api/projects/测试长篇").json()
        renamed = next(item for item in detail["documents"] if item["path"] == "正文/第001章 新标题.md")
        self.assertEqual(renamed["status"], "写作中")

    def test_moves_document_to_trash_and_restores_it(self):
        source = self.client.get("/api/files", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        deleted = self.client.request(
            "DELETE",
            "/api/files",
            json={"project": "测试长篇", "path": "正文/第001章.md", "base_revision": source["revision"]},
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse((self.projects / "测试长篇" / "正文" / "第001章.md").exists())
        restored = self.client.post(
            "/api/trash/restore",
            json={"project": "测试长篇", "trash_id": deleted.json()["trash_id"]},
        )
        self.assertEqual(restored.status_code, 200)
        self.assertTrue((self.projects / "测试长篇" / "正文" / "第001章.md").is_file())

    def test_lists_and_restores_history(self):
        original = self.client.get("/api/files", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        changed = self.client.put(
            "/api/files",
            json={"project": "测试长篇", "path": "正文/第001章.md", "content": "# 新内容\n", "base_revision": original["revision"]},
        ).json()
        history = self.client.get("/api/history", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        self.assertEqual(len(history), 1)
        restored = self.client.post(
            "/api/history/restore",
            json={"project": "测试长篇", "path": "正文/第001章.md", "history_id": history[0]["id"], "base_revision": changed["revision"]},
        )
        self.assertEqual(restored.status_code, 200)
        self.assertIn("这是正文", restored.json()["content"])

    def test_revision_endpoint_detects_external_change(self):
        first = self.client.get("/api/files/revision", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        (self.projects / "测试长篇" / "正文" / "第001章.md").write_text("外部修改", encoding="utf-8")
        second = self.client.get("/api/files/revision", params={"project": "测试长篇", "path": "正文/第001章.md"}).json()
        self.assertNotEqual(first["revision"], second["revision"])

    def test_status_is_saved_as_ui_metadata(self):
        response = self.client.patch(
            "/api/projects/测试长篇/document-status",
            json={"path": "正文/第001章.md", "value": "已定稿"},
        )
        self.assertEqual(response.status_code, 200)
        detail = self.client.get("/api/projects/测试长篇").json()
        chapter = next(item for item in detail["documents"] if item["kind"] == "正文")
        self.assertEqual(chapter["status"], "已定稿")

    def test_store_rejects_nested_project_name(self):
        store = ProjectStore(self.projects)
        with self.assertRaises(Exception):
            store.project_summary("测试长篇/正文")

    def test_chat_streams_and_persists_project_context(self):
        created = self.client.post(
            "/api/chat/sessions",
            json={"project": "测试长篇", "path": "正文/第001章.md"},
        )
        self.assertEqual(created.status_code, 201)
        session_id = created.json()["id"]
        response = self.client.post(
            f"/api/chat/sessions/{session_id}/messages",
            json={"project": "测试长篇", "message": "下一段怎么写？", "draft_content": "# 第一章\n\n尚未保存的正文。"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("先写人物的迟疑", response.text)
        session = self.client.get(f"/api/chat/sessions/{session_id}", params={"project": "测试长篇"}).json()
        self.assertEqual([item["role"] for item in session["messages"]], ["user", "assistant"])
        self.assertIn("再决定下一步", session["messages"][1]["content"])
        prompt = self.chat_provider.calls[0][0]["content"]
        self.assertIn("尚未保存的正文", prompt)
        self.assertIn("开局", prompt)

    def test_chat_rejects_invalid_document_and_session_id(self):
        invalid_document = self.client.post(
            "/api/chat/sessions",
            json={"project": "测试长篇", "path": "../秘密.md"},
        )
        self.assertEqual(invalid_document.status_code, 400)
        invalid_session = self.client.get("/api/chat/sessions/not-valid", params={"project": "测试长篇"})
        self.assertEqual(invalid_session.status_code, 400)

    def test_chat_reports_missing_provider_configuration(self):
        client = TestClient(create_app(self.projects, DisabledChatProvider()))
        status_response = client.get("/api/chat/status")
        self.assertEqual(status_response.status_code, 200)
        self.assertFalse(status_response.json()["enabled"])
        session = client.post(
            "/api/chat/sessions",
            json={"project": "测试长篇", "path": "正文/第001章.md"},
        ).json()
        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            json={"project": "测试长篇", "message": "继续"},
        )
        self.assertEqual(response.status_code, 503)

    def test_ai_config_is_persisted_without_exposing_api_key(self):
        config_path = Path(self.temp_dir.name) / "private" / "studio-ai.json"
        client = TestClient(create_app(self.projects, ai_config_path=config_path))
        self.assertFalse(client.get("/api/chat/status").json()["enabled"])

        saved = client.put(
            "/api/chat/config",
            json={
                "preset": "openai",
                "base_url": "https://example.com/v1/",
                "model": "example-model",
                "api_key": "secret-token",
                "timeout_seconds": 90,
            },
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["model"], "example-model")
        self.assertTrue(saved.json()["enabled"])
        public = client.get("/api/chat/config").json()
        self.assertTrue(public["api_key_set"])
        self.assertNotIn("secret-token", str(public))
        self.assertEqual(public["source"], "local")

        updated = client.put(
            "/api/chat/config",
            json={
                "preset": "openai",
                "base_url": "https://example.com/v1",
                "model": "second-model",
                "timeout_seconds": 90,
            },
        )
        self.assertEqual(updated.json()["model"], "second-model")
        self.assertIn("secret-token", config_path.read_text(encoding="utf-8"))

        cleared = client.delete("/api/chat/config")
        self.assertFalse(cleared.json()["enabled"])
        self.assertFalse(config_path.exists())

    def test_ai_model_discovery_normalizes_model_ids(self):
        config_path = Path(self.temp_dir.name) / "private" / "studio-ai.json"
        client = TestClient(create_app(self.projects, ai_config_path=config_path))
        with patch("studio.backend.chat.httpx.AsyncClient", FakeModelClient):
            response = client.post(
                "/api/chat/models",
                json={"base_url": "http://127.0.0.1:11434/v1", "api_key": "temporary-key"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["models"], ["model-a", "model-b"])
        self.assertEqual(client.post("/api/chat/models", json={"base_url": "file:///tmp/models"}).status_code, 400)

    def test_ai_connection_errors_are_actionable(self):
        local_error = httpx.ConnectError("connection refused")
        self.assertIn("本地模型服务未启动", _connection_error_message("http://127.0.0.1:11434/v1", local_error))
        self.assertIn("API Key", _provider_http_error(401, "models"))
        self.assertIn("手动填写模型 ID", _provider_http_error(404, "models"))
        self.assertIn("不要包含 /chat/completions", _provider_http_error(404, "chat"))


if __name__ == "__main__":
    unittest.main()
