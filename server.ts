import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "2mb" }));

// Initialize Gemini client on the server with mandatory User-Agent header
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Persistent deduplication history store
const DATA_DIR = path.resolve(process.cwd(), "data");
const HISTORY_FILE = path.join(DATA_DIR, "sent_topics.json");

interface SentTopicRecord {
  title: string;
  normalized: string;
  source: string;
  sentAt: string;
}

interface RawTopic {
  title: string;
  source: string;
  categoryGroup: "google_trends" | "hacker_news" | "wikipedia" | "news_rss";
  url: string;
  extra: string;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadSentHistory(): SentTopicRecord[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return parsed.filter((item: SentTopicRecord) => {
      const t = Date.parse(item.sentAt);
      return isNaN(t) || t >= cutoff;
    });
  } catch {
    return [];
  }
}

function saveSentHistory(records: SentTopicRecord[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2), "utf-8");
}

// Simple XML tag extractor for RSS feeds (avoids extra native dependencies)
function extractXmlItems(xml: string, maxItems = 12): Array<{ title: string; link: string; traffic: string }> {
  const items: Array<{ title: string; link: string; traffic: string }> = [];
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  const decodeEntities = (str: string) =>
    str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/<[^>]+>/g, "")
      .trim();

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let link = "";
    const linkHrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const linkTagMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkHrefMatch) {
      link = linkHrefMatch[1].trim();
    } else if (linkTagMatch) {
      link = decodeEntities(linkTagMatch[1]);
    }
    const trafficMatch = block.match(/<ht:approx_traffic[^>]*>([\s\S]*?)<\/ht:approx_traffic>/i);

    const title = titleMatch ? decodeEntities(titleMatch[1]) : "";
    const traffic = trafficMatch ? decodeEntities(trafficMatch[1]) : "";
    if (title) {
      items.push({ title, link, traffic });
    }
  }
  return items;
}

const REQUEST_HEADERS = {
  "User-Agent": "TrendMonitorAgent/1.0 (https://github.com/trend-monitor-agent; public-feed-reader)",
  Accept: "application/rss+xml, application/xml, text/xml, application/json, */*",
};

async function fetchWithTimeout(url: string, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function collectGoogleTrends(): Promise<RawTopic[]> {
  const feeds = [
    { name: "Google Trends (Bangladesh)", url: "https://trends.google.com/trending/rss?geo=BD" },
    { name: "Google Trends (Global/US)", url: "https://trends.google.com/trending/rss?geo=US" },
  ];
  const results: RawTopic[] = [];
  await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await fetchWithTimeout(f.url, 9000);
        if (!res.ok) return;
        const xml = await res.text();
        const parsed = extractXmlItems(xml, 14);
        for (const item of parsed) {
          results.push({
            title: item.title,
            source: f.name,
            categoryGroup: "google_trends",
            url: item.link || "https://trends.google.com/trending",
            extra: item.traffic ? `Searches: ${item.traffic}` : "Trending Search",
          });
        }
      } catch (err) {
        console.warn(`Google Trends fetch warning (${f.name}):`, err);
      }
    })
  );
  return results;
}

async function collectHackerNews(): Promise<RawTopic[]> {
  const results: RawTopic[] = [];
  try {
    const res = await fetchWithTimeout("https://hacker-news.firebaseio.com/v0/topstories.json", 9000);
    if (!res.ok) return results;
    const ids = (await res.json()) as number[];
    const topIds = ids.slice(0, 18);

    const items = await Promise.all(
      topIds.map(async (id) => {
        try {
          const itemRes = await fetchWithTimeout(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            6000
          );
          if (!itemRes.ok) return null;
          return await itemRes.json();
        } catch {
          return null;
        }
      })
    );

    for (const item of items) {
      if (item && item.title) {
        results.push({
          title: String(item.title).trim(),
          source: "Hacker News",
          categoryGroup: "hacker_news",
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          extra: `HN Score: ${item.score || 0} points`,
        });
      }
    }
  } catch (err) {
    console.warn("Hacker News fetch warning:", err);
  }
  return results;
}

