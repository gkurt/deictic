const features = [
  {
    icon: '🧠',
    title: 'AI-Powered Insights',
    text: 'Leverage the power of AI to unlock actionable insights and make data-driven decisions with confidence.',
  },
  {
    icon: '🔗',
    title: 'Seamless Integration',
    text: 'Seamlessly integrate with your existing tools to unlock a seamless workflow that just works, seamlessly.',
  },
  {
    icon: '⚡',
    title: 'Lightning Fast ⚡',
    text: 'Experience blazing-fast performance that empowers your team to move at the speed of innovation.',
  },
  {
    icon: '🔒',
    title: 'Enterprise-Grade Security',
    text: 'Rest easy knowing your data is protected by bank-grade, military-grade, enterprise-grade encryption.',
  },
  {
    icon: '🤝',
    title: 'Real-Time Collaboration',
    text: 'Empower your team to collaborate in real time, fostering synergy and driving transformative outcomes.',
  },
  {
    icon: '♾️',
    title: 'Infinite Scalability',
    text: 'Scale effortlessly from startup to enterprise with a platform built for the future of work. And beyond.',
  },
];

function FeatureCard({ icon, title, text, index }: { icon: string; title: string; text: string; index: number }) {
  return (
    <div
      className={
        index === 2
          ? 'rounded-none border-4 border-yellow-300 bg-yellow-50 p-10 text-left'
          : 'rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-xl shadow-purple-500/10 transition duration-500 hover:-rotate-1 hover:scale-110'
      }
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-purple-500 to-blue-500 text-2xl shadow-lg">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-gray-400">{text}</p>
      <a href="#" className="mt-4 inline-block text-sm font-semibold text-purple-600">
        Learn more →
      </a>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="bg-linear-to-b from-white to-purple-50 px-6 py-24">
      <h2 className="text-center font-serif text-5xl font-bold">
        Why Choose <span className="bg-linear-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">Synergify</span>? 🤔
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-center text-gray-400">
        Discover the features that make Synergify the ultimate all-in-one solution for modern teams.
      </p>
      <div className="mx-auto mt-16 grid max-w-6xl grid-cols-3 gap-8">
        {features.map((feature, i) => (
          <FeatureCard key={feature.title} {...feature} index={i} />
        ))}
      </div>
    </section>
  );
}
