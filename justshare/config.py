from __future__ import annotations

import os
from dataclasses import dataclass
from ipaddress import ip_network
from pathlib import Path


DEFAULT_ALLOWED_NETWORKS = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32,::1/128"


@dataclass(frozen=True)
class Config:
    host: str
    port: int
    storage_dir: Path
    room_ttl_seconds: int
    allowed_networks: tuple


def _parse_allowed_networks(value: str) -> tuple:
    networks = []
    for raw in value.split(","):
        item = raw.strip()
        if item:
            networks.append(ip_network(item, strict=False))
    return tuple(networks)


def load_config() -> Config:
    storage_dir = Path(os.getenv("JUSTSHARE_STORAGE_DIR", "./data")).expanduser().resolve()
    return Config(
        host=os.getenv("JUSTSHARE_HOST", "0.0.0.0"),
        port=int(os.getenv("JUSTSHARE_PORT", "8787")),
        storage_dir=storage_dir,
        room_ttl_seconds=int(os.getenv("JUSTSHARE_ROOM_TTL_SECONDS", "3600")),
        allowed_networks=_parse_allowed_networks(
            os.getenv("JUSTSHARE_ALLOWED_NETWORKS", DEFAULT_ALLOWED_NETWORKS)
        ),
    )
