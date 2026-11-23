import { Announcement } from './sections/Announcement.tsx';
import { Cta } from './sections/Cta.tsx';
import { Faq } from './sections/Faq.tsx';
import { Features } from './sections/Features.tsx';
import { Footer } from './sections/Footer.tsx';
import { Hero } from './sections/Hero.tsx';
import { HowItWorks } from './sections/HowItWorks.tsx';
import { Logos } from './sections/Logos.tsx';
import { Nav } from './sections/Nav.tsx';
import { ChatBubble, CookieBanner, NewsletterPopup } from './sections/Overlays.tsx';
import { Pricing } from './sections/Pricing.tsx';
import { Stats } from './sections/Stats.tsx';
import { Testimonials } from './sections/Testimonials.tsx';

export function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-gray-900">
      <Announcement />
      <Nav />
      <Hero />
      <Logos />
      <Features />
      <Stats />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <Faq />
      <Cta />
      <Footer />
      <CookieBanner />
      <ChatBubble />
      <NewsletterPopup />
    </div>
  );
}
