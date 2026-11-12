"""
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
# Note: Date (YYYY/MM/DD) is filled dynamically in collectors.py
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
