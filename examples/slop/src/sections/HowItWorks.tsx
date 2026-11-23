const steps = [
  { title: 'Sign Up 📝', text: 'Create your account in seconds. No credit card required!' },
  { title: 'Connect Your Tools 🔌', text: 'Seamlessly integrate with 500+ apps and services you already love.' },
  { title: 'Let AI Do the Magic ✨', text: 'Sit back and watch as our AI transforms your workflow. It really is that simple.' },
];

export function HowItWorks() {
  return (
    <section id="platform" className="px-6 py-24">
      <h2 className="text-center font-mono text-4xl font-bold tracking-tight">How It Works 🛠️</h2>
      <p className="mt-3 text-center text-gray-400">Getting started is as easy as 1-2-3!</p>
      <ol className="mx-auto mt-14 flex max-w-5xl items-start justify-between gap-6">
        {steps.map((step, i) => (
          <li key={step.title} className="flex-1 rounded-3xl bg-linear-to-br from-indigo-50 to-pink-50 p-8">
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">Step {Math.min(i + 1, 2)}</span>
            <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
            <p className="mt-2 text-gray-500">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
