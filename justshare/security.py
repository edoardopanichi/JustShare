from __future__ import annotations

from ipaddress import ip_address


def is_allowed_client(host: str | None, allowed_networks: tuple) -> bool:
    if not host:
        return False
    if host in {"localhost", "testclient"}:
        return True
    try:
        address = ip_address(host)
    except ValueError:
        return False
    return any(address in network for network in allowed_networks)
