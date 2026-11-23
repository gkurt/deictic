const stats = [
  { value: '10x', label: 'Faster Workflows' },
  { value: '99.999%', label: 'Uptime Guaranteed*' },
  { value: '500%+', label: 'Average ROI' },
  { value: '∞', label: 'Possibilities' },
];

export function Stats() {
  return (
    <section className="bg-gray-950 px-6 py-20">
      <div className="mx-auto grid max-w-5xl grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="bg-linear-to-r from-cyan-400 to-fuchsia-500 bg-clip-text text-6xl font-black text-transparent">
              {stat.value}
            </div>
            <div className="mt-2 text-xs tracking-widest text-gray-700 uppercase">{stat.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-10 text-center text-[9px] text-gray-800">
        *Based on internal estimates. Results may vary. Not a guarantee of uptime.
      </p>
    </section>
  );
}
