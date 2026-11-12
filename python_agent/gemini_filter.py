"""
gemini_filter.py
----------------
Uses the official Google GenAI SDK (`google-genai`) to:
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

    # Prepare compact list of candidate topics for Gemini
    candidates_For_prompt = []
    for idx, item in enumerate(fresh_topics[:120], start=1):
        candidates_For_prompt.append(
            f"{idx}. [{item.get('source')}] {item.get('title')} "
            f"({item.get('extra', '')}) | URL: {item.get('url')}"
        )

    candidates_text = "\n".join(candidates_For_prompt)
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
   explaining WHY it is trending today (`why_trending_bn`).
4. Keep the original `title`, `source`, and `url` accurate from the candidate list, and assign the best matching `niche`.

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
