"""
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
    # Wikimedia publishes full daily stats for the previous UTC day
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
