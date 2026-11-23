import { useState } from 'react';

export function Cta() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  const subscribe = async () => {
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as unknown;
      if (typeof data === 'object' && data !== null && 'message' in data) setStatus(String(data.message));
    } catch (error) {
      console.error('Subscription failed:', error instanceof Error ? error.cause : error);
      setStatus('Oops! Something went wrong. Please try again later! 😅');
    }
  };

  return (
    <section className="relative mx-6 overflow-hidden rounded-[40px] bg-linear-to-br from-purple-700 via-fuchsia-600 to-blue-600 px-6 py-24 text-center text-white">
      <div className="absolute -top-10 left-10 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
      <h2 className="relative text-5xl font-black">Ready to Transform Your Business? 🚀</h2>
      <p className="relative mx-auto mt-4 max-w-xl text-purple-200">
        Join thousands of forward-thinking teams who are already leveraging the power of AI to unlock unprecedented growth.
      </p>
      <form
        className="relative mx-auto mt-10 flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void subscribe();
        }}
      >
        <input
          type="text"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Enter your email..."
          className="flex-1 rounded-full border border-white/30 bg-white/10 px-5 py-3 text-white placeholder-white/40"
        />
        <button type="submit" className="rounded-full bg-white px-6 py-3 font-bold text-purple-700 shadow-xl">
          Get Started
        </button>
      </form>
      {status && <p className="relative mt-4 text-sm text-yellow-200">{status}</p>}
    </section>
  );
}
