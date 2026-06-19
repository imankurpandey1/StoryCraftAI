from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings:
    SECRET_KEY = os.environ.get("STORYCRAFT_SECRET_KEY", "storycraft-dev-secret")
    HOST = os.environ.get("STORYCRAFT_HOST", "127.0.0.1")
    PORT = int(os.environ.get("STORYCRAFT_PORT", "5000"))
    DEBUG = os.environ.get("STORYCRAFT_DEBUG", "1") == "1"
    DB_PATH = Path(os.environ.get("STORYCRAFT_DB_PATH", BASE_DIR / "backend" / "database" / "storycraft.db"))
    MODEL_CACHE_DIR = Path(os.environ.get("STORYCRAFT_MODEL_CACHE_DIR", BASE_DIR / "backend" / "models"))
    MAX_PROMPT_CHARS = int(os.environ.get("STORYCRAFT_MAX_PROMPT_CHARS", "5000"))
    FRONTEND_ORIGIN = os.environ.get("STORYCRAFT_FRONTEND_ORIGIN", "*")
    CORS_ORIGINS = "*"

    GENRES = [
        "Fantasy",
        "Mystery",
        "Horror",
        "Sci-Fi",
        "Adventure",
        "Romance",
        "Mythology",
        "Children's Stories",
    ]

    MODEL_REGISTRY = {
        "gpt2": {
            "label": "GPT-2",
            "hf_id": "gpt2",
            "description": "GPT-2 baseline for richer long-form generation.",
        },
        "distilgpt2": {
            "label": "DistilGPT-2",
            "hf_id": "distilgpt2",
            "description": "Compact distilled GPT-2 model optimized for faster inference.",
        },
        "qwen2.5-0.5b-instruct": {
            "label": "Qwen2.5 0.5B Instruct",
            "hf_id": "Qwen/Qwen2.5-0.5B-Instruct",
            "description": "Instruction-tuned model with stronger prompt adherence and story planning.",
            "chat_template": True,
        },
    }
