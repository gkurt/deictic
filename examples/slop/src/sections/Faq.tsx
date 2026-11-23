import { useState } from 'react';

const questions = [
  {
    q: 'What is Synergify?',
    a: "Synergify is an AI-powered platform that leverages cutting-edge technology to revolutionize the way you work. It's not just a tool — it's a paradigm shift.",
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely! Security is our top priority. We use bank-grade encryption and industry-leading best practices to keep your data safe and secure.',
  },
  {
    q: 'Can I cancel anytime?',
    a: "Great question! Yes, you can cancel anytime. We believe in earning your business every day. That said, we're confident you'll love Synergify! 😊",
  },
  {
    q: 'How does the AI work?',
    a: 'Our proprietary AI uses advanced machine learning algorithms and neural networks to deliver intelligent, actionable insights tailored to your unique needs.',
  },
  {
    q: 'Do you offer support?',
    a: "Of course! Our world-class support team is available 24/7/365 to help you succeed. We're here for you every step of the way. 💜",
  },
];

export function Faq() {
  const [open, setOpen] = useState(false);
  return (
    <section id="resources" className="px-6 py-24">
      <h2 className="text-center text-4xl font-bold">Frequently Asked Questions 🙋</h2>
      <div className="mx-auto mt-12 max-w-2xl divide-y divide-purple-100 rounded-2xl border border-purple-100">
        {questions.map(({ q, a }) => (
          <div key={q} className="p-5">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full justify-between text-left font-semibold">
              {q}
              <span className="text-purple-500">{open ? '−' : '+'}</span>
            </button>
            {open && <p className="mt-3 text-sm text-gray-400">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
