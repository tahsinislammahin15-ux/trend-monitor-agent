"""
history_manager.py
------------------
Manages 'sent_topics.json' so that any topic already sent on previous days
is never sent again (Deduplication).
"""

import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from config import HISTORY_FILE_PATH, HISTORY_RETENTION_DAYS


def normalize_title(title: str) -> str:
    """Normalizes a topic title for reliable duplicate comparison."""
    cleaned = re.sub(r"[^\w\s]", "", title.lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def load_sent_history() -> List[Dict[str, str]]:
    """Loads previously sent topics from sent_topics.json and prunes old entries."""
    if not os.path.exists(HISTORY_FILE_PATH):
        return []

    try:
        with open(HISTORY_FILE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                return []
    except Exception:
        return []

    # Keep only topics from the last HISTORY_RETENTION_DAYS days
    cutoff = datetime.now(timezone.utc) - timedelta(days=HISTORY_RETENTION_DAYS)
    valid_records = []
    for record in data:
        try:
            sent_date = datetime.fromisoformat(record.get("sent_at", ""))
            if sent_date >= cutoff:
                valid_records.append(record)
        except Exception:
            valid_records.append(record)

    return valid_records


def filter_unseen_topics(raw_topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Removes topics that were already sent in previous days or duplicated across feeds."""
    history = load_sent_history()
    sent_keys = {normalize_title(item.get("title", "")) for item in history if item.get("title")}

    fresh_topics = []
    seen_today = set()

    for topic in raw_topics:
        norm = normalize_title(topic.get("title", ""))
        if not norm:
            continue
        # Skip if already sent on an earlier day OR already seen in today's batch
        if norm in sent_keys or norm in seen_today:
            continue
        seen_today.add(norm)
        fresh_topics.append(topic)

    print(
        f"Deduplication complete: {len(raw_topics)} raw -> "
        f"{len(fresh_topics)} fresh unseen topics."
    )
    return fresh_topics


def save_sent_topics(selected_topics: List[Dict[str, Any]]) -> None:
    """Appends today's sent Top 10 topics into sent_topics.json."""
    history = load_sent_history()
    now_iso = datetime.now(timezone.utc).isoformat()

    for topic in selected_topics:
        history.append({
            "title": topic.get("title", ""),
            "normalized": normalize_title(topic.get("title", "")),
            "source": topic.get("source", ""),
            "sent_at": now_iso,
        })

    with open(HISTORY_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(selected_topics)} topics to {HISTORY_FILE_PATH} to prevent future repeats.")
