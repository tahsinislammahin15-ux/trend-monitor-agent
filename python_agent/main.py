"""
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
    print("\n--- Telegram Message Preview ---\n")
    print(telegram_message)
    print("\n--------------------------------\n")

    send_to_telegram(telegram_message)

    # Step 5: Save today's sent topics so tomorrow will never repeat them
    save_sent_topics(top_10_trends)
    print("All done! Agent finished successfully.")


if __name__ == "__main__":
    main()
