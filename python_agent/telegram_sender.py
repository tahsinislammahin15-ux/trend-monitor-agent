"""
telegram_sender.py
------------------
Formats the curated Top 10 trends into a clean Easy Bengali digest
and sends it to your Telegram chat or channel via the official Telegram Bot API.
"""

from datetime import datetime, timezone, timedelta
import html
from typing import List, Dict, Any
import requests

from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID


def format_telegram_digest(top_trends: List[Dict[str, Any]]) -> str:
    """Formats the Top 10 trends into an HTML-safe Telegram message in Easy Bengali."""
    # Bangladesh Standard Time (UTC+6)
    bdt_now = datetime.now(timezone(timedelta(hours=6)))
    date_str = bdt_now.strftime("%d %B %Y, সকাল %I:%M BDT")

    lines = [
        "<b>আজকের সেরা ১০টি ট্রেন্ডিং টপিক (Daily Trend Monitor)</b>",
        f"<i>{html.escape(date_str)}</i>",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
    ]

    for idx, item in enumerate(top_trends, start=1):
        title = html.escape(str(item.get("title", "Untitled")))
        niche = html.escape(str(item.get("niche", "Tech & Trends")))
        source = html.escape(str(item.get("source", "Public Feed")))
        why_bn = html.escape(str(item.get("why_trending_bn", "")))
        url = str(item.get("url", "")).strip()

        if url.startswith("http"):
            title_line = f"<b>{idx}. <a href=\"{html.escape(url)}\">{title}</a></b>"
        else:
            title_line = f"<b>{idx}. {title}</b>"

        lines.append(title_line)
        lines.append(f"ক্যাটাগরি: {niche} · সোর্স: {source}")
        lines.append(f"কেন ট্রেন্ডিং: {why_bn}")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append("<i>সোর্স: Google Trends (BD/Global), Hacker News, Wikipedia ও News RSS</i>")

    return "\n".join(lines)


def send_to_telegram(message_html: str) -> bool:
    """Sends the formatted HTML message to Telegram using official Bot API."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise ValueError(
            "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing! "
            "Please add them to your .env file or GitHub Secrets."
        )

    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message_html,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    resp = requests.post(api_url, json=payload, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f"Telegram API Error ({resp.status_code}): {resp.text}")

    print("Successfully delivered today's Top 10 digest to Telegram!")
    return True
