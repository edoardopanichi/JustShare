from __future__ import annotations

import asyncio
import contextlib
import shutil
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Config, load_config
from .db import Database
from .realtime import RoomConnectionManager
from .security import is_allowed_client
from .storage import (
    UnsafePathError,
    build_tree,
    make_folder_zip,
    remove_room_files,
    resolve_upload_path,
    room_upload_dir,
    sanitize_relative_path,
)


def create_app(config: Config | None = None) -> FastAPI:
    config = config or load_config()
    config.storage_dir.mkdir(parents=True, exist_ok=True)
    (config.storage_dir / "tmp").mkdir(parents=True, exist_ok=True)

    db = Database(config.storage_dir / "justshare.sqlite3")
    manager = RoomConnectionManager()
    app = FastAPI(title="JustShare", version="0.1.0")
    app.state.config = config
    app.state.db = db
    app.state.manager = manager

    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def lan_only(request: Request, call_next):
        host = request.client.host if request.client else None
        if not is_allowed_client(host, config.allowed_networks):
            return JSONResponse({"detail": "JustShare only accepts configured local-network clients."}, status_code=403)
        response = await call_next(request)
        if request.url.path == "/" or request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.on_event("startup")
    async def startup() -> None:
        db.init()
        app.state.cleanup_task = asyncio.create_task(cleanup_loop(db, manager, config))

    @app.on_event("shutdown")
    async def shutdown() -> None:
        task = getattr(app.state, "cleanup_task", None)
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        return HTMLResponse(
            (static_dir / "index.html").read_text(encoding="utf-8"),
            headers={"Cache-Control": "no-store"},
        )

    @app.post("/api/rooms")
    async def create_room() -> dict:
        code = db.create_room()
        room_upload_dir(config.storage_dir, code).mkdir(parents=True, exist_ok=True)
        return {"code": code}

    @app.get("/api/rooms/{code}")
    async def get_room(code: str) -> dict:
        try:
            state = db.get_room_state(code)
            db.touch_room(state["code"])
            return room_payload(db, state["code"])
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="Room not found.")

    @app.put("/api/rooms/{code}/notepad")
    async def set_notepad(code: str, payload: dict) -> dict:
        return await update_text(db, manager, code, "notepad", str(payload.get("value", "")))

    @app.delete("/api/rooms/{code}/notepad")
    async def clear_notepad(code: str) -> dict:
        return await update_text(db, manager, code, "notepad", "")

    @app.put("/api/rooms/{code}/code")
    async def set_code(code: str, payload: dict) -> dict:
        return await update_text(db, manager, code, "code", str(payload.get("value", "")))

    @app.delete("/api/rooms/{code}/code")
    async def clear_code(code: str) -> dict:
        return await update_text(db, manager, code, "code", "")

    @app.post("/api/rooms/{code}/uploads")
    async def upload_files(
        code: str,
        files: list[UploadFile] = File(...),
        relative_paths: list[str] | None = Form(default=None),
    ) -> dict:
        try:
            code = db.require_room(code)
            if relative_paths and len(relative_paths) != len(files):
                raise HTTPException(status_code=400, detail="relative_paths must match files.")
            for index, upload in enumerate(files):
                raw_relative = relative_paths[index] if relative_paths else upload.filename
                relative_path = sanitize_relative_path(raw_relative or upload.filename)
                target = resolve_upload_path(config.storage_dir, code, relative_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                size = 0
                with target.open("wb") as output:
                    while chunk := await upload.read(1024 * 1024):
                        size += len(chunk)
                        output.write(chunk)
                db.add_upload(
                    code,
                    upload.filename or Path(relative_path).name,
                    relative_path,
                    target,
                    size,
                    upload.content_type or "application/octet-stream",
                )
            tree = build_tree(db.list_uploads(code))
            await manager.broadcast(code, {"type": "tree:update", "tree": tree})
            return {"tree": tree}
        except UnsafePathError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="Room not found.")

    @app.get("/api/rooms/{code}/tree")
    async def get_tree(code: str) -> dict:
        try:
            code = db.require_room(code)
            db.touch_room(code)
            return {"tree": build_tree(db.list_uploads(code))}
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="Room not found.")

    @app.delete("/api/rooms/{code}/uploads")
    async def clear_uploads(code: str) -> dict:
        try:
            code = db.require_room(code)
            shutil.rmtree(room_upload_dir(config.storage_dir, code), ignore_errors=True)
            room_upload_dir(config.storage_dir, code).mkdir(parents=True, exist_ok=True)
            db.clear_uploads(code)
            tree = build_tree([])
            await manager.broadcast(code, {"type": "tree:update", "tree": tree})
            await manager.broadcast(code, {"type": "room:cleared", "target": "uploads"})
            return {"tree": tree}
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="Room not found.")

    @app.get("/api/rooms/{code}/files/{file_id}/download")
    async def download_file(code: str, file_id: str):
        try:
            row = db.get_upload(code, file_id)
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="File not found.")
        path = Path(row["filesystem_path"])
        if not path.exists():
            raise HTTPException(status_code=404, detail="File missing on disk.")
        return FileResponse(path, filename=Path(row["relative_path"]).name, media_type=row["mime_type"])

    @app.get("/api/rooms/{code}/folders/{folder_path:path}/download")
    async def download_folder(code: str, folder_path: str):
        try:
            code = db.require_room(code)
            rows = db.list_uploads(code)
            zip_path = make_folder_zip(config.storage_dir, code, folder_path, rows)
            db.touch_room(code)
        except UnsafePathError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except (KeyError, ValueError):
            raise HTTPException(status_code=404, detail="Room not found.")
        return FileResponse(zip_path, filename=zip_path.name, media_type="application/zip", background=DeleteParent(zip_path))

    @app.websocket("/ws/rooms/{code}")
    async def websocket_room(websocket: WebSocket, code: str) -> None:
        host = websocket.client.host if websocket.client else None
        if not is_allowed_client(host, config.allowed_networks):
            await websocket.close(code=1008)
            return
        try:
            code = db.require_room(code)
        except (KeyError, ValueError):
            await websocket.close(code=1008)
            return
        await manager.connect(code, websocket)
        db.touch_room(code)
        await manager.broadcast(code, {"type": "presence:update", "clients": len(manager._rooms.get(code, []))})
        try:
            while True:
                await websocket.receive_text()
                db.touch_room(code)
        except WebSocketDisconnect:
            manager.disconnect(code, websocket)
            await manager.broadcast(code, {"type": "presence:update", "clients": len(manager._rooms.get(code, []))})

    @app.websocket("/ws/rooms/")
    async def websocket_missing_room(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_json({"type": "error", "detail": "Missing room code."})
        await websocket.close(code=1008)

    return app


async def update_text(db: Database, manager: RoomConnectionManager, code: str, field: str, value: str) -> dict:
    try:
        code = db.require_room(code)
        db.set_text(code, field, value)
        message_type = "notepad:update" if field == "notepad" else "code:update"
        payload_key = "value"
        await manager.broadcast(code, {"type": message_type, payload_key: value})
        if value == "":
            await manager.broadcast(code, {"type": "room:cleared", "target": field})
        return {"value": value}
    except (KeyError, ValueError):
        raise HTTPException(status_code=404, detail="Room not found.")


def room_payload(db: Database, code: str) -> dict:
    state = db.get_room_state(code)
    return {
        "room_code": state["code"],
        "notepad": state["notepad"],
        "code_text": state["code_text"],
        "tree": build_tree(state["uploads"]),
    }


async def cleanup_loop(db: Database, manager: RoomConnectionManager, config: Config) -> None:
    while True:
        await asyncio.sleep(60)
        for code in db.expired_rooms(config.room_ttl_seconds, manager.active_room_codes()):
            remove_room_files(config.storage_dir, code)
            db.delete_room(code)


class DeleteParent:
    def __init__(self, path: Path) -> None:
        self.path = path

    async def __call__(self) -> None:
        shutil.rmtree(self.path.parent, ignore_errors=True)
