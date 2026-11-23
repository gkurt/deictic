const links = ['Features', 'Solutions', 'Platform', 'AI', 'Resources', 'Pricing', 'Enterprise', 'Company', 'Blog', 'Careers'];

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-purple-500/30 bg-white/60 px-6 py-3 shadow-[0_0_30px_rgba(168,85,247,0.35)] backdrop-blur-xl">
      <a href="#" className="bg-linear-to-r from-purple-600 to-blue-500 bg-clip-text text-2xl font-black text-transparent">
        ✨ Synergify<span className="text-xs align-super">AI™</span>
      </a>
      <ul className="flex gap-7 text-[13px] whitespace-nowrap text-gray-500">
        {links.map((link, i) => (
          <li key={link} className={i === 3 ? 'mt-1.5 font-bold text-purple-600' : ''}>
            <a href={`#${link.toLowerCase()}`}>
              {link}
              {i === 3 && ' 🔥'}
            </a>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <a href="#" className="px-3 text-sm text-gray-400">
          Log in
        </a>
        <button
          type="button"
          className="rounded-full bg-linear-to-r from-purple-600 to-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/50 transition hover:scale-110"
        >
          Get Started Free 🚀
        </button>
      </div>
    </nav>
  );
}
