import React, { useState, useEffect } from "react";
import {
  Play,
  Copy,
  Check,
  Download,
  Send,
  RefreshCw,
  ExternalLink,
  Trash2,
  FileCode,
  FolderTree,
  BookOpen,
  Wrench,
  Clock,
} from "lucide-react";
import {
  PYTHON_PROJECT_FILES,
  FOLDER_STRUCTURE_TEXT,
  PythonModuleFile,
} from "./data/pythonProject";

interface CuratedTrend {
  rank: number;
  title: string;
  niche: string;
  source: string;
  url: string;
  why_trending_bn: string;
}

interface RunStats {
  googleTrendsCount: number;
  hackerNewsCount: number;
  wikipediaCount: number;
  newsRssCount: number;
  totalRawCount: number;
  skippedDuplicatesCount: number;
  freshCandidatesCount: number;
}

interface HistoryItem {
  title: string;
  normalized: string;
  source: string;
  sentAt: string;
}

interface TroubleshootResult {
  causeBn: string;
  stepsBn: string[];
  fixedSnippet: string;
}

const DEFAULT_NICHES = [
  "AI, Tech, and Startups",
  "Business, Finance, and Marketing",
  "Science, Space, and Future Tech",
  "Content Creation and Social Media Trends",
];

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "live" | "code" | "guide" | "troubleshoot"
  >("live");

  // Live Agent State
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [top10, setTop10] = useState<CuratedTrend[]>([]);
  const [telegramHtml, setTelegramHtml] = useState<string>("");
  const [telegramPlain, setTelegramPlain] = useState<string>("");
  const [selectedNicheFilter, setSelectedNicheFilter] = useState<string>("all");
  const [copiedDigest, setCopiedDigest] = useState(false);

  // Deduplication History State
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Telegram Test Sender State
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [isSendingTg, setIsSendingTg] = useState(false);
  const [tgStatus, setTgStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Code Explorer State
  const [selectedFileId, setSelectedFileId] = useState<string>("config");
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);

  // Error Fixer State
  const [errorInput, setErrorInput] = useState("");
  const [isFixingError, setIsFixingError] = useState(false);
  const [troubleshootResult, setTroubleshootResult] =
    useState<TroubleshootResult | null>(null);
  const [troubleshootError, setTroubleshootError] = useState<string | null>(
    null
  );

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        setHistoryCount(data.count || 0);
        setHistoryItems(data.items || []);
      }
    } catch {
      // ignore initial history load error
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleRunAgent = async () => {
    setActiveTab("live");
    setIsRunning(true);
    setRunError(null);
    setTgStatus(null);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niches: DEFAULT_NICHES,
          saveToHistory: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to run Trend Monitor Agent");
      }
      setStats(data.stats);
      setTop10(data.top10 || []);
      setTelegramHtml(data.telegramHtml || "");
      setTelegramPlain(data.telegramPlain || "");
      setSelectedNicheFilter("all");
      await fetchHistory();
    } catch (err: unknown) {
      setRunError(
        err instanceof Error ? err.message : "এজেন্ট রান করতে সমস্যা হয়েছে।"
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch("/api/history/clear", { method: "POST" });
      if (res.ok) {
        setHistoryCount(0);
        setHistoryItems([]);
      }
    } catch {
      // ignore
    }
  };

  const handleCopyDigest = () => {
    if (!telegramPlain) return;
    navigator.clipboard.writeText(telegramPlain);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  const handleSendTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramHtml) return;
    setIsSendingTg(true);
    setTgStatus(null);

    try {
      const res = await fetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken,
          chatId,
          messageHtml: telegramHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Telegram-এ মেসেজ পাঠানো যায়নি।");
      }
      setTgStatus({
        type: "success",
        text: data.message,
      });
    } catch (err: unknown) {
      setTgStatus({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Telegram-এ পাঠাতে এরর হয়েছে। Bot Token ও Chat ID চেক করুন।",
      });
    } finally {
      setIsSendingTg(false);
    }
  };

  const handleCopyCode = (file: PythonModuleFile) => {
    navigator.clipboard.writeText(file.code);
    setCopiedFileId(file.id);
    setTimeout(() => setCopiedFileId(null), 2000);
  };

  const handleDownloadSingleFile = (file: PythonModuleFile) => {
    const blob = new Blob([file.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllFilesScript = () => {
    // Creates a single self-extracting Python script `setup_project.py` that creates all folders and files automatically!
    const filesDict: Record<string, string> = {};
    for (const f of PYTHON_PROJECT_FILES) {
      filesDict[f.path] = f.code;
    }
    const installerCode = `"""
setup_project.py
----------------
এই ফাইলটি রান করলে আপনার কম্পিউটারে স্বয়ংক্রিয়ভাবে সব ফোল্ডার ও ৯টি ফাইল তৈরি হয়ে যাবে!
চালানোর নিয়ম: python setup_project.py
"""
import os
import json

FILES = ${JSON.stringify(filesDict, null, 2)}

def create_project():
    for filepath, content in FILES.items():
        dirpath = os.path.dirname(filepath)
        if dirpath:
            os.makedirs(dirpath, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Created: {filepath}")
    print("\\nসবগুলো ফাইল সফলভাবে তৈরি হয়েছে! এবার .env ফাইলে আপনার API Key বসিয়ে python main.py চালান।")

if __name__ == "__main__":
    create_project()
`;
    const blob = new Blob([installerCode], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "setup_project.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTroubleshoot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!errorInput.trim()) return;
    setIsFixingError(true);
    setTroubleshootError(null);
    setTroubleshootResult(null);

    try {
      const res = await fetch("/api/troubleshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errorLog: errorInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "এরর বিশ্লেষণ করা যায়নি।");
      }
      setTroubleshootResult(data);
    } catch (err: unknown) {
      setTroubleshootError(
        err instanceof Error ? err.message : "এরর বিশ্লেষণ করতে সমস্যা হয়েছে।"
      );
    } finally {
      setIsFixingError(false);
    }
  };

  const selectedFile =
    PYTHON_PROJECT_FILES.find((f) => f.id === selectedFileId) ||
    PYTHON_PROJECT_FILES[0];

  const filteredTop10 =
    selectedNicheFilter === "all"
      ? top10
      : top10.filter((item) =>
          item.niche.toLowerCase().includes(selectedNicheFilter.toLowerCase())
        );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("live");
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            Trend Monitor Agent
          </a>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#live"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("live");
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === "live"
                  ? "text-slate-900 underline underline-offset-8 decoration-2 decoration-sky-600"
                  : ""
              }`}
            >
              Live Agent
            </a>
            <a
              href="#code"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("code");
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === "code"
                  ? "text-slate-900 underline underline-offset-8 decoration-2 decoration-sky-600"
                  : ""
              }`}
            >
              Python Code
            </a>
            <a
              href="#guide"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("guide");
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === "guide"
                  ? "text-slate-900 underline underline-offset-8 decoration-2 decoration-sky-600"
                  : ""
              }`}
            >
              Setup & GitHub Guide
            </a>
            <a
              href="#troubleshoot"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("troubleshoot");
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === "troubleshoot"
                  ? "text-slate-900 underline underline-offset-8 decoration-2 decoration-sky-600"
                  : ""
              }`}
            >
              Error Fixer
            </a>
          </nav>

          {/* Zone 3: 1 primary action button */}
          <div className="flex items-center shrink-0">
            <button
              onClick={handleRunAgent}
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Collecting Trends...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Agent Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Section Switcher */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("live")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === "live"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Live Agent
        </button>
        <button
          onClick={() => setActiveTab("code")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === "code"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Python Code (9 Files)
        </button>
        <button
          onClick={() => setActiveTab("guide")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === "guide"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          সহজ বাংলা গাইড
        </button>
        <button
          onClick={() => setActiveTab("troubleshoot")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
            activeTab === "troubleshoot"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Error Fixer
        </button>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Hero / Overview Banner */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2">
                <span>Daily Schedule: সকাল ৮:০০ টা (BDT)</span>
                <span aria-hidden="true">·</span>
                <span>Regions: Bangladesh & Global</span>
                <span aria-hidden="true">·</span>
                <span>Output: সহজ বাংলা (Easy Bengali)</span>
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight font-display"
                style={{ textWrap: "balance" }}
              >
                স্বয়ংক্রিয় Daily Trend Monitor Agent — Python প্রজেক্ট ও লাইভ স্টুডিও
              </h1>
              <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                Google Trends (Bangladesh ও Worldwide), Hacker News API, Wikipedia
                Most-Viewed, এবং ৭টি জনপ্রিয় News RSS থেকে ট্রেন্ড সংগ্রহ করে{" "}
                <strong className="font-semibold text-slate-800">
                  Gemini API
                </strong>{" "}
                দিয়ে আপনার পছন্দের ৪টি নিশের সেরা ১০টি টপিক বাছাই ও ১ লাইনে বাংলা
                ব্যাখ্যা তৈরি করে। আগের দিন পাঠানো টপিক কখনো রিপিট করে না।
              </p>
            </div>

            {/* Interactive Mode Switcher Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setActiveTab("live")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "live"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>১. লাইভ টেস্ট ড্যাশবোর্ড</span>
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "code"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>২. সম্পূর্ণ Python কোড (৯টি ফাইল)</span>
              </button>
              <button
                onClick={() => setActiveTab("guide")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "guide"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>৩. চালানোর গাইড ও GitHub Actions</span>
              </button>
              <button
                onClick={() => setActiveTab("troubleshoot")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "troubleshoot"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>৪. Error Fixer (এরর সমাধান)</span>
              </button>
            </div>
          </div>

          {/* Configured Sources & Niches Summary Bar */}
          <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
            <div>
              <div className="font-semibold text-slate-900 mb-1">
                আপনার বাছাইকৃত ৪টি নিশ (Niches)
              </div>
              <div className="text-slate-600 leading-relaxed">
                AI, Tech & Startups · Business, Finance & Marketing · Science,
                Space & Future Tech · Content Creation & Social Media
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-900 mb-1">
                ৪টি ফ্রি অফিসিয়াল সোর্স (No Scraping)
              </div>
              <div className="text-slate-600 leading-relaxed">
                Google Trends RSS (BD + US) · Hacker News API · Wikipedia
                Most-Viewed API · 7 News RSS Feeds
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-900 mb-1">
                News RSS সাইটসমূহ
              </div>
              <div className="text-slate-600 leading-relaxed">
                TechCrunch · The Verge · BBC Tech · Prothom Alo · The Daily Star
                (BD) · Product Hunt · Ars Technica
              </div>
            </div>
            <div className="flex flex-col justify-between">
              <div>
                <div className="font-semibold text-slate-900 mb-1">
                  ডুপ্লিকেট রোধ মেমোরি (sent_topics.json)
                </div>
                <div className="text-slate-600 tabular-nums">
                  মনে রাখা পূর্ববর্তী টপিক: {historyCount} টি
                </div>
              </div>
              <div className="mt-2">
                <button
                  onClick={() => setShowHistoryModal(!showHistoryModal)}
                  className="text-sky-700 hover:underline font-medium cursor-pointer"
                >
                  {showHistoryModal
                    ? "হিস্ট্রি লিস্ট বন্ধ করুন"
                    : "পাঠানো টপিকের হিস্ট্রি দেখুন / রিসেট করুন"}
                </button>
              </div>
            </div>
          </div>

          {/* Expandable Sent Topics History Drawer */}
          {showHistoryModal && (
            <div className="mt-5 pt-5 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  আগের পাঠানো টপিকের তালিকা (এই টপিকগুলো আবার পাঠানো হবে না)
                </h3>
                <button
                  onClick={handleClearHistory}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>হিস্ট্রি রিসেট করুন</span>
                </button>
              </div>
              {historyItems.length === 0 ? (
                <p className="text-xs text-slate-500">
                  এখনো কোনো টপিক হিস্ট্রিতে নেই। এজেন্ট একবার রান করলেই আজকের ১০টি
                  টপিক এখানে জমা হবে।
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-200">
                  {historyItems.map((h, i) => (
                    <div
                      key={i}
                      className="px-4 py-2 text-xs flex items-center justify-between gap-4"
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {h.title}
                      </span>
                      <span className="text-slate-500 whitespace-nowrap shrink-0 tabular-nums">
                        {h.source} · {new Date(h.sentAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ===================================================================
            TAB 1: LIVE AGENT RUNNER & TELEGRAM PREVIEW
        =================================================================== */}
        {activeTab === "live" && (
          <div className="space-y-8">
            {/* Collection Stats Row (When Populated) */}
            {stats && (
              <section className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    লাইভ ডাটা কালেকশন ও ডুপ্লিকেট ফিল্টার রিপোর্ট
                  </h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    মোট সংগৃহীত: {stats.totalRawCount} টি · ডুপ্লিকেট বাদ: {stats.skippedDuplicatesCount} টি · নতুন টপিক: {stats.freshCandidatesCount} টি
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      Google Trends (BD + Global)
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                      {stats.googleTrendsCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      Hacker News Official API
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                      {stats.hackerNewsCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      Wikipedia Most-Viewed
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                      {stats.wikipediaCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      Tech & BD News RSS
                    </div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                      {stats.newsRssCount}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Error State */}
            {runError && (
              <div className="bg-white border border-red-300 rounded-xl p-6 text-sm text-red-700 flex items-center justify-between gap-4">
                <div>
                  <strong className="font-semibold">এজেন্ট রান করতে সমস্যা হয়েছে: </strong>
                  <span>{runError}</span>
                </div>
                <button
                  onClick={handleRunAgent}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  আবার চেষ্টা করুন
                </button>
              </div>
            )}

            {/* Loading State */}
            {isRunning && (
              <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
                <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">
                    ৪টি সোর্স থেকে লাইভ ট্রেন্ড সংগ্রহ এবং Gemini API দিয়ে বাছাই চলছে...
                  </h3>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto">
                    Google Trends (BD ও Global), Hacker News, Wikipedia এবং ৭টি News
                    RSS ফিড চেক করে আপনার নিশ অনুযায়ী সেরা ১০টি টপিক ও সহজ বাংলায় ১
                    লাইনের ব্যাখ্যা তৈরি করা হচ্ছে (১০-১৫ সেকেন্ড সময় লাগতে পারে)।
                  </p>
                </div>
              </section>
            )}

            {/* Empty / Zero State before running */}
            {!isRunning && top10.length === 0 && (
              <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-5">
                <div className="max-w-xl mx-auto space-y-2">
                  <h2 className="text-xl font-bold text-slate-900 font-display">
                    এখনই ব্রাউজারে লাইভ এজেন্টটি চালিয়ে দেখুন
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    নিচের বাটনে ক্লিক করলে এই মুহূর্তে বিশ্বজুড়ে ও বাংলাদেশে কী কী
                    ট্রেন্ডিং আছে তা সংগ্রহ করে Gemini API দিয়ে আপনার ৪টি নিশের সেরা
                    ১০টি টপিক সহজ বাংলায় তৈরি করে দেখাবে। পাশাপাশি সরাসরি{" "}
                    <strong className="font-semibold text-slate-800">
                      Python Code
                    </strong>{" "}
                    ট্যাব থেকে সবগুলো কোড ফাইল ডাউনলোড করতে পারবেন।
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={handleRunAgent}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Run Trend Monitor Now (লাইভ চালান)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("code")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <FileCode className="w-4 h-4" />
                    <span>Python ফাইলগুলো দেখুন</span>
                  </button>
                </div>
              </section>
            )}

            {/* Populated State: Top 10 Curated List + Telegram Preview Split */}
            {!isRunning && top10.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left 7 Columns: Curated Top 10 Topics */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">
                        আজকের বাছাইকৃত সেরা ১০টি ট্রেন্ডিং টপিক
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Gemini API দ্বারা আপনার ৪টি নিশের সাথে মিলিয়ে বাছাইকৃত এবং সহজ বাংলায় ব্যাখ্যাকৃত
                      </p>
                    </div>

                    {/* Interactive Filter Buttons */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                      {[
                        { key: "all", label: "সব (10)" },
                        { key: "AI", label: "AI & Tech" },
                        { key: "Business", label: "Business" },
                        { key: "Science", label: "Science" },
                        { key: "Content", label: "Creator" },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setSelectedNicheFilter(tab.key)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            selectedNicheFilter === tab.key
                              ? "bg-white text-slate-900 shadow-xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Unboxed Metadata List of Top 10 */}
                  <div className="divide-y divide-slate-200">
                    {filteredTop10.map((item) => (
                      <article
                        key={item.rank}
                        className="py-4 first:pt-0 last:pb-0 space-y-1.5"
                      >
                        {/* Quiet 1-line unboxed metadata with typographic separators */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                          <span className="font-mono font-semibold text-sky-700">
                            #{String(item.rank).padStart(2, "0")}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.niche}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.source}</span>
                        </div>

                        <h3 className="text-base font-semibold text-slate-900 leading-snug">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-sky-700 transition-colors inline-flex items-center gap-1.5"
                          >
                            <span>{item.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </a>
                        </h3>

                        <p className="text-sm text-slate-700 leading-relaxed">
                          <span className="font-semibold text-slate-900">
                            কেন ট্রেন্ডিং:{" "}
                          </span>
                          {item.why_trending_bn}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                {/* Right 5 Columns: Telegram Summary Preview & Direct Sender */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          Telegram মেসেজ প্রিভিউ
                        </h3>
                        <p className="text-xs text-slate-500">
                          প্রতিদিন সকাল ৮টায় ঠিক এভাবে আপনার টেলিগ্রামে যাবে
                        </p>
                      </div>
                      <button
                        onClick={handleCopyDigest}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedDigest ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre className="text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre-wrap font-sans max-h-[380px] overflow-y-auto">
                      {telegramPlain}
                    </pre>

                    {/* Direct Telegram Test Form */}
                    <form
                      onSubmit={handleSendTelegram}
                      className="pt-4 border-t border-slate-200 space-y-3"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        এখনই আপনার Telegram-এ পাঠিয়ে টেস্ট করুন (ঐচ্ছিক)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">
                            Telegram Bot Token
                          </label>
                          <input
                            type="password"
                            value={botToken}
                            onChange={(e) => setBotToken(e.target.value)}
                            placeholder="123456:ABC-DEF..."
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">
                            Telegram Chat ID
                          </label>
                          <input
                            type="text"
                            value={chatId}
                            onChange={(e) => setChatId(e.target.value)}
                            placeholder="e.g. 987654321"
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 font-mono"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={isSendingTg}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {isSendingTg
                            ? "Telegram-এ পাঠানো হচ্ছে..."
                            : "Send This Summary to My Telegram"}
                        </span>
                      </button>

                      {tgStatus && (
                        <div
                          className={`p-3 rounded-lg text-xs ${
                            tgStatus.type === "success"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-red-50 text-red-800 border border-red-200"
                          }`}
                        >
                          {tgStatus.text}
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 2: MODULAR PYTHON CODE & FOLDER STRUCTURE
        =================================================================== */}
        {activeTab === "code" && (
          <div className="space-y-8">
            {/* Folder Structure Card */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-sky-600" />
                    <span>১. প্রজেক্টের ফোল্ডার স্ট্রাকচার (Folder Structure)</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    আপনার নিয়ম অনুযায়ী পুরো এজেন্টটি একটি ফাইলে না লিখে পরিষ্কারভাবে আলাদা আলাদা মডিউলে ভাগ করা হয়েছে।
                  </p>
                </div>
                <button
                  onClick={handleDownloadAllFilesScript}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>সবগুলো ফাইল এক ক্লিকে ডাউনলোড করুন (setup_project.py)</span>
                </button>
              </div>

              <pre className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto leading-relaxed">
                {FOLDER_STRUCTURE_TEXT}
              </pre>
            </section>

            {/* File Explorer & Viewer */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-bold text-slate-900 font-display">
                  ২. প্রতিটি ফাইলের সম্পূর্ণ কোড (ক্লিক করে দেখুন ও কপি করুন)
                </h2>
                {/* Segmented File Selector */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg">
                  {PYTHON_PROJECT_FILES.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => setSelectedFileId(file.id)}
                      className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedFileId === file.id
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {file.path}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected File Info & Code Box */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-900">
                      {selectedFile.titleBn}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {selectedFile.purposeBn}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleCopyCode(selectedFile)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedFileId === selectedFile.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>কপি হয়েছে!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>কোড কপি করুন</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDownloadSingleFile(selectedFile)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{selectedFile.filename} ডাউনলোড</span>
                    </button>
                  </div>
                </div>

                <pre className="text-xs font-mono text-slate-100 bg-slate-900 rounded-lg p-5 overflow-x-auto leading-relaxed max-h-[540px] overflow-y-auto">
                  <code>{selectedFile.code}</code>
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================
            TAB 3: BEGINNER STEP-BY-STEP GUIDE & GITHUB ACTIONS 8 AM SCHEDULE
        =================================================================== */}
        {activeTab === "guide" && (
          <div className="space-y-8">
            {/* Step 1: Getting the 3 Free Keys */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  ধাপ ১: ৩টি ফ্রি চাবি (API Key ও Telegram Token) সংগ্রহ করার নিয়ম
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  কোডিং জানা লাগবে না—শুধু নিচের ৩টি জিনিস কপি করে একটি নোটপ্যাডে রাখুন:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="text-sm font-bold text-slate-900">
                    01. GEMINI_API_KEY (ফ্রি)
                  </div>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      <strong className="text-slate-800">Google AI Studio</strong>{" "}
                      (aistudio.google.com)-এ যান।
                    </li>
                    <li>
                      বাম পাশের মেনু থেকে <strong>Get API key</strong> বাটনে ক্লিক
                      করুন।
                    </li>
                    <li>
                      <strong>Create API key</strong> চাপুন এবং লম্বা কোডটি কপি করে
                      রাখুন।
                    </li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-bold text-slate-900">
                    02. TELEGRAM_BOT_TOKEN
                  </div>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Telegram অ্যাপে গিয়ে সার্চ বক্সে লিখুন{" "}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">
                        @BotFather
                      </code>{" "}
                      (নীল টিক দেওয়া ভেরিফাইড বট)।
                    </li>
                    <li>
                      তাকে মেসেজ পাঠান:{" "}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">
                        /newbot
                      </code>
                    </li>
                    <li>
                      বটের একটি নাম দিন (যেমন: <code>My Trend Agent</code>) এবং শেষে{" "}
                      <code>bot</code> সহ ইউজারনেম দিন (যেমন:{" "}
                      <code>mahin_trend_bot</code>)।
                    </li>
                    <li>
                      BotFather আপনাকে একটি HTTP API Token দেবে। ওটি কপি করুন এবং{" "}
                      <strong>নিজের নতুন বটটিতে ঢুকে একবার Start বাটন চাপুন!</strong>
                    </li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-bold text-slate-900">
                    03. TELEGRAM_CHAT_ID
                  </div>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Telegram-এ সার্চ করুন{" "}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">
                        @userinfobot
                      </code>
                    </li>
                    <li>
                      বটটিতে ঢুকে <strong>Start</strong> চাপলেই সে আপনার{" "}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">
                        Id
                      </code>{" "}
                      (একটি সংখ্যা, যেমন <code>123456789</code>) দেখিয়ে দেবে।
                    </li>
                    <li>এই সংখ্যাটিই আপনার Chat ID। এটি কপি করে রাখুন।</li>
                  </ol>
                </div>
              </div>
            </section>

            {/* Step 2: Running on your own computer */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-5">
              <div className="border-b border-slate-200 pb-4">
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  ধাপ ২: নিজের কম্পিউটারে চালানোর সহজ নিয়ম (ঐচ্ছিক)
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  আপনি যদি সরাসরি GitHub Actions-এ চালাতে চান, তবে কম্পিউটারে পাইথন ইনস্টল না করলেও চলবে (নিচের ধাপ ৩ দেখুন)। আর পিসিতে টেস্ট করতে চাইলে এই ৪টি ধাপ অনুসরণ করুন:
                </p>
              </div>

              <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                <p>
                  <strong>১.</strong> কম্পিউটারে একটি নতুন ফোল্ডার খুলুন (যেমন{" "}
                  <code>trend-agent</code>) এবং আমাদের <strong>Python Code</strong>{" "}
                  ট্যাব থেকে <code>setup_project.py</code> ফাইলটি ডাউনলোড করে ওই
                  ফোল্ডারে রাখুন।
                </p>
                <p>
                  <strong>২.</strong> ওই ফোল্ডারে Terminal বা Command Prompt খুলে
                  নিচের কমান্ডগুলো পরপর পেস্ট করে Enter চাপুন:
                </p>
                <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                  {`# ১. সব ফাইল অটোমেটিক তৈরি করুন
python setup_project.py

# ২. দরকারি ৪টি লাইব্রেরি ইনস্টল করুন
pip install -r requirements.txt`}
                </pre>
                <p>
                  <strong>৩.</strong> এবার ফোল্ডারের ভেতরে থাকা{" "}
                  <code>.env.example</code> ফাইলটির নাম বদলে শুধু{" "}
                  <code>.env</code> রাখুন এবং Notepad দিয়ে খুলে আপনার ৩টি চাবি বসান:
                </p>
                <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                  {`GEMINI_API_KEY="আপনার_জেমিনি_কী_এখানে"
TELEGRAM_BOT_TOKEN="আপনার_টেলিগ্রাম_বট_টোকেন_এখানে"
TELEGRAM_CHAT_ID="আপনার_চ্যাট_আইডি_এখানে"`}
                </pre>
                <p>
                  <strong>৪.</strong> এবার এজেন্ট চালু করতে লিখুন:
                </p>
                <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                  {`python main.py`}
                </pre>
                <p className="text-xs text-slate-500">
                  ব্যস! ১০-১৫ সেকেন্ডের মধ্যে আপনার টেলিগ্রামে আজকের সেরা ১০টি ট্রেন্ডের বাংলা সামারি চলে যাবে!
                </p>
              </div>
            </section>

            {/* Step 3: GitHub Actions Daily 8:00 AM Schedule */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-5">
              <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 font-display flex items-center gap-2">
                    <Clock className="w-5 h-5 text-sky-600" />
                    <span>
                      ধাপ ৩: GitHub Actions দিয়ে রোজ সকাল ৮টায় অটোমেটিক চালানোর গাইড
                    </span>
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    এটি সেটআপ করলে আপনার কম্পিউটার বা মোবাইল বন্ধ থাকলেও রোজ সকাল ৮:০০ টায় (বাংলাদেশ সময়) মেসেজ চলে আসবে—১০০% ফ্রিতে!
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                <div>
                  <h3 className="font-bold text-slate-900">
                    স্টেপ A: GitHub-এ নতুন Repository খুলুন ও ফাইল আপলোড করুন
                  </h3>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside mt-1">
                    <li>
                      <strong>github.com</strong>-এ লগইন করে উপরের ডান কোণায়{" "}
                      <strong>+</strong> আইকনে ক্লিক করে{" "}
                      <strong>New repository</strong> সিলেক্ট করুন।
                    </li>
                    <li>
                      নাম দিন <code>trend-monitor-agent</code>,{" "}
                      <strong>Private</strong> বা <strong>Public</strong> সিলেক্ট করে{" "}
                      <strong>Create repository</strong> চাপুন।
                    </li>
                    <li>
                      <strong>uploading an existing file</strong>-এ ক্লিক করে আমাদের{" "}
                      <strong>Python Code</strong> ট্যাবে দেওয়া ফাইলগুলো (
                      <code>config.py</code>, <code>collectors.py</code>,{" "}
                      <code>history_manager.py</code>, <code>gemini_filter.py</code>,{" "}
                      <code>telegram_sender.py</code>, <code>main.py</code>,{" "}
                      <code>requirements.txt</code>, এবং{" "}
                      <code>.github/workflows/daily_trends.yml</code>) আপলোড করে{" "}
                      <strong>Commit changes</strong> দিন।{" "}
                      <em>(সতর্কতা: কখনোই আপনার আসল .env ফাইল আপলোড করবেন না!)</em>
                    </li>
                  </ol>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    স্টেপ B: GitHub Secrets-এ আপনার ৩টি গোপন কী লুকিয়ে রাখুন
                  </h3>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside mt-1">
                    <li>
                      আপনার GitHub Repository-এর উপরের মেনু থেকে{" "}
                      <strong>Settings</strong> ট্যাবে যান।
                    </li>
                    <li>
                      বাম পাশের মেনুতে নিচে{" "}
                      <strong>Secrets and variables &rarr; Actions</strong>-এ ক্লিক
                      করুন।
                    </li>
                    <li>
                      সবুজ <strong>New repository secret</strong> বাটনে ক্লিক করে একে
                      একে নিচের ৩টি Secret যোগ করুন:
                      <ul className="list-disc list-inside ml-5 mt-1 space-y-1 font-mono text-slate-800">
                        <li>
                          Name: <strong>GEMINI_API_KEY</strong> &rarr; Secret: আপনার
                          জেমিনি API কী
                        </li>
                        <li>
                          Name: <strong>TELEGRAM_BOT_TOKEN</strong> &rarr; Secret:
                          আপনার টেলিগ্রাম বট টোকেন
                        </li>
                        <li>
                          Name: <strong>TELEGRAM_CHAT_ID</strong> &rarr; Secret:
                          আপনার টেলিগ্রাম চ্যাট আইডি
                        </li>
                      </ul>
                    </li>
                  </ol>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    স্টেপ C: Workflow Permission অন করুন এবং ১ ক্লিকে টেস্ট করুন
                  </h3>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside mt-1">
                    <li>
                      <strong>Settings &rarr; Actions &rarr; General</strong>-এ যান এবং নিচে{" "}
                      <strong>Workflow permissions</strong> অংশে{" "}
                      <strong>Read and write permissions</strong> সিলেক্ট করে Save দিন
                      (যাতে এজেন্ট রোজ <code>sent_topics.json</code> ফাইলটি সেভ করতে
                      পারে এবং আগের দিনের টপিক রিপিট না করে)।
                    </li>
                    <li>
                      এবার উপরের <strong>Actions</strong> ট্যাবে যান, বাম পাশে{" "}
                      <strong>Daily Trend Monitor Agent (8 AM BDT)</strong>-এ ক্লিক
                      করে ডান পাশের <strong>Run workflow</strong> বাটন চাপুন!
                    </li>
                    <li>
                      মাত্র ৩০ সেকেন্ডের মধ্যে আপনার টেলিগ্রামে মেসেজ চলে আসবে এবং এরপর
                      থেকে প্রতিদিন সকাল ৮:০০ টায় (`cron: '0 2 * * *'` UTC) নিজে
                      নিজেই চলবে।
                    </li>
                  </ol>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================
            TAB 4: PASTE-YOUR-ERROR TROUBLESHOOTER
        =================================================================== */}
        {activeTab === "troubleshoot" && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-xl font-bold text-slate-900 font-display">
                Error Fixer — যেকোনো এরর হুবহু পেস্ট করুন, সহজ বাংলায় সমাধান পান
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                আপনার কম্পিউটারে বা GitHub Actions-এ চালাতে গিয়ে যদি কোনো লাল রঙের Error আসে, সেটি নিচে পেস্ট করে বাটনে ক্লিক করুন:
              </p>
            </div>

            {/* Quick Sample Error Buttons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">সাধারণ এরর উদাহরণ:</span>
              <button
                type="button"
                onClick={() =>
                  setErrorInput(
                    "ModuleNotFoundError: No module named 'feedparser'"
                  )
                }
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-mono cursor-pointer"
              >
                ModuleNotFoundError: feedparser
              </button>
              <button
                type="button"
                onClick={() =>
                  setErrorInput(
                    'RuntimeError: Telegram API Error (400): {"ok":false,"error_code":400,"description":"Bad Request: chat not found"}'
                  )
                }
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-mono cursor-pointer"
              >
                Telegram 400: chat not found
              </button>
              <button
                type="button"
                onClick={() =>
                  setErrorInput(
                    "ValueError: GEMINI_API_KEY is missing! Please set it in your .env file or GitHub Secrets."
                  )
                }
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-mono cursor-pointer"
              >
                GEMINI_API_KEY missing
              </button>
            </div>

            <form onSubmit={handleTroubleshoot} className="space-y-4">
              <textarea
                rows={5}
                value={errorInput}
                onChange={(e) => setErrorInput(e.target.value)}
                placeholder="আপনার Terminal বা GitHub Actions-এর Error মেসেজটি এখানে হুবহু পেস্ট করুন..."
                className="w-full p-4 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
              <button
                type="submit"
                disabled={isFixingError || !errorInput.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
                <span>
                  {isFixingError
                    ? "এরর বিশ্লেষণ করা হচ্ছে..."
                    : "এররটির সহজ বাংলা সমাধান দেখুন"}
                </span>
              </button>
            </form>

            {troubleshootError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {troubleshootError}
              </div>
            )}

            {troubleshootResult && (
              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    কেন এই এররটি হয়েছে:
                  </h3>
                  <p className="text-sm text-slate-700 mt-1">
                    {troubleshootResult.causeBn}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    কীভাবে ঠিক করবেন (ধাপে ধাপে):
                  </h3>
                  <ol className="text-sm text-slate-700 list-decimal list-inside space-y-1.5 mt-1">
                    {troubleshootResult.stepsBn.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>

                {troubleshootResult.fixedSnippet && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1.5">
                      প্রয়োজনীয় কমান্ড / কোড:
                    </h3>
                    <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                      {troubleshootResult.fixedSnippet}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Clean Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            Daily Trend Monitor Agent · Official Public Feeds & Gemini API
          </span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("code")}
              className="hover:text-slate-900 cursor-pointer"
            >
              Python Modules
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveTab("guide")}
              className="hover:text-slate-900 cursor-pointer"
            >
              GitHub Actions Setup
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveTab("troubleshoot")}
              className="hover:text-slate-900 cursor-pointer"
            >
              Error Fixer
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
