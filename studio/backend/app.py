"""Studio 本地文件服务。

Markdown 始终是小说内容的唯一事实来源；该服务只负责扫描、统计和安全读写。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from studio.backend.chat import ChatProvider, create_chat_router


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECTS_ROOT = REPO_ROOT / "projects"
UI_DIR = ".novel-harness"
CHAPTER_STATES = ("构思中", "待写", "写作中", "待人工精修", "已定稿")
CATEGORY_LABELS = {
    "正文": "正文",
    "大纲": "大纲",
    "设定": "设定",
    "状态": "状态",
    "记忆": "记忆",
}
PROJECT_STATES = ("筹备中", "连载中", "暂停", "完结")
PLATFORMS = ("番茄", "起点", "晋江", "知乎", "其他", "未指定")
WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


class SaveFileRequest(BaseModel):
    project: str = Field(min_length=1)
    path: str = Field(min_length=1)
    content: str
    base_revision: str = Field(min_length=64, max_length=64)


class CreateFileRequest(BaseModel):
    project: str = Field(min_length=1)
    path: str = Field(min_length=1)
    content: str = ""


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    title: str = Field(default="", max_length=120)
    genre: str = Field(default="", max_length=60)
    platform: str = Field(default="未指定", max_length=20)
    target_words: int = Field(default=0, ge=0, le=100_000_000)


class ProjectMetadataRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    genre: str = Field(default="", max_length=60)
    platform: str = Field(default="未指定", max_length=20)
    target_words: int = Field(default=0, ge=0, le=100_000_000)
    status: str = Field(default="筹备中", max_length=20)


class RenameFileRequest(BaseModel):
    project: str = Field(min_length=1)
    path: str = Field(min_length=1)
    new_path: str = Field(min_length=1)
    base_revision: str = Field(min_length=64, max_length=64)


class DeleteFileRequest(BaseModel):
    project: str = Field(min_length=1)
    path: str = Field(min_length=1)
    base_revision: str = Field(min_length=64, max_length=64)


class RestoreHistoryRequest(BaseModel):
    project: str = Field(min_length=1)
    path: str = Field(min_length=1)
    history_id: str = Field(min_length=1)
    base_revision: str = Field(min_length=64, max_length=64)


class RestoreTrashRequest(BaseModel):
    project: str = Field(min_length=1)
    trash_id: str = Field(min_length=1)


class DocumentStatusRequest(BaseModel):
    path: str = Field(min_length=1)
    value: str


def _revision(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _word_count(content: str) -> int:
    """按中文字符、英文单词和数字统计适合网文展示的近似字数。"""
    body = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    body = re.sub(r"[#>*_`~\[\](){}|=-]", " ", body)
    chinese = re.findall(r"[\u3400-\u9fff]", body)
    latin = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:\.\d+)?", body)
    return len(chinese) + len(latin)


def _display_title(path: Path, content: str) -> str:
    heading = re.search(r"^\s*#\s+(.+?)\s*$", content, flags=re.MULTILINE)
    return heading.group(1).strip() if heading else path.stem


def _iso_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).astimezone().isoformat(timespec="seconds")


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
            temp_name = handle.name
        os.replace(temp_name, path)
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)


def _validate_project_name(name: str) -> str:
    cleaned = name.strip()
    if (
        not cleaned
        or cleaned.endswith((".", " "))
        or re.search(r'[<>:"/\\|?*\x00-\x1f]', cleaned)
        or cleaned.split(".", 1)[0].upper() in WINDOWS_RESERVED_NAMES
    ):
        raise HTTPException(status_code=400, detail="项目名包含系统不允许的字符")
    return cleaned


class ProjectStore:
    def __init__(self, projects_root: Path):
        self.projects_root = projects_root.resolve()

    def _project_path(self, project: str, *, require_exists: bool = True) -> Path:
        cleaned = _validate_project_name(project)
        candidate = (self.projects_root / cleaned).resolve()
        if candidate.parent != self.projects_root:
            raise HTTPException(status_code=400, detail="项目路径超出 projects 目录")
        if require_exists and not candidate.is_dir():
            raise HTTPException(status_code=404, detail="项目不存在")
        return candidate

    def _document_path(self, project: str, relative_path: str, *, require_exists: bool = True) -> Path:
        project_path = self._project_path(project)
        pure = PurePosixPath(relative_path.replace("\\", "/"))
        if pure.is_absolute() or not pure.parts or any(part in {"", ".", ".."} for part in pure.parts):
            raise HTTPException(status_code=400, detail="文档路径不合法")
        if pure.suffix.lower() != ".md" or any(part.startswith(".") for part in pure.parts):
            raise HTTPException(status_code=400, detail="Studio 只允许访问项目内 Markdown 文档")
        candidate = (project_path / Path(*pure.parts)).resolve()
        if project_path not in candidate.parents:
            raise HTTPException(status_code=400, detail="文档路径超出当前项目")
        if require_exists and not candidate.is_file():
            raise HTTPException(status_code=404, detail="文档不存在")
        return candidate

    def _metadata_path(self, project_path: Path) -> Path:
        return project_path / UI_DIR / "project.json"

    def _metadata_defaults(self, project_path: Path) -> dict[str, Any]:
        return {
            "title": project_path.name,
            "genre": "",
            "platform": "未指定",
            "target_words": 0,
            "status": "筹备中",
            "document_status": {},
        }

    def _load_metadata(self, project_path: Path) -> dict[str, Any]:
        path = self._metadata_path(project_path)
        if not path.exists():
            return self._metadata_defaults(project_path)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return self._metadata_defaults(project_path)
        if not isinstance(data, dict):
            return self._metadata_defaults(project_path)
        defaults = self._metadata_defaults(project_path)
        merged = {**defaults, **data}
        merged["title"] = data.get("title") if isinstance(data.get("title"), str) and data["title"].strip() else project_path.name
        merged["genre"] = data.get("genre") if isinstance(data.get("genre"), str) else ""
        merged["platform"] = data.get("platform") if data.get("platform") in PLATFORMS else "未指定"
        merged["status"] = data.get("status") if data.get("status") in PROJECT_STATES else "筹备中"
        merged["target_words"] = data.get("target_words") if isinstance(data.get("target_words"), int) and data["target_words"] >= 0 else 0
        merged["document_status"] = data.get("document_status") if isinstance(data.get("document_status"), dict) else {}
        return merged

    def _save_metadata(self, project_path: Path, metadata: dict[str, Any]) -> None:
        _atomic_write(self._metadata_path(project_path), json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")

    def _activity_path(self, project_path: Path) -> Path:
        return project_path / UI_DIR / "activity.json"

    def _load_activity(self, project_path: Path) -> list[dict[str, Any]]:
        path = self._activity_path(project_path)
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return data if isinstance(data, list) else []

    def _record_activity(self, project_path: Path, action: str, path: str, word_delta: int = 0) -> None:
        activity = self._load_activity(project_path)
        activity.append({
            "at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "action": action,
            "path": path,
            "word_delta": word_delta,
        })
        _atomic_write(self._activity_path(project_path), json.dumps(activity[-1000:], ensure_ascii=False, indent=2) + "\n")

    def _internal_file(self, project_path: Path, area: str, item_id: str) -> Path:
        pure = PurePosixPath(item_id.replace("\\", "/"))
        if pure.is_absolute() or not pure.parts or any(part in {"", ".", ".."} for part in pure.parts):
            raise HTTPException(status_code=400, detail="内部记录路径不合法")
        root = (project_path / UI_DIR / area).resolve()
        candidate = (root / Path(*pure.parts)).resolve()
        if root not in candidate.parents or candidate.suffix.lower() != ".md":
            raise HTTPException(status_code=400, detail="内部记录路径不合法")
        return candidate

    def _iter_documents(self, project_path: Path) -> list[Path]:
        return sorted(
            (
                path
                for path in project_path.rglob("*.md")
                if UI_DIR not in path.relative_to(project_path).parts
                and not any(part.startswith(".") for part in path.relative_to(project_path).parts)
            ),
            key=lambda item: item.as_posix().lower(),
        )

    def _document_info(self, project_path: Path, path: Path, metadata: dict[str, Any]) -> dict[str, Any]:
        content = path.read_text(encoding="utf-8", errors="replace")
        relative = path.relative_to(project_path).as_posix()
        first = PurePosixPath(relative).parts[0]
        is_chapter = first == "正文" or relative == "正文.md"
        kind = "正文" if is_chapter else CATEGORY_LABELS.get(first, "其他")
        default_state = "待人工精修" if is_chapter else "资料"
        return {
            "path": relative,
            "title": _display_title(path, content),
            "kind": kind,
            "status": metadata.get("document_status", {}).get(relative, default_state),
            "word_count": _word_count(content),
            "modified_at": _iso_timestamp(path.stat().st_mtime),
        }

    def create_project(self, request: CreateProjectRequest) -> dict[str, Any]:
        name = _validate_project_name(request.name)
        self.projects_root.mkdir(parents=True, exist_ok=True)
        project_path = self._project_path(name, require_exists=False)
        if project_path.exists():
            raise HTTPException(status_code=409, detail="同名项目已经存在")
        project_path.mkdir()
        for category in CATEGORY_LABELS:
            (project_path / category).mkdir()
        metadata = self._metadata_defaults(project_path)
        metadata.update({
            "title": request.title.strip() or name,
            "genre": request.genre.strip(),
            "platform": request.platform if request.platform in PLATFORMS else "其他",
            "target_words": request.target_words,
        })
        self._save_metadata(project_path, metadata)
        self._record_activity(project_path, "create_project", "")
        return self.project_detail(name)

    def update_project_metadata(self, project: str, request: ProjectMetadataRequest) -> dict[str, Any]:
        project_path = self._project_path(project)
        if request.platform not in PLATFORMS:
            raise HTTPException(status_code=400, detail="目标平台不在支持列表中")
        if request.status not in PROJECT_STATES:
            raise HTTPException(status_code=400, detail="项目状态不合法")
        metadata = self._load_metadata(project_path)
        metadata.update({
            "title": request.title.strip(),
            "genre": request.genre.strip(),
            "platform": request.platform,
            "target_words": request.target_words,
            "status": request.status,
        })
        self._save_metadata(project_path, metadata)
        self._record_activity(project_path, "update_project", "")
        return self.project_detail(project)

    def list_projects(self) -> list[dict[str, Any]]:
        if not self.projects_root.exists():
            return []
        projects = []
        for project_path in sorted(self.projects_root.iterdir(), key=lambda item: item.name.lower()):
            if not project_path.is_dir() or project_path.name.startswith("."):
                continue
            projects.append(self.project_summary(project_path.name))
        return sorted(projects, key=lambda item: item["modified_at"], reverse=True)

    def project_summary(self, project: str) -> dict[str, Any]:
        project_path = self._project_path(project)
        metadata = self._load_metadata(project_path)
        documents = [self._document_info(project_path, path, metadata) for path in self._iter_documents(project_path)]
        return self._summary_from_documents(project_path, documents)

    def _summary_from_documents(self, project_path: Path, documents: list[dict[str, Any]]) -> dict[str, Any]:
        metadata = self._load_metadata(project_path)
        chapters = [item for item in documents if item["kind"] == "正文"]
        modified_at = max((item["modified_at"] for item in documents), default=_iso_timestamp(project_path.stat().st_mtime))
        finalized = sum(item["status"] == "已定稿" for item in chapters)
        return {
            "id": project_path.name,
            "name": project_path.name,
            "title": metadata["title"],
            "genre": metadata["genre"],
            "platform": metadata["platform"],
            "project_status": metadata["status"],
            "target_words": metadata["target_words"],
            "chapter_count": len(chapters),
            "document_count": len(documents),
            "word_count": sum(item["word_count"] for item in chapters),
            "pending_revisions": sum(item["status"] == "待人工精修" for item in chapters),
            "progress": round(finalized / len(chapters) * 100) if chapters else 0,
            "word_progress": min(round(sum(item["word_count"] for item in chapters) / metadata["target_words"] * 100), 100) if metadata["target_words"] else 0,
            "modified_at": modified_at,
            "has_outline": any(item["kind"] == "大纲" for item in documents),
            "has_settings": any(item["kind"] == "设定" for item in documents),
        }

    def dashboard(self) -> dict[str, Any]:
        projects = self.list_projects()
        recent: list[dict[str, Any]] = []
        activity: defaultdict[str, int] = defaultdict(int)
        warnings: list[dict[str, str]] = []
        for project in projects:
            detail = self.project_detail(project["id"])
            for document in detail["documents"]:
                recent.append({**document, "project": project["name"]})
            for event in self._load_activity(self._project_path(project["id"])):
                day = str(event.get("at", ""))[:10]
                if day:
                    try:
                        activity[day] += int(event.get("word_delta", 0))
                    except (TypeError, ValueError):
                        continue
            if not project["has_outline"]:
                warnings.append({"project": project["name"], "message": "尚未建立大纲"})
            if not project["has_settings"]:
                warnings.append({"project": project["name"], "message": "尚未建立设定资料"})
            if not project["chapter_count"]:
                warnings.append({"project": project["name"], "message": "尚未创建正文"})

        today = date.today()
        trend = [
            {"date": (today - timedelta(days=offset)).isoformat(), "words": activity[(today - timedelta(days=offset)).isoformat()]}
            for offset in range(6, -1, -1)
        ]
        return {
            "projects": projects,
            "totals": {
                "projects": len(projects),
                "chapters": sum(item["chapter_count"] for item in projects),
                "words": sum(item["word_count"] for item in projects),
                "pending_revisions": sum(item["pending_revisions"] for item in projects),
            },
            "recent_documents": sorted(recent, key=lambda item: item["modified_at"], reverse=True)[:8],
            "writing_trend": trend,
            "warnings": warnings[:8],
        }

    def search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        keyword = query.strip().casefold()
        if not keyword:
            return []
        results: list[dict[str, Any]] = []
        for project in self.list_projects():
            if keyword in project["name"].casefold():
                results.append({
                    "type": "项目",
                    "title": project["name"],
                    "detail": f'{project["chapter_count"]} 篇正文',
                    "project": project["id"],
                    "path": None,
                })
            detail = self.project_detail(project["id"])
            for document in detail["documents"]:
                haystack = f'{document["title"]} {document["path"]}'.casefold()
                if keyword in haystack:
                    results.append({
                        "type": document["kind"],
                        "title": document["title"],
                        "detail": f'{project["name"]} · {document["path"]}',
                        "project": project["id"],
                        "path": document["path"],
                    })
            if len(results) >= limit:
                break
        return results[:limit]

    def project_detail(self, project: str) -> dict[str, Any]:
        project_path = self._project_path(project)
        metadata = self._load_metadata(project_path)
        documents = [self._document_info(project_path, path, metadata) for path in self._iter_documents(project_path)]
        groups: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for document in documents:
            groups[document["kind"]].append(document)
        outline = next((item for item in documents if item["kind"] == "大纲"), None)
        outline_excerpt = ""
        if outline:
            outline_path = self._document_path(project, outline["path"])
            outline_excerpt = outline_path.read_text(encoding="utf-8", errors="replace")[:700]
        return {
            **self._summary_from_documents(project_path, documents),
            "documents": documents,
            "groups": dict(groups),
            "outline_excerpt": outline_excerpt,
            "chapter_states": CHAPTER_STATES,
            "project_states": PROJECT_STATES,
            "platforms": PLATFORMS,
            "recent_activity": list(reversed(self._load_activity(project_path)[-12:])),
        }

    def read_document(self, project: str, relative_path: str) -> dict[str, Any]:
        path = self._document_path(project, relative_path)
        raw = path.read_bytes()
        return {
            "project": project,
            "path": path.relative_to(self._project_path(project)).as_posix(),
            "content": raw.decode("utf-8", errors="replace"),
            "revision": _revision(raw),
            "modified_at": _iso_timestamp(path.stat().st_mtime),
            "word_count": _word_count(raw.decode("utf-8", errors="replace")),
        }

    def document_revision(self, project: str, relative_path: str) -> dict[str, str]:
        path = self._document_path(project, relative_path)
        return {"revision": _revision(path.read_bytes()), "modified_at": _iso_timestamp(path.stat().st_mtime)}

    def _require_revision(self, path: Path, expected: str) -> bytes:
        current = path.read_bytes()
        current_revision = _revision(current)
        if current_revision != expected:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "文件已被其他程序修改，请刷新后再合并", "current_revision": current_revision},
            )
        return current

    def _archive_content(self, project_path: Path, relative_path: str, raw: bytes) -> str:
        current_revision = _revision(raw)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        history_path = project_path / UI_DIR / "history" / relative_path
        history_file = history_path.with_name(f"{history_path.stem}-{timestamp}-{current_revision[:8]}.md")
        _atomic_write(history_file, raw.decode("utf-8", errors="replace"))
        return history_file.relative_to(project_path / UI_DIR / "history").as_posix()

    def create_document(self, request: CreateFileRequest) -> dict[str, Any]:
        path = self._document_path(request.project, request.path, require_exists=False)
        if path.exists():
            raise HTTPException(status_code=409, detail="同名文档已经存在")
        _atomic_write(path, request.content)
        self._record_activity(self._project_path(request.project), "create_document", request.path, _word_count(request.content))
        return self.read_document(request.project, request.path)

    def save_document(self, request: SaveFileRequest) -> dict[str, Any]:
        path = self._document_path(request.project, request.path)
        current = self._require_revision(path, request.base_revision)
        encoded = request.content.encode("utf-8")
        if encoded == current:
            return self.read_document(request.project, request.path)

        project_path = self._project_path(request.project)
        self._archive_content(project_path, request.path, current)
        _atomic_write(path, request.content)
        self._record_activity(
            project_path,
            "save_document",
            request.path,
            _word_count(request.content) - _word_count(current.decode("utf-8", errors="replace")),
        )
        return self.read_document(request.project, request.path)

    def rename_document(self, request: RenameFileRequest) -> dict[str, Any]:
        source = self._document_path(request.project, request.path)
        self._require_revision(source, request.base_revision)
        target = self._document_path(request.project, request.new_path, require_exists=False)
        if target.exists():
            raise HTTPException(status_code=409, detail="目标文档已经存在")
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, target)
        project_path = self._project_path(request.project)
        metadata = self._load_metadata(project_path)
        document_status = metadata["document_status"]
        if request.path in document_status:
            document_status[request.new_path] = document_status.pop(request.path)
            self._save_metadata(project_path, metadata)
        self._record_activity(project_path, "rename_document", f"{request.path} -> {request.new_path}")
        return self.read_document(request.project, request.new_path)

    def delete_document(self, request: DeleteFileRequest) -> dict[str, str]:
        source = self._document_path(request.project, request.path)
        self._require_revision(source, request.base_revision)
        project_path = self._project_path(request.project)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        target = project_path / UI_DIR / "trash" / timestamp / Path(*PurePosixPath(request.path).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, target)
        metadata = self._load_metadata(project_path)
        if metadata["document_status"].pop(request.path, None) is not None:
            self._save_metadata(project_path, metadata)
        self._record_activity(project_path, "delete_document", request.path)
        return {"status": "trashed", "trash_id": target.relative_to(project_path / UI_DIR / "trash").as_posix()}

    def list_history(self, project: str, relative_path: str) -> list[dict[str, Any]]:
        self._document_path(project, relative_path)
        project_path = self._project_path(project)
        history_root = project_path / UI_DIR / "history"
        relative = PurePosixPath(relative_path)
        parent = history_root / Path(*relative.parent.parts)
        entries = []
        if parent.exists():
            for path in parent.glob("*.md"):
                if not path.name.startswith(f"{relative.stem}-"):
                    continue
                content = path.read_text(encoding="utf-8", errors="replace")
                entries.append({
                    "id": path.relative_to(history_root).as_posix(),
                    "created_at": _iso_timestamp(path.stat().st_mtime),
                    "word_count": _word_count(content),
                    "preview": re.sub(r"\s+", " ", content).strip()[:100],
                })
        return sorted(entries, key=lambda item: item["created_at"], reverse=True)

    def restore_history(self, request: RestoreHistoryRequest) -> dict[str, Any]:
        target = self._document_path(request.project, request.path)
        current = self._require_revision(target, request.base_revision)
        project_path = self._project_path(request.project)
        history_file = self._internal_file(project_path, "history", request.history_id)
        if not history_file.is_file():
            raise HTTPException(status_code=404, detail="历史版本不存在")
        self._archive_content(project_path, request.path, current)
        _atomic_write(target, history_file.read_text(encoding="utf-8", errors="replace"))
        self._record_activity(project_path, "restore_history", request.path)
        return self.read_document(request.project, request.path)

    def list_trash(self, project: str) -> list[dict[str, Any]]:
        project_path = self._project_path(project)
        trash_root = project_path / UI_DIR / "trash"
        entries = []
        if trash_root.exists():
            for path in trash_root.rglob("*.md"):
                relative = path.relative_to(trash_root)
                original_parts = relative.parts[1:]
                if not original_parts:
                    continue
                entries.append({
                    "id": relative.as_posix(),
                    "original_path": PurePosixPath(*original_parts).as_posix(),
                    "deleted_at": _iso_timestamp(path.stat().st_mtime),
                    "word_count": _word_count(path.read_text(encoding="utf-8", errors="replace")),
                })
        return sorted(entries, key=lambda item: item["deleted_at"], reverse=True)

    def restore_trash(self, request: RestoreTrashRequest) -> dict[str, Any]:
        project_path = self._project_path(request.project)
        source = self._internal_file(project_path, "trash", request.trash_id)
        if not source.is_file():
            raise HTTPException(status_code=404, detail="回收站记录不存在")
        relative = PurePosixPath(request.trash_id)
        if len(relative.parts) < 2:
            raise HTTPException(status_code=400, detail="回收站记录不合法")
        original_path = PurePosixPath(*relative.parts[1:]).as_posix()
        target = self._document_path(request.project, original_path, require_exists=False)
        if target.exists():
            raise HTTPException(status_code=409, detail="原位置已有同名文档")
        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, target)
        self._record_activity(project_path, "restore_trash", original_path)
        return self.read_document(request.project, original_path)

    def set_document_status(self, project: str, request: DocumentStatusRequest) -> dict[str, str]:
        self._document_path(project, request.path)
        if request.value not in CHAPTER_STATES:
            raise HTTPException(status_code=400, detail="章节状态不合法")
        project_path = self._project_path(project)
        metadata = self._load_metadata(project_path)
        metadata["document_status"][request.path] = request.value
        self._save_metadata(project_path, metadata)
        return {"path": request.path, "status": request.value}


def create_app(projects_root: Path = DEFAULT_PROJECTS_ROOT, chat_provider: ChatProvider | None = None, ai_config_path: Path | None = None) -> FastAPI:
    store = ProjectStore(projects_root)
    application = FastAPI(title="novel-harness Studio", version="1.0.0")
    application.state.store = store
    application.include_router(create_chat_router(store, chat_provider, ai_config_path))
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @application.get("/api/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "projects_root": str(store.projects_root)}

    @application.get("/api/dashboard")
    def dashboard() -> dict[str, Any]:
        return store.dashboard()

    @application.post("/api/projects", status_code=201)
    def create_project(request: CreateProjectRequest) -> dict[str, Any]:
        return store.create_project(request)

    @application.get("/api/projects/{project}")
    def project_detail(project: str) -> dict[str, Any]:
        return store.project_detail(project)

    @application.patch("/api/projects/{project}")
    def update_project(project: str, request: ProjectMetadataRequest) -> dict[str, Any]:
        return store.update_project_metadata(project, request)

    @application.get("/api/search")
    def search(query: str = Query(min_length=1, max_length=100), limit: int = Query(20, ge=1, le=50)) -> list[dict[str, Any]]:
        return store.search(query, limit)

    @application.get("/api/files")
    def read_file(project: str = Query(min_length=1), path: str = Query(min_length=1)) -> dict[str, Any]:
        return store.read_document(project, path)

    @application.get("/api/files/revision")
    def file_revision(project: str = Query(min_length=1), path: str = Query(min_length=1)) -> dict[str, str]:
        return store.document_revision(project, path)

    @application.post("/api/files", status_code=201)
    def create_file(request: CreateFileRequest) -> dict[str, Any]:
        return store.create_document(request)

    @application.put("/api/files")
    def save_file(request: SaveFileRequest) -> dict[str, Any]:
        return store.save_document(request)

    @application.patch("/api/files/rename")
    def rename_file(request: RenameFileRequest) -> dict[str, Any]:
        return store.rename_document(request)

    @application.delete("/api/files")
    def delete_file(request: DeleteFileRequest) -> dict[str, str]:
        return store.delete_document(request)

    @application.get("/api/history")
    def history(project: str = Query(min_length=1), path: str = Query(min_length=1)) -> list[dict[str, Any]]:
        return store.list_history(project, path)

    @application.post("/api/history/restore")
    def restore_history(request: RestoreHistoryRequest) -> dict[str, Any]:
        return store.restore_history(request)

    @application.get("/api/trash/{project}")
    def trash(project: str) -> list[dict[str, Any]]:
        return store.list_trash(project)

    @application.post("/api/trash/restore")
    def restore_trash(request: RestoreTrashRequest) -> dict[str, Any]:
        return store.restore_trash(request)

    @application.patch("/api/projects/{project}/document-status")
    def update_document_status(project: str, request: DocumentStatusRequest) -> dict[str, str]:
        return store.set_document_status(project, request)

    frontend_dist = REPO_ROOT / "studio" / "frontend" / "dist"
    if frontend_dist.exists():
        assets = frontend_dist / "assets"
        if assets.exists():
            application.mount("/assets", StaticFiles(directory=assets), name="assets")

        @application.get("/{full_path:path}", include_in_schema=False)
        def frontend(full_path: str):
            candidate = (frontend_dist / full_path).resolve()
            if full_path and frontend_dist in candidate.parents and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(frontend_dist / "index.html")

    return application


app = create_app()
