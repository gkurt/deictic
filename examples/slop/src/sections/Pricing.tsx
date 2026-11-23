import { useState } from 'react';

const plans = [
  {
    name: 'Starter',
    price: 0,
    blurb: 'Perfect for individuals getting started on their AI journey.',
    features: ['✅ 1 user', '✅ Basic AI', '❌ Integrations', '❌ Support'],
  },
  {
    name: 'Pro',
    price: 49,
    blurb: 'For growing teams ready to supercharge their productivity.',
    features: ['✅ 10 users', '✅ Advanced AI 🧠', '✅ 500+ integrations', '✅ Priority support', '✅ Analytics', '✅ API access'],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 199,
    blurb: 'Unlock the full power of Synergify at scale.',
    features: ['✅ Unlimited users', '✅ Everything in Pro', '✔️ SSO', '✓ Dedicated CSM'],
  },
  {
    name: 'Ultimate',
    price: 999,
    blurb: 'Everything in Enterprise, plus even more AI.',
    features: ['✅ Everything', '✅ More AI ✨'],
  },
];

export function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="pricing" className="px-6 py-24">
      <h2 className="text-center text-5xl font-black tracking-tight">Simple, Transparent Pricing 💰</h2>
      <p className="mt-3 text-center text-gray-400">Choose the plan that&apos;s right for you. Upgrade, downgrade or cancel anytime!</p>
      <div className="mt-8 flex items-center justify-center gap-3 text-sm">
        <span className={yearly ? 'text-gray-400' : 'font-bold'}>Monthly</span>
        <button
          type="button"
          aria-label="Bill yearly"
          onClick={() => setYearly(!yearly)}
          className={`relative h-6 w-11 rounded-full transition ${yearly ? 'bg-purple-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${yearly ? 'left-5.5' : 'left-0.5'}`} />
        </button>
        <span className={yearly ? 'font-bold' : 'text-gray-400'}>Yearly</span>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">SAVE 20%! 🎉</span>
      </div>
      <div className="mx-auto mt-14 grid max-w-7xl grid-cols-4 items-start gap-5">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={
              plan.popular
                ? 'relative scale-110 rounded-3xl bg-linear-to-br from-purple-600 to-blue-600 p-8 text-white shadow-2xl shadow-purple-500/50'
                : 'rounded-xl border border-gray-200 p-6'
            }
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 animate-bounce rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black whitespace-nowrap">
                🔥 MOST POPULAR 🔥
              </span>
            )}
            <h3 className="text-xl font-bold">{plan.name}</h3>
            <p className={plan.popular ? 'mt-1 text-sm text-purple-200' : 'mt-1 text-sm text-gray-400'}>{plan.blurb}</p>
            <div className="mt-6 text-5xl font-black">
              ${plan.price}
              <span className="text-base font-normal">/mo</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              type="button"
              className={
                plan.popular
                  ? 'mt-8 w-full rounded-full bg-white py-3 font-bold text-purple-700'
                  : 'mt-8 w-full rounded border border-gray-300 py-2 text-sm'
              }
            >
              {plan.price === 0 ? 'Start Now' : plan.popular ? 'Get Started 🚀' : 'Try it free'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
