const testimonials = [
  {
    name: 'Sarah J.',
    role: 'CEO at TechCorp',
    quote: 'Synergify completely transformed our workflow! Game-changer. 10/10 would recommend 🙌',
  },
  {
    name: 'Michael T.',
    role: 'VP of Innovation',
    quote:
      "I was skeptical at first, but after using Synergify for just one week, our team's productivity skyrocketed by 300%. The AI-powered insights are truly next-level, and the seamless integrations meant we were up and running in minutes, not months. Honestly I can't imagine going back to the way we worked before. Our investors are thrilled, our customers are thrilled, and I'm thrilled. If you're on the fence, just do it. You won't regret it. Trust me. 🚀🚀🚀",
  },
  {
    name: 'Emily R.',
    role: 'Founder & Visionary',
    quote: 'Absolutely love it!!',
  },
];

function Testimonial({ name, role, quote }: { name: string; role: string; quote: string }) {
  return (
    <figure className="rounded-2xl border border-purple-100 bg-white/70 p-6 shadow-lg backdrop-blur">
      <div className="text-yellow-400">★★★★★</div>
      <blockquote className="mt-3 text-gray-600 italic">&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-pink-500 font-bold text-white">
          {name[0]}
        </div>
        <div>
          <div className="font-semibold">{name}</div>
          <div className="text-xs text-gray-400">{role}</div>
        </div>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  return (
    <section className="bg-purple-50 px-6 py-24">
      <h2 className="text-center text-4xl font-extrabold">Loved by Thousands ❤️</h2>
      <p className="mt-3 text-center text-gray-400">Don&apos;t just take our word for it — hear from our amazing customers!</p>
      <div className="mx-auto mt-14 grid max-w-6xl grid-cols-3 items-start gap-6">
        {testimonials.map((testimonial) => (
          <Testimonial key={testimonial.name} {...testimonial} />
        ))}
      </div>
    </section>
  );
}