async function collectWikipediaMostViewed(): Promise<RawTopic[]> {
  const results: RawTopic[] = [];
  // Try yesterday first, then 2 days ago in case UTC rollup is still processing
  for (const daysAgo of [1, 2]) {
    if (results.length > 0) break;
    try {
      const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${month}/${day}`;

      const res = await fetchWithTimeout(url, 9000);
      if (!res.ok) continue;
      const data = await res.json();
      const articles = data?.items?.[0]?.articles || [];
      const ignored = new Set([
        "Main_Page",
        "Special:Search",
        "Wikipedia:Featured_pictures",
        "Portal:Current_events",
      ]);

      for (const art of articles) {
        const rawTitle = String(art.article || "");
        if (!rawTitle || ignored.has(rawTitle) || rawTitle.startsWith("Special:")) continue;
        results.push({
          title: rawTitle.replace(/_/g, " "),
          source: "Wikipedia Most Viewed",
          categoryGroup: "wikipedia",
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(rawTitle)}`,
          extra: `${Number(art.views || 0).toLocaleString()} views in 24h`,
        });
        if (results.length >= 16) break;
      }
    } catch (err) {
      console.warn("Wikipedia fetch warning:", err);
    }
  }
  return results;
}

async function collectNewsRss(): Promise<RawTopic[]> {
  const feeds = [
    { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
    { name: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { name: "The Daily Star (BD)", url: "https://www.thedailystar.net/frontpage/rss.xml" },
    { name: "Product Hunt", url: "https://www.producthunt.com/feed" },
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  ];

  const results: RawTopic[] = [];
  await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await fetchWithTimeout(f.url, 9000);
        if (!res.ok) return;
        const xml = await res.text();
        const items = extractXmlItems(xml, 7);
        for (const item of items) {
          results.push({
            title: item.title,
            source: `News RSS (${f.name})`,
            categoryGroup: "news_rss",
            url: item.link || f.url,
            extra: f.name,
          });
        }
      } catch (err) {
        console.warn(`RSS fetch warning (${f.name}):`, err);
      }
    })
  );
  return results;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTelegramDigest(
  trends: Array<{
    rank: number;
    title: string;
    niche: string;
    source: string;
    url: string;
    why_trending_bn: string;
  }>
): { htmlText: string; plainPreview: string } {
  const bdtDate = new Intl.DateTimeFormat("bn-BD", {
    timeZone: "Asia/Dhaka",
    dateStyle: "long",
  }).format(new Date());

  const htmlLines: string[] = [
    `<b>আজকের সেরা ১০টি ট্রেন্ডিং টপিক (Daily Trend Monitor)</b>`,
    `<i>${escapeHtml(bdtDate)} · সকাল ৮:০০ BDT শিডিউল</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  const plainLines: string[] = [
    `আজকের সেরা ১০টি ট্রেন্ডিং টপিক (Daily Trend Monitor)`,
    `${bdtDate} · সকাল ৮:০০ BDT শিডিউল`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  trends.forEach((item, index) => {
    const rank = item.rank || index + 1;
    const safeTitle = escapeHtml(item.title);
    const safeNiche = escapeHtml(item.niche);
    const safeSource = escapeHtml(item.source);
    const safeWhy = escapeHtml(item.why_trending_bn);
    const url = (item.url || "").trim();

    if (url.startsWith("http")) {
      htmlLines.push(`<b>${rank}. <a href="${escapeHtml(url)}">${safeTitle}</a></b>`);
    } else {
      htmlLines.push(`<b>${rank}. ${safeTitle}</b>`);
    }
    htmlLines.push(`ক্যাটাগরি: ${safeNiche} · সোর্স: ${safeSource}`);
    htmlLines.push(`কেন ট্রেন্ডিং: ${safeWhy}`);
    htmlLines.push(``);

    plainLines.push(`${rank}. ${item.title}`);
    plainLines.push(`ক্যাটাগরি: ${item.niche} · সোর্স: ${item.source}`);
    plainLines.push(`কেন ট্রেন্ডিং: ${item.why_trending_bn}`);
    if (url.startsWith("http")) {
      plainLines.push(`লিংক: ${url}`);
    }
    plainLines.push(``);
  });

  htmlLines.push(`━━━━━━━━━━━━━━━━━━━━`);
  htmlLines.push(`<i>সোর্স: Google Trends (BD/Global), Hacker News, Wikipedia ও News RSS</i>`);

  plainLines.push(`━━━━━━━━━━━━━━━━━━━━`);
  plainLines.push(`সোর্স: Google Trends (BD/Global), Hacker News, Wikipedia ও News RSS`);

  return {
    htmlText: htmlLines.join("\n"),
    plainPreview: plainLines.join("\n"),
  };
}

// API: Get sent history
app.get("/api/history", (_req, res) => {
  const history = loadSentHistory();
  res.json({ count: history.length, items: history.slice(-30).reverse() });
});

// API: Clear sent history
app.post("/api/history/clear", (_req, res) => {
  saveSentHistory([]);
  res.json({ success: true, count: 0, items: [] });
});

// API: Run the full live Trend Monitor Agent pipeline
app.post("/api/agent/run", async (req, res) => {
  try {
    const customNiches: string[] = Array.isArray(req.body?.niches) && req.body.niches.length > 0
      ? req.body.niches
      : [
          "AI, Tech, and Startups",
          "Business, Finance, and Marketing",
          "Science, Space, and Future Tech",
          "Content Creation and Social Media Trends",
        ];
    const saveToHistory: boolean = req.body?.saveToHistory !== false;

    // 1. Collect in parallel from all 4 official/public sources
    const [googleTrends, hackerNews, wikipedia, newsRss] = await Promise.all([
      collectGoogleTrends(),
      collectHackerNews(),
      collectWikipediaMostViewed(),
      collectNewsRss(),
    ]);

    const allRaw = [...googleTrends, ...hackerNews, ...wikipedia, ...newsRss];

    // 2. Deduplicate against previously sent topics
    const history = loadSentHistory();
    const sentNormalized = new Set(history.map((h) => h.normalized));
    const seenToday = new Set<string>();
    const freshTopics: RawTopic[] = [];
    let skippedDuplicates = 0;

    for (const item of allRaw) {
      const norm = normalizeTitle(item.title);
      if (!norm) continue;
      if (sentNormalized.has(norm) || seenToday.has(norm)) {
        skippedDuplicates++;
        continue;
      }
      seenToday.add(norm);
      freshTopics.push(item);
    }

    // If all topics were somehow already in history, fall back to today's unique topics
    const candidatePool = freshTopics.length >= 10 ? freshTopics : allRaw.slice(0, 50);

    // 3. Call Gemini API to filter by niches and write 1-line Easy Bengali explanations
    const ai = getGenAIClient();
    const candidateLines = candidatePool
      .slice(0, 100)
      .map(
        (t, idx) =>
          `${idx + 1}. [${t.source}] ${t.title} (${t.extra}) | URL: ${t.url}`
      )
      .join("\n");

    const prompt = `You are an expert Daily Trend Monitor Agent for a user in Bangladesh.
Review the collected fresh trending topics below from Google Trends (Bangladesh & Global), Hacker News, Wikipedia Most-Viewed, and Tech/BD News RSS.

TARGET NICHES:
${customNiches.join(", ")}

INSTRUCTIONS:
1. Select the TOP 10 most relevant, high-impact trending topics that match the TARGET NICHES above.
2. Include a balanced mix across the sources (Google Trends, Hacker News, Wikipedia, News RSS) where relevant.
3. For each of the 10 topics, write a clear, natural 1-line explanation in EASY BENGALI (সহজ বাংলা ভাষায়) in \`why_trending_bn\` explaining WHY this topic is trending today.
4. Keep the original \`title\`, \`source\`, and \`url\` accurate from the candidate list.

CANDIDATE TOPICS:
${candidateLines}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "Top 10 curated trending topics matching the target niches.",
          items: {
            type: Type.OBJECT,
            properties: {
              rank: { type: Type.INTEGER, description: "Rank from 1 to 10" },
              title: { type: Type.STRING, description: "Original topic title" },
              niche: {
                type: Type.STRING,
                description:
                  "Matched niche label (e.g., AI & Tech, Business & Finance, Science & Space, Content & Social)",
              },
              source: { type: Type.STRING, description: "Source feed name" },
              url: { type: Type.STRING, description: "Link to the topic or article" },
              why_trending_bn: {
                type: Type.STRING,
                description: "1-line explanation in Easy Bengali explaining why it is trending today",
              },
            },
            required: ["rank", "title", "niche", "source", "url", "why_trending_bn"],
          },
        },
      },
    });

    const jsonText = (response.text ?? "[]").trim();
    const curatedTop10 = JSON.parse(jsonText).slice(0, 10);

    // 4. Save to deduplication history if enabled
    if (saveToHistory && curatedTop10.length > 0) {
      const nowIso = new Date().toISOString();
      const updatedHistory = [
        ...history,
        ...curatedTop10.map((item: { title: string; source: string }) => ({
          title: item.title,
          normalized: normalizeTitle(item.title),
          source: item.source,
          sentAt: nowIso,
        })),
      ];
      saveSentHistory(updatedHistory);
    }

    const telegramFormatted = formatTelegramDigest(curatedTop10);

    res.json({
      stats: {
        googleTrendsCount: googleTrends.length,
        hackerNewsCount: hackerNews.length,
        wikipediaCount: wikipedia.length,
        newsRssCount: newsRss.length,
        totalRawCount: allRaw.length,
        skippedDuplicatesCount: skippedDuplicates,
        freshCandidatesCount: freshTopics.length,
      },
      top10: curatedTop10,
      telegramHtml: telegramFormatted.htmlText,
      telegramPlain: telegramFormatted.plainPreview,
      rawSample: candidatePool.slice(0, 30),
    });
  } catch (error: unknown) {
    console.error("Error running Trend Monitor Agent:", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(500).json({ error: message });
  }
});

// API: Send curated message to Telegram
app.post("/api/telegram/send", async (req, res) => {
  try {
    const botToken = (req.body?.botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = (req.body?.chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
    const messageHtml = (req.body?.messageHtml || "").trim();

    if (!botToken || !chatId) {
      res.status(400).json({
        error:
          "Telegram Bot Token এবং Chat ID প্রয়োজন। নিচের বক্সে আপনার Bot Token ও Chat ID দিন।",
      });
      return;
    }

    if (!messageHtml) {
      res.status(400).json({ error: "পাঠানোর জন্য কোনো মেসেজ পাওয়া যায়নি। আগে এজেন্ট রান করুন।" });
      return;
    }

    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json();
    if (!tgRes.ok || !tgData.ok) {
      res.status(400).json({
        error: `Telegram API Error: ${tgData.description || "টোকেন বা Chat ID সঠিক কিনা চেক করুন।"}`,
      });
      return;
    }

    res.json({
      success: true,
      message: "আপনার Telegram-এ আজকের Top 10 ট্রেন্ডের মেসেজ সফলভাবে পাঠানো হয়েছে!",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send Telegram message";
    res.status(500).json({ error: message });
  }
});

// API: Troubleshoot user's Python or GitHub Actions error in Easy Bengali
app.post("/api/troubleshoot", async (req, res) => {
  try {
    const errorLog = String(req.body?.errorLog || "").trim();
    if (!errorLog) {
      res.status(400).json({ error: "দয়া করে আপনার এরর মেসেজটি বক্সে পেস্ট করুন।" });
      return;
    }

    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `A user who does not know coding is running our Python "Daily Trend Monitor Agent" (which uses config.py, collectors.py, history_manager.py, gemini_filter.py, telegram_sender.py, main.py, requirements.txt, and GitHub Actions daily_trends.yml).
They encountered the following error message:

"""
${errorLog}
"""

Explain in very simple, friendly EASY BENGALI (সহজ বাংলা ভাষায়):
1. কেন এই এররটি হয়েছে (১-২ লাইনে একদম সহজ ভাষায়)।
2. কীভাবে এটি ঠিক করবেন (Step-by-step ১, ২, ৩ করে একদম পরিষ্কার নির্দেশনা)।
3. যদি কোনো কমান্ড বা কোড লাইন পরিবর্তন করতে হয়, তবে সেটি আলাদা করে দেখান।`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            causeBn: {
              type: Type.STRING,
              description: "Simple explanation in Easy Bengali of why the error happened",
            },
            stepsBn: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Step-by-step instructions in Easy Bengali to fix the error",
            },
            fixedSnippet: {
              type: Type.STRING,
              description: "Exact command or code snippet to copy-paste (or empty string if not needed)",
            },
          },
          required: ["causeBn", "stepsBn", "fixedSnippet"],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? "{}").trim());
    res.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to analyze error";
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Trend Monitor Agent Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
