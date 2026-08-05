"""构建并启动 Novel Harness Studio 本地服务。"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "studio" / "frontend"
DIST_INDEX = FRONTEND / "dist" / "index.html"


def _npm_command() -> str:
    command = "npm.cmd" if sys.platform == "win32" else "npm"
    if not shutil.which(command):
        raise RuntimeError("未找到 npm，请先安装 Node.js 20 或更高版本")
    return command


def _latest_source_mtime() -> float:
    files = [FRONTEND / "package.json", FRONTEND / "package-lock.json", FRONTEND / "index.html", FRONTEND / "vite.config.ts"]
    files.extend((FRONTEND / "src").rglob("*"))
    return max((path.stat().st_mtime for path in files if path.is_file()), default=0)


def prepare_frontend(force: bool = False) -> None:
    npm = _npm_command()
    if not (FRONTEND / "node_modules").is_dir():
        print("[Studio] 首次运行，正在安装前端依赖……")
        subprocess.run([npm, "ci"], cwd=FRONTEND, check=True)
    if force or not DIST_INDEX.exists() or DIST_INDEX.stat().st_mtime < _latest_source_mtime():
        print("[Studio] 正在构建前端……")
        subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="启动 novel-harness 本地创作工作台")
    parser.add_argument("--port", type=int, default=8765, help="本地监听端口，默认 8765")
    parser.add_argument("--rebuild", action="store_true", help="强制重新构建前端")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    args = parser.parse_args()

    prepare_frontend(args.rebuild)
    sys.path.insert(0, str(ROOT))
    try:
        import uvicorn
        from studio.backend.app import create_app
    except ImportError as exc:
        raise RuntimeError("缺少后端依赖，请先运行 pip install -r studio/backend/requirements.txt") from exc

    url = f"http://127.0.0.1:{args.port}"
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"[Studio] 已启动：{url}")
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
