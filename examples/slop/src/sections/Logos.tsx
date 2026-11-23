const logos = ['Acme Inc', 'LOGOIPSUM', 'YourBrand', 'Company', 'Placeholder Co.', 'Logo'];

export function Logos() {
  return (
    <section className="py-10">
      <p className="text-center text-sm text-gray-400">Trusted by 10,000+ innovative teams worldwide 🌍</p>
      <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-around gap-6 opacity-30 grayscale">
        {logos.map((logo, i) => (
          <span key={logo} className={i % 2 === 1 ? 'font-serif text-xl italic' : 'font-mono text-2xl font-black'}>
            {logo}
          </span>
        ))}
      </div>
    </section>
  );
}
