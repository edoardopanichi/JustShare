from __future__ import annotations

import secrets


WORDS = (
    "apple", "blue", "book", "brick", "brush", "cake", "car", "chair", "cloud", "coin",
    "desk", "door", "dream", "earth", "field", "fire", "fish", "flag", "flower", "fly",
    "glass", "green", "happy", "hill", "house", "jump", "key", "lamp", "leaf", "light",
    "map", "moon", "music", "night", "number", "orange", "paper", "pen", "plant", "quiet",
    "rain", "red", "river", "road", "rock", "room", "salt", "sand", "ship", "shoe",
    "silver", "sky", "smile", "snow", "song", "star", "stone", "sun", "table", "tree",
    "truck", "water", "white", "window", "yellow", "yes",
)


def new_room_code() -> str:
    return "-".join(secrets.choice(WORDS) for _ in range(3))


def normalize_room_code(code: str) -> str:
    normalized = code.strip().lower()
    parts = normalized.split("-")
    if len(parts) != 3 or any(part not in WORDS for part in parts):
        raise ValueError("Room code must be three known words separated by hyphens.")
    return normalized
