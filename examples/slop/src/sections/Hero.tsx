export function Hero() {
  return (
    <section className="relative px-6 pt-24 pb-32 text-center">
      <div className="absolute -top-20 -left-20 h-96 w-96 rounded-full bg-purple-400 opacity-40 blur-3xl" />
      <div className="absolute top-40 -right-32 h-[500px] w-[500px] rounded-full bg-blue-400 opacity-40 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-pink-400 opacity-30 blur-3xl" />

      <span className="relative inline-block rounded-full border border-purple-300 bg-purple-50 px-4 py-1 text-xs font-medium text-purple-700">
        ✨ Powered by Next-Gen Generative AI ✨
      </span>
      <h1 className="relative mt-6 animate-shimmer bg-linear-to-r from-purple-600 via-pink-500 to-blue-600 bg-size-[200%_auto] bg-clip-text text-7xl leading-none font-extrabold tracking-tighter text-transparent">
        Revolutionize Your Workflow with AI-Powered Synergy
      </h1>
      <p className="relative mx-auto mt-6 text-xl text-gray-300">
        In today&apos;s fast-paced digital landscape, Synergify empowers forward-thinking teams to seamlessly unlock their full potential —
        leveraging cutting-edge artificial intelligence to supercharge productivity, streamline collaboration, and drive truly
        transformative results at scale. It&apos;s not just a tool — it&apos;s a paradigm shift. 🚀
      </p>
      <div className="relative mt-10 flex justify-center gap-3">
        <button
          type="button"
          className="rounded-full bg-linear-to-r from-purple-600 to-blue-500 px-8 py-4 font-bold text-white shadow-2xl shadow-purple-500/50 transition hover:scale-110"
        >
          Start Your Free Trial 🚀
        </button>
        <button type="button" className="rounded-md border-2 border-gray-900 px-6 py-3 text-sm font-medium">
          Book a Demo
        </button>
        <button type="button" className="rounded-xl bg-gray-100 px-7 py-[18px] text-gray-600 italic">
          ▶ Watch Video (2 min)
        </button>
      </div>
      <p className="relative mt-4 text-[10px] text-gray-300">
        No credit card required • Cancel anytime • 14-day free trial • SOC 2 Type II • GDPR • HIPAA • ISO 27001 • AI-ready
      </p>

      <div className="relative mx-auto mt-20 max-w-5xl animate-float rounded-3xl border border-white/40 bg-white/30 p-3 shadow-[0_30px_120px_rgba(124,58,237,0.6)] backdrop-blur-2xl">
        <div className="flex h-[420px] items-center justify-center rounded-2xl bg-linear-to-br from-purple-200 via-pink-100 to-blue-200">
          <span className="text-2xl font-semibold text-purple-400">[Dashboard Preview]</span>
        </div>
      </div>
    </section>
  );
}
