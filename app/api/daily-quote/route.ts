import { NextResponse } from 'next/server';

interface QuoteData {
  quote: string;
  author: string;
  date: string; // YYYY-MM-DD
}

// In-memory cache keyed by date string
let cache: QuoteData | null = null;

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

const fallbackQuotes = [
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { quote: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { quote: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { quote: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
];

function getDailyFallback(dateKey: string): { quote: string; author: string } {
  // Hash the date string to pick a consistent quote
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return fallbackQuotes[hash % fallbackQuotes.length];
}

export async function GET(): Promise<NextResponse> {
  const today = getTodayKey();

  // Return cached quote if it's still for today
  if (cache && cache.date === today) {
    return NextResponse.json({ success: true, data: cache, cached: true });
  }

  // Try ZenQuotes (free, no key needed, one request per IP per hour — server-side so shared IP)
  try {
    const res = await fetch('https://zenquotes.io/api/today', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 }, // Next.js cache for 1 hour as backup
    });

    if (res.ok) {
      const data = await res.json();
      // ZenQuotes returns [{ q: "quote", a: "author", ... }]
      if (Array.isArray(data) && data.length > 0 && data[0].q && data[0].a) {
        const fresh: QuoteData = {
          quote: data[0].q,
          author: data[0].a,
          date: today,
        };
        cache = fresh;
        return NextResponse.json({ success: true, data: fresh, cached: false });
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: pick a quote deterministically from today's date
  const fallback = getDailyFallback(today);
  const result: QuoteData = {
    quote: fallback.quote,
    author: fallback.author,
    date: today,
  };
  // Cache even the fallback so we don't hammer zenquotes on every request
  cache = result;

  return NextResponse.json({ success: true, data: result, cached: false, fallback: true });
}
