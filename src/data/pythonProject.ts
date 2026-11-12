export interface PythonModuleFile {
  id: string;
  filename: string;
  path: string;
  language: 'python' | 'yaml' | 'text' | 'json';
  titleBn: string;
  purposeBn: string;
  code: string;
}

export const FOLDER_STRUCTURE_TEXT = `trend-monitor-agent/
├── .github/
│   └── workflows/
│       └── daily_trends.yml   # GitHub Actions: রোজ সকাল ৮টায় (BDT) অটোমেটিক চালাবে
├── config.py                  # নিশ, সোর্স লিংক এবং গোপন কী (.env / Secrets) লোড করে
├── collectors.py              # Google Trends, Hacker News, Wikipedia ও News RSS কালেক্টর
├── history_manager.py         # আগের দিন পাঠানো টপিক মনে রাখে (যাতে ডুপ্লিকেট না হয়)
├── gemini_filter.py           # Gemini API দিয়ে আপনার নিশের Top 10 বাছাই ও ১ লাইনে বাংলা ব্যাখ্যা
├── telegram_sender.py         # Telegram Bot দিয়ে সুন্দর মেসেজ পাঠায়
├── main.py                    # মূল ফাইল (এটি চালালেই পুরো এজেন্ট কাজ শুরু করবে)
├── sent_topics.json           # পাঠানো টপিকের হিস্ট্রি ফাইল (অটোমেটিক তৈরি ও আপডেট হয়)
├── requirements.txt           # দরকারি পাইথন লাইব্রেরির তালিকা
└── .env.example               # গোপন API Key ও Token রাখার নমুনা ফাইল`;

