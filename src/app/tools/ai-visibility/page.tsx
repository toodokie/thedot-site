import type { Metadata } from "next";
import AiVisibilitySelfCheck from '@/components/AiVisibilitySelfCheck';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Can AI Find Your Business? Free AI-Visibility Self-Check | The Dot Creative',
  description:
    'Test whether ChatGPT, Gemini and Perplexity recommend your business. Get the exact prompts to run in about five minutes, free, from The Dot Creative Agency in the GTA.',
  keywords:
    'AI visibility check, answer engine optimization, AEO, GEO, ChatGPT business visibility, AI search optimization GTA, generative engine optimization Ontario',
  alternates: {
    canonical: 'https://www.thedotcreative.co/tools/ai-visibility',
  },
  openGraph: {
    title: 'Can AI Find Your Business? Free AI-Visibility Self-Check',
    description:
      'Test whether ChatGPT, Gemini and Perplexity recommend your business. Free prompts you can run in about five minutes.',
    url: 'https://www.thedotcreative.co/tools/ai-visibility',
    siteName: 'The Dot Creative Agency',
    images: [
      {
        url: '/images/The Dot Poster.webp',
        width: 1200,
        height: 630,
        alt: 'The Dot Creative Agency — Can AI find your business?',
      },
    ],
    locale: 'en_CA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Can AI Find Your Business? Free AI-Visibility Self-Check',
    description: 'Test whether ChatGPT, Gemini and Perplexity recommend your business.',
    images: ['/images/The Dot Poster.webp'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AiVisibilityToolPage() {
  return (
    <>
      <main style={{ padding: 'clamp(48px, 10vw, 120px) 20px' }}>
        <AiVisibilitySelfCheck headingLevel={1} />
      </main>
      <Footer />
    </>
  );
}
