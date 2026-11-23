import { useEffect, useState } from 'react';

export function CookieBanner() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-6 bg-gray-900/95 px-8 py-5 text-sm text-gray-300">
      <p>
        🍪 We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic. By clicking
        &ldquo;Accept All&rdquo;, you consent to our use of cookies.{' '}
        <a href="#" className="underline">
          Cookie Policy
        </a>
      </p>
      <div className="flex shrink-0 items-center gap-4">
        <button type="button" onClick={() => setShown(false)} className="text-[10px] text-gray-600">
          Reject
        </button>
        <button
          type="button"
          onClick={() => setShown(false)}
          className="rounded-full bg-linear-to-r from-purple-600 to-blue-500 px-8 py-3 font-bold text-white"
        >
          Accept All 🍪
        </button>
      </div>
    </div>
  );
}

export function ChatBubble() {
  return (
    <div className="fixed right-6 bottom-6 z-[60] flex items-end gap-3">
      <div className="rounded-2xl rounded-br-none bg-white px-4 py-3 text-sm shadow-2xl">
        👋 Hi there! Need help? Chat with our AI assistant!
      </div>
      <button
        type="button"
        aria-label="Chat"
        className="flex h-14 w-14 animate-bounce items-center justify-center rounded-full bg-linear-to-br from-purple-600 to-pink-500 text-2xl shadow-xl"
      >
        💬
      </button>
    </div>
  );
}

const SEEN = 'synergify:popup';

export function NewsletterPopup() {
  const [shown, setShown] = useState(false);
  // The popup's timer: it comes 8 seconds in, once per tab.
  useEffect(() => {
    if (sessionStorage.getItem(SEEN) !== null) return undefined;
    const timer = setTimeout(() => {
      sessionStorage.setItem(SEEN, '1');
      setShown(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[440px] rounded-3xl bg-white p-10 text-center shadow-2xl">
        <button type="button" onClick={() => setShown(false)} className="absolute top-2 right-3 text-xs text-gray-300">
          ✕
        </button>
        <div className="text-5xl">🎁</div>
        <h2 className="mt-4 text-3xl font-black">Wait! Don&apos;t Miss Out!</h2>
        <p className="mt-2 text-gray-500">
          Get <b>50% OFF</b> your first 3 months + our free eBook &ldquo;The Ultimate Guide to AI-Powered Synergy&rdquo;
        </p>
        <input placeholder="Your best email" className="mt-6 w-full rounded-full border px-5 py-3" />
        <button type="button" className="mt-3 w-full rounded-full bg-linear-to-r from-orange-500 to-pink-500 py-3 font-bold text-white">
          YES! Give Me 50% Off 🎉
        </button>
        <button type="button" onClick={() => setShown(false)} className="mt-3 text-xs text-gray-400 underline">
          No thanks, I don&apos;t like saving money
        </button>
      </div>
    </div>
  );
}
