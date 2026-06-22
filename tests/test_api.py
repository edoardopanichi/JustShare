from __future__ import annotations

from contextlib import contextmanager

from fastapi.testclient import TestClient

from justshare.app import create_app
from justshare.config import Config, load_config


@contextmanager
def make_client(tmp_path):
    base = load_config()
    config = Config(
        host="127.0.0.1",
        port=8787,
        storage_dir=tmp_path,
        room_ttl_seconds=3600,
        allowed_networks=base.allowed_networks,
    )
    app = create_app(config)
    with TestClient(app) as client:
        yield client


def test_room_text_clear_and_upload_flow(tmp_path) -> None:
    with make_client(tmp_path) as client:
        room = client.post("/api/rooms").json()
        code = room["code"]

        response = client.put(f"/api/rooms/{code}/notepad", json={"value": "hello"})
        assert response.status_code == 200
        response = client.put(f"/api/rooms/{code}/code", json={"value": "print('x')"})
        assert response.status_code == 200

        state = client.get(f"/api/rooms/{code}").json()
        assert state["room_code"] == code
        assert state["notepad"] == "hello"
        assert state["code_text"] == "print('x')"

        response = client.delete(f"/api/rooms/{code}/notepad")
        assert response.status_code == 200
        assert client.get(f"/api/rooms/{code}").json()["notepad"] == ""

        files = [("files", ("child.txt", b"content", "text/plain"))]
        data = {"relative_paths": "folder/child.txt"}
        response = client.post(f"/api/rooms/{code}/uploads", files=files, data=data)
        assert response.status_code == 200
        tree = response.json()["tree"]
        assert tree["children"][0]["name"] == "folder"

        file_id = tree["children"][0]["children"][0]["id"]
        download = client.get(f"/api/rooms/{code}/files/{file_id}/download")
        assert download.status_code == 200
        assert download.content == b"content"

        folder = client.get(f"/api/rooms/{code}/folders/folder/download")
        assert folder.status_code == 200
        assert folder.headers["content-type"] == "application/zip"

        all_uploads = client.get(f"/api/rooms/{code}/uploads/download")
        assert all_uploads.status_code == 200
        assert all_uploads.headers["content-type"] == "application/zip"

        selected = client.get(f"/api/rooms/{code}/selection/download", params={"file_id": file_id})
        assert selected.status_code == 200
        assert selected.headers["content-type"] == "application/zip"

        cleared = client.delete(f"/api/rooms/{code}/uploads")
        assert cleared.status_code == 200
        assert cleared.json()["tree"]["children"] == []


def test_room_payload_keeps_room_code_when_code_area_empty(tmp_path) -> None:
    with make_client(tmp_path) as client:
        code = client.post("/api/rooms").json()["code"]
        state = client.get(f"/api/rooms/{code}").json()
        assert state["room_code"] == code
        assert state["code_text"] == ""


def test_websocket_receives_text_updates(tmp_path) -> None:
    with make_client(tmp_path) as client:
        code = client.post("/api/rooms").json()["code"]
        with client.websocket_connect(f"/ws/rooms/{code}") as websocket:
            response = client.put(f"/api/rooms/{code}/notepad", json={"value": "synced"})
            assert response.status_code == 200
            for _ in range(3):
                message = websocket.receive_json()
                if message["type"] == "notepad:update":
                    assert message["value"] == "synced"
                    break
            else:
                raise AssertionError("WebSocket did not receive notepad update.")