export const PYTHON_PROJECT_FILES: PythonModuleFile[] = [
  {
    id: 'config',
    filename: 'config.py',
    path: 'config.py',
    language: 'python',
    titleBn: '১. কনফিগারেশন ও সেটিংস (config.py)',
    purposeBn:
      'এখানে আপনার ৪টি নিশ (AI/Tech, Business, Science, Content Creation), বাংলাদেশ ও গ্লোবাল Google Trends, এবং News RSS লিংকগুলো সাজানো আছে। কোনো পাসওয়ার্ড বা API Key এখানে সরাসরি লেখা নেই—সব .env বা GitHub Secrets থেকে নিরাপদে আসে।',
    code: `"""
config.py
---------
Configuration file for the Daily Trend Monitor Agent.
Loads secret keys from .env or GitHub Actions Secrets (never hardcoded!)
and defines your target niches, regions, and official public feeds.
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file when running on your computer
load_dotenv()

# 1. Secret API Keys & Tokens (Read safely from environment / GitHub Secrets)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

# 2. Gemini Model Configuration
GEMINI_MODEL = "gemini-2.5-flash"
TOP_TRENDS_COUNT = 10

# 3. Your Confirmed Target Niches
TARGET_NICHES = [
    "AI, Tech, and Startups",
    "Business, Finance, and Marketing",
    "Science, Space, and Future Tech",
    "Content Creation and Social Media Trends",
]

# 4. Official Public Data Sources (No fragile HTML scraping!)
# Google Trends Official Daily RSS (Bangladesh & US/Global)
GOOGLE_TRENDS_FEEDS = {
    "Google Trends (Bangladesh)": "https://trends.google.com/trending/rss?geo=BD",
    "Google Trends (Global/US)": "https://trends.google.com/trending/rss?geo=US",
}

# Hacker News Official Firebase REST API
HACKER_NEWS_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
HACKER_NEWS_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{item_id}.json"
HACKER_NEWS_LIMIT = 20

# Wikipedia Official Wikimedia REST API (Most-Viewed Pages)
WIKIPEDIA_MOST_VIEWED_TEMPLATE = (
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/"
    "en.wikipedia/all-access/{year}/{month}/{day}"
)
WIKIPEDIA_LIMIT = 20

# Selected News RSS Feeds (Tech, Global & Bangladesh News)
NEWS_RSS_FEEDS = {
    "TechCrunch": "https://techcrunch.com/feed/",
    "The Verge": "https://www.theverge.com/rss/index.xml",
    "BBC Technology": "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "The Daily Star (BD)": "https://www.thedailystar.net/frontpage/rss.xml",
    "Prothom Alo (BD)": "https://www.prothomalo.com/feed/",
    "Product Hunt": "https://www.producthunt.com/feed",
    "Ars Technica": "https://feeds.arstechnica.com/arstechnica/index",
}
ITEMS_PER_RSS_FEED = 8

# 5. Deduplication History File
HISTORY_FILE_PATH = "sent_topics.json"
HISTORY_RETENTION_DAYS = 14
`,
  },
  {
    id: 'collectors',
    filename: 'collectors.py',
    path: 'collectors.py',
    language: 'python',
    titleBn: '২. পাবলিক ফিড ও API কালেক্টর (collectors.py)',
    purposeBn:
      'কোনো শক্ত বা নিষিদ্ধ স্ক্র্যাপিং ছাড়াই শুধুমাত্র অফিসিয়াল ফিড ও পাবলিক API ব্যবহার করে Google Trends (BD ও Global), Hacker News, Wikipedia Most-Viewed, এবং ৭টি জনপ্রিয় News RSS থেকে ট্রেন্ডিং টপিক সংগ্রহ করে।',
    code: `"""
collectors.py
-------------
Collects trending topics from 4 free, official public sources:
1. Google Trends Daily RSS (Bangladesh & Worldwide/US)
2. Hacker News Official Firebase API
3. Wikipedia Most-Viewed Pages REST API
4. Selected Tech & Bangladesh News RSS Feeds

Zero fragile HTML scraping is used.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
import requests
import feedparser

from config import (
    GOOGLE_TRENDS_FEEDS,
    HACKER_NEWS_TOP_URL,
    HACKER_NEWS_ITEM_URL,
    HACKER_NEWS_LIMIT,
    WIKIPEDIA_MOST_VIEWED_TEMPLATE,
    WIKIPEDIA_LIMIT,
    NEWS_RSS_FEEDS,
    ITEMS_PER_RSS_FEED,
)

# Standard polite User-Agent required by Wikimedia & RSS servers
HEADERS = {
    "User-Agent": "TrendMonitorAgent/1.0 (https://github.com/trend-monitor-agent; contact@example.com)"
}


def fetch_google_trends() -> List[Dict[str, Any]]:
    """Fetches daily trending searches from Google Trends Official RSS (BD & US)."""
    collected = []
    for source_name, rss_url in GOOGLE_TRENDS_FEEDS.items():
        try:
            resp = requests.get(rss_url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:15]:
                title = entry.get("title", "").strip()
                link = entry.get("link", "https://trends.google.com/trending")
                traffic = getattr(entry, "ht_approx_traffic", "")
                if title:
                    collected.append({
                        "title": title,
                        "source": source_name,
                        "url": link,
                        "extra": f"Searches: {traffic}" if traffic else "Daily Search Trend",
                    })
        except Exception as exc:
            print(f"[Warning] Could not fetch {source_name}: {exc}")
    return collected


def fetch_hacker_news() -> List[Dict[str, Any]]:
    """Fetches top stories from the official Hacker News Firebase API."""
    collected = []
    try:
        resp = requests.get(HACKER_NEWS_TOP_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        story_ids = resp.json()[:HACKER_NEWS_LIMIT]

        for item_id in story_ids:
            try:
                item_resp = requests.get(
                    HACKER_NEWS_ITEM_URL.format(item_id=item_id),
                    headers=HEADERS,
                    timeout=10,
                )
                if item_resp.status_code == 200:
                    item = item_resp.json() or {}
                    title = item.get("title", "").strip()
                    url = item.get("url") or f"https://news.ycombinator.com/item?id={item_id}"
                    score = item.get("score", 0)
                    if title:
                        collected.append({
                            "title": title,
                            "source": "Hacker News",
                            "url": url,
                            "extra": f"HN Score: {score} points",
                        })
            except Exception:
                continue
    except Exception as exc:
        print(f"[Warning] Could not fetch Hacker News API: {exc}")
    return collected


def fetch_wikipedia_most_viewed() -> List[Dict[str, Any]]:
    """Fetches yesterday's most-viewed Wikipedia articles via official Wikimedia REST API."""
    collected = []
    target_date = datetime.now(timezone.utc) - timedelta(days=1)
    url = WIKIPEDIA_MOST_VIEWED_TEMPLATE.format(
        year=target_date.strftime("%Y"),
        month=target_date.strftime("%m"),
        day=target_date.strftime("%d"),
    )

    ignored_titles = {
        "Main_Page",
        "Special:Search",
        "Wikipedia:Featured_pictures",
        "Portal:Current_events",
    }

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        articles = data.get("items", [{}])[0].get("articles", [])

        for art in articles:
            raw_title = art.get("article", "")
            if not raw_title or raw_title in ignored_titles or raw_title.startswith("Special:"):
                continue
            clean_title = raw_title.replace("_", " ")
            views = art.get("views", 0)
            article_url = f"https://en.wikipedia.org/wiki/{raw_title}"
            collected.append({
                "title": clean_title,
                "source": "Wikipedia Most Viewed",
                "url": article_url,
                "extra": f"{views:,} views in 24h",
            })
            if len(collected) >= WIKIPEDIA_LIMIT:
                break
    except Exception as exc:
        print(f"[Warning] Could not fetch Wikipedia Most Viewed API: {exc}")
    return collected


def fetch_news_rss() -> List[Dict[str, Any]]:
    """Fetches latest headlines from TechCrunch, The Verge, BBC Tech, BD News, Product Hunt & Ars Technica."""
    collected = []
    for feed_name, rss_url in NEWS_RSS_FEEDS.items():
        try:
            resp = requests.get(rss_url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:ITEMS_PER_RSS_FEED]:
                title = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                summary = entry.get("summary", "")[:180].strip()
                if title:
                    collected.append({
                        "title": title,
                        "source": f"News RSS ({feed_name})",
                        "url": link,
                        "extra": summary if summary else feed_name,
                    })
        except Exception as exc:
            print(f"[Warning] Could not fetch RSS {feed_name}: {exc}")
    return collected


def collect_all_trends() -> List[Dict[str, Any]]:
    """Runs all 4 collectors and returns a combined list of raw topics."""
    print("1/4 Collecting Google Trends (BD & Global)...")
    gt_items = fetch_google_trends()
    print(f"    -> Collected {len(gt_items)} items from Google Trends")

    print("2/4 Collecting Hacker News Top Stories...")
    hn_items = fetch_hacker_news()
    print(f"    -> Collected {len(hn_items)} items from Hacker News")

    print("3/4 Collecting Wikipedia Most-Viewed Pages...")
    wiki_items = fetch_wikipedia_most_viewed()
    print(f"    -> Collected {len(wiki_items)} items from Wikipedia")

    print("4/4 Collecting Tech & Bangladesh News RSS Feeds...")
    rss_items = fetch_news_rss()
    print(f"    -> Collected {len(rss_items)} items from News RSS")

    all_items = gt_items + hn_items + wiki_items + rss_items
    print(f"Total raw topics collected today: {len(all_items)}")
    return all_items
`,
  },
  {
    id: 'history_manager',
    filename: 'history_manager.py',
    path: 'history_manager.py',
    language: 'python',
    titleBn: '৩. ডুপ্লিকেট চেকার ও হিস্ট্রি ম্যানেজার (history_manager.py)',
    purposeBn:
      'আগের দিন যেসব টপিক আপনার টেলিগ্রামে পাঠানো হয়েছে সেগুলো sent_topics.json ফাইলে লিখে রাখে এবং নতুন টপিক বাছাইয়ের আগে পুরোনো টপিকগুলো বাদ দিয়ে দেয়—যাতে একই খবর দুইবার না আসে।',
    code: `"""
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
    cleaned = re.sub(r"[^\\w\\s]", "", title.lower()).strip()
    cleaned = re.sub(r"\\s+", " ", cleaned)
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
`,
  },
  {
    id: 'gemini_filter',
    filename: 'gemini_filter.py',
    path: 'gemini_filter.py',
    language: 'python',
    titleBn: '৪. জেমিনি এআই ফিল্টার ও বাংলা সামারাইজার (gemini_filter.py)',
    purposeBn:
      'সংগৃহীত সব নতুন টপিক দেখে শুধুমাত্র আপনার ৪টি নিশের সাথে মিল রেখে সেরা ১০টি টপিক বাছাই করে এবং প্রত্যেকটির জন্য সহজ বাংলায় ১ লাইনে লেখে কেন এটি আজ ট্রেন্ডিং।',
    code: `"""
gemini_filter.py
----------------
Uses the official Google GenAI SDK (\`google-genai\`) to:
1. Review all fresh topics collected today.
2. Select the Top 10 topics matching your confirmed niches:
   - AI, Tech, and Startups
   - Business, Finance, and Marketing
   - Science, Space, and Future Tech
   - Content Creation and Social Media Trends
3. Write a 1-line explanation in Easy Bengali ("কেন এটি আজ ট্রেন্ডিং") for each topic.
"""

import json
from typing import List, Dict, Any
from google import genai
from google.genai import types

from config import GEMINI_API_KEY, GEMINI_MODEL, TARGET_NICHES, TOP_TRENDS_COUNT


def select_top_trends_with_gemini(fresh_topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filters and ranks the Top 10 niche-matching trends using Gemini API."""
    if not GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is missing! Please set it in your .env file or GitHub Secrets."
        )

    if not fresh_topics:
        return []

    client = genai.Client(api_key=GEMINI_API_KEY)

    candidates_for_prompt = []
    for idx, item in enumerate(fresh_topics[:120], start=1):
        candidates_for_prompt.append(
            f"{idx}. [{item.get('source')}] {item.get('title')} "
            f"({item.get('extra', '')}) | URL: {item.get('url')}"
        )

    candidates_text = "\\n".join(candidates_for_prompt)
    niches_text = ", ".join(TARGET_NICHES)

    prompt = f"""
You are an expert Trend Curator for a creator and tech enthusiast from Bangladesh.

Below is today's list of fresh trending topics from Google Trends (Bangladesh & Global),
Hacker News, Wikipedia Most-Viewed, and Tech/BD News RSS feeds.

TARGET NICHES:
{niches_text}

YOUR TASK:
1. Carefully inspect the candidate topics and select the TOP {TOP_TRENDS_COUNT} most important,
   interesting, and relevant topics that match the TARGET NICHES above.
2. Ensure good variety across the sources (Google Trends, Hacker News, Wikipedia, News RSS) where relevant.
3. For each selected topic, write EXACTLY ONE concise, natural sentence in EASY BENGALI (সহজ বাংলা ভাষায়)
   explaining WHY it is trending today (\`why_trending_bn\`).
4. Keep the original \`title\`, \`source\`, and \`url\` accurate from the candidate list, and assign the best matching \`niche\`.

CANDIDATE TOPICS:
{candidates_text}
"""

    response_schema = types.Schema(
        type=types.Type.ARRAY,
        description="Top 10 curated trending topics matching the user's niches.",
        items=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "rank": types.Schema(type=types.Type.INTEGER, description="Rank from 1 to 10"),
                "title": types.Schema(type=types.Type.STRING, description="Original topic title"),
                "niche": types.Schema(
                    type=types.Type.STRING,
                    description="Matched niche category (e.g., AI & Tech, Business & Finance, Science & Space, Content & Social)",
                ),
                "source": types.Schema(type=types.Type.STRING, description="Source name"),
                "url": types.Schema(type=types.Type.STRING, description="Topic URL"),
                "why_trending_bn": types.Schema(
                    type=types.Type.STRING,
                    description="1-line explanation in Easy Bengali explaining why this topic is trending today.",
                ),
            },
            required=["rank", "title", "niche", "source", "url", "why_trending_bn"],
        ),
    )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
        ),
    )

    raw_json = (response.text or "[]").strip()
    top_trends = json.loads(raw_json)
    return top_trends[:TOP_TRENDS_COUNT]
`,
  },
  {
    id: 'telegram_sender',
    filename: 'telegram_sender.py',
    path: 'telegram_sender.py',
    language: 'python',
    titleBn: '৫. টেলিগ্রাম মেসেজ সেন্ডার (telegram_sender.py)',
    purposeBn:
      'বাছাইকৃত ১০টি টপিককে সুন্দরভাবে সাজিয়ে ক্লিকযোগ্য লিংকসহ আপনার টেলিগ্রাম বট দিয়ে সরাসরি আপনার ইনবক্স বা চ্যানেলে পাঠিয়ে দেয়।',
    code: `"""
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
            title_line = f'<b>{idx}. <a href="{html.escape(url)}">{title}</a></b>'
        else:
            title_line = f"<b>{idx}. {title}</b>"

        lines.append(title_line)
        lines.append(f"ক্যাটাগরি: {niche} · সোর্স: {source}")
        lines.append(f"কেন ট্রেন্ডিং: {why_bn}")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append("<i>সোর্স: Google Trends (BD/Global), Hacker News, Wikipedia ও News RSS</i>")

    return "\\n".join(lines)


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
`,
  },
  {
    id: 'main',
    filename: 'main.py',
    path: 'main.py',
    language: 'python',
    titleBn: '৬. মেইন কন্ট্রোলার ফাইল (main.py)',
    purposeBn:
      'এটি সব ফাইলকে একসাথে যুক্ত করে। আপনি বা GitHub Actions যখন `python main.py` রান করবেন, তখন ধাপে ধাপে ট্রেন্ড সংগ্রহ, ডুপ্লিকেট বাদ দেওয়া, Gemini বাছাই এবং Telegram-এ পাঠানোর কাজটি সম্পন্ন হবে।',
    code: `"""
main.py
-------
Main entry point for the Daily Trend Monitor Agent.
Run this file with: python main.py
"""

import sys
from collectors import collect_all_trends
from history_manager import filter_unseen_topics, save_sent_topics
from gemini_filter import select_top_trends_with_gemini
from telegram_sender import format_telegram_digest, send_to_telegram


def main() -> None:
    print("====================================================")
    print("   Starting Daily Trend Monitor Agent (8:00 AM BDT) ")
    print("====================================================")

    # Step 1: Collect raw topics from all 4 official/public sources
    raw_topics = collect_all_trends()
    if not raw_topics:
        print("No topics could be collected today. Exiting.")
        sys.exit(1)

    # Step 2: Filter out topics already sent on previous days
    fresh_topics = filter_unseen_topics(raw_topics)
    if not fresh_topics:
        print("All collected topics were already sent previously. Exiting.")
        sys.exit(0)

    # Step 3: Filter by your niches & summarize Top 10 in Easy Bengali with Gemini
    print("Analyzing topics with Gemini API for your niches...")
    top_10_trends = select_top_trends_with_gemini(fresh_topics)
    if not top_10_trends:
        print("Gemini returned no matching topics. Exiting.")
        sys.exit(1)

    print(f"Selected {len(top_10_trends)} top trends!")

    # Step 4: Format and send digest to Telegram
    telegram_message = format_telegram_digest(top_10_trends)
    print("\\n--- Telegram Message Preview ---\\n")
    print(telegram_message)
    print("\\n--------------------------------\\n")

    send_to_telegram(telegram_message)

    # Step 5: Save today's sent topics so tomorrow will never repeat them
    save_sent_topics(top_10_trends)
    print("All done! Agent finished successfully.")


if __name__ == "__main__":
    main()
`,
  },
  {
    id: 'requirements',
    filename: 'requirements.txt',
    path: 'requirements.txt',
    language: 'text',
    titleBn: '৭. লাইব্রেরি লিস্ট (requirements.txt)',
    purposeBn: 'এই ৪টি হালকা এবং অফিসিয়াল পাইথন প্যাকেজ ছাড়া আর কিছুই লাগবে না।',
    code: `google-genai>=1.5.0
requests>=2.32.0
feedparser>=6.0.11
python-dotenv>=1.0.1
`,
  },
  {
    id: 'env_example',
    filename: '.env.example',
    path: '.env.example',
    language: 'text',
    titleBn: '৮. গোপন কী রাখার টেমপ্লেট (.env.example)',
    purposeBn:
      'নিজের কম্পিউটারে চালালে এই ফাইলটির নাম `.env` দিয়ে ভেতরে আপনার ৩টি কী বসাবেন। কখনোই আসল `.env` ফাইল GitHub-এ আপলোড করবেন না।',
    code: `# Rename this file to .env on your computer and put your 3 keys inside:
GEMINI_API_KEY="paste_your_gemini_api_key_here"
TELEGRAM_BOT_TOKEN="paste_your_telegram_bot_token_here"
TELEGRAM_CHAT_ID="paste_your_telegram_chat_id_here"
`,
  },
  {
    id: 'github_workflow',
    filename: 'daily_trends.yml',
    path: '.github/workflows/daily_trends.yml',
    language: 'yaml',
    titleBn: '৯. GitHub Actions অটো-শিডিউলার (.github/workflows/daily_trends.yml)',
    purposeBn:
      'এই ফাইলটি আপনার পিসি বন্ধ থাকলেও প্রতিদিন বাংলাদেশ সময় সকাল ৮:০০ টায় (02:00 UTC) অটোমেটিক এজেন্টটি রান করবে এবং sent_topics.json ফাইল আপডেট করে রাখবে।',
    code: `name: Daily Trend Monitor Agent (8 AM BDT)

on:
  schedule:
    # 02:00 UTC = সকাল ৮:০০ টা (Bangladesh Standard Time, UTC+6)
    - cron: '0 2 * * *'
  workflow_dispatch: # Allows you to test anytime with 1 click ("Run workflow" button)

permissions:
  contents: write # Needed to save updated sent_topics.json back to repo so topics don't repeat

jobs:
  run-trend-monitor:
    runs-on: ubuntu-latest

    steps:
      - name: 1. Checkout Repository
        uses: actions/checkout@v4

      - name: 2. Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: 3. Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: 4. Run Trend Monitor Agent
        env:
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
          TELEGRAM_BOT_TOKEN: \${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: \${{ secrets.TELEGRAM_CHAT_ID }}
        run: |
          python main.py

      - name: 5. Save Sent Topics History (Prevent Repeats Tomorrow)
        run: |
          if [ -f sent_topics.json ]; then
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add sent_topics.json
            git diff --staged --quiet || git commit -m "chore: update sent_topics.json history [skip ci]"
            git push
          fi
`,
  },
];
