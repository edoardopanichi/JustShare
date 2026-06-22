from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class RoomConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, code: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[code].add(websocket)

    def disconnect(self, code: str, websocket: WebSocket) -> None:
        sockets = self._rooms.get(code)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._rooms.pop(code, None)

    def active_room_codes(self) -> set[str]:
        return {code for code, sockets in self._rooms.items() if sockets}

    async def broadcast(self, code: str, message: dict) -> None:
        stale = []
        for websocket in list(self._rooms.get(code, set())):
            try:
                await websocket.send_json(message)
            except RuntimeError:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(code, websocket)
