from __future__ import annotations

import time
import zipfile
from contextlib import contextmanager
from io import BytesIO

from fastapi.testclient import TestClient

from justshare.app import cleanup_archive_jobs, create_app
from justshare.config import Config, load_config


@contextmanager
def make_client(tmp_path):
    base = load_config()
    config = Config(
        host="127.0.0.1",
        port=8787,
        storage_dir=tmp_path,
        room_ttl_seconds=3600,
        max_upload_files=10000,
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
        with zipfile.ZipFile(BytesIO(folder.content)) as archive:
            assert archive.namelist() == ["folder/child.txt"]

        all_uploads = client.get(f"/api/rooms/{code}/uploads/download")
        assert all_uploads.status_code == 200
        assert all_uploads.content == b"content"
        assert all_uploads.headers["content-type"].startswith("text/plain")

        files = [("files", ("sibling.txt", b"second", "text/plain"))]
        data = {"relative_paths": "sibling.txt"}
        response = client.post(f"/api/rooms/{code}/uploads", files=files, data=data)
        assert response.status_code == 200

        all_uploads = client.get(f"/api/rooms/{code}/uploads/download")
        assert all_uploads.status_code == 200
        assert all_uploads.headers["content-type"] == "application/zip"

        selected = client.get(f"/api/rooms/{code}/selection/download", params={"file_id": file_id})
        assert selected.status_code == 200
        assert selected.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(BytesIO(selected.content)) as archive:
            assert archive.namelist() == ["folder/child.txt"]

        cleared = client.delete(f"/api/rooms/{code}/uploads")
        assert cleared.status_code == 200
        assert cleared.json()["tree"]["children"] == []


def test_room_payload_keeps_room_code_when_code_area_empty(tmp_path) -> None:
    with make_client(tmp_path) as client:
        code = client.post("/api/rooms").json()["code"]
        state = client.get(f"/api/rooms/{code}").json()
        assert state["room_code"] == code
        assert state["code_text"] == ""


def test_upload_archive_job_reports_progress_and_downloads_zip(tmp_path) -> None:
    with make_client(tmp_path) as client:
        code = client.post("/api/rooms").json()["code"]
        response = client.post(
            f"/api/rooms/{code}/uploads",
            files=[
                ("files", ("a.txt", b"alpha", "text/plain")),
                ("files", ("b.txt", b"beta", "text/plain")),
            ],
            data={"relative_paths": ["folder/a.txt", "b.txt"]},
        )
        assert response.status_code == 200

        created = client.post(f"/api/rooms/{code}/uploads/archive")
        assert created.status_code == 200
        job = created.json()
        assert job["total_files"] == 2
        assert job["total_bytes"] == 9

        for _ in range(20):
            job = client.get(f"/api/rooms/{code}/uploads/archive/{job['id']}").json()
            if job["status"] == "ready":
                break
            time.sleep(0.05)
        assert job["status"] == "ready"
        assert job["percent"] == 100

        download = client.get(f"/api/rooms/{code}/uploads/archive/{job['id']}/download")
        assert download.status_code == 200
        assert download.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(BytesIO(download.content)) as archive:
            assert sorted(archive.namelist()) == ["b.txt", "folder/a.txt"]


def test_upload_accepts_more_than_starlette_default_file_limit(tmp_path) -> None:
    with make_client(tmp_path) as client:
        code = client.post("/api/rooms").json()["code"]
        count = 1001
        response = client.post(
            f"/api/rooms/{code}/uploads",
            files=[("files", (f"{index}.txt", b"x", "text/plain")) for index in range(count)],
            data={"relative_paths": [f"folder/{index}.txt" for index in range(count)]},
        )

        assert response.status_code == 200
        folder = response.json()["tree"]["children"][0]
        assert folder["name"] == "folder"
        assert len(folder["children"]) == count


def test_stale_archive_jobs_are_cleaned_up(tmp_path) -> None:
    zip_dir = tmp_path / "job"
    zip_dir.mkdir()
    zip_path = zip_dir / "abandoned.zip"
    zip_path.write_bytes(b"zip")
    jobs = {
        "old": {
            "status": "ready",
            "created_at": time.time() - 3600,
            "path": str(zip_path),
        },
        "active": {
            "status": "preparing",
            "created_at": time.time() - 3600,
            "path": "",
        },
    }

    cleanup_archive_jobs(jobs, max_age_seconds=1800)

    assert "old" not in jobs
    assert not zip_dir.exists()
    assert "active" in jobs


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
