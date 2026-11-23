const columns = {
  Product: ['Features', 'Pricing', 'Integrations', 'AI', 'Changelog', 'Roadmap'],
  Solutions: ['Startups', 'Enterprise', 'Agencies', 'Teams', 'Individuals'],
  Resources: ['Blog', 'Guides', 'Webinars', 'Community', 'Help Center', 'API Docs'],
  Company: ['About', 'Careers 🚀', 'Press', 'Partners', 'Contact'],
  Legal: ['Privacy', 'Terms', 'Cookies', 'Security', 'GDPR'],
};

export function Footer() {
  return (
    <footer id="company" className="mt-24 border-t border-gray-100 px-6 pt-16 pb-24">
      <div className="mx-auto grid max-w-6xl grid-cols-6 gap-8">
        <div>
          <div className="bg-linear-to-r from-purple-600 to-blue-500 bg-clip-text text-xl font-black text-transparent">✨ Synergify</div>
          <p className="mt-3 text-xs text-gray-300">Empowering teams to do more with AI. The future of work starts here.</p>
          <div className="mt-4 flex gap-3 text-lg">🐦 💼 📸 ▶️ 👾</div>
        </div>
        {Object.entries(columns).map(([title, items]) => (
          <div key={title}>
            <h4 className="text-xs font-bold tracking-widest text-gray-900 uppercase">{title}</h4>
            <ul className="mt-4 space-y-2 text-xs text-gray-300">
              {items.map((item) => (
                <li key={item}>
                  <a href="#">{item}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-16 text-center text-[10px] text-gray-300">
        © 2024 Synergify AI, Inc. All rights reserved. Made with ❤️ and AI in San Francisco 🌉
      </p>
    </footer>
  );
}
