'use client';

import { trackNavigation } from '@/lib/analytics';

/**
 * AiCheckCta
 * Lightweight end-of-post call-to-action for the free AI-visibility self-check.
 * Dropped into a blog post via the [[ai-visibility-cta]] marker (BlogPostPage.tsx) —
 * use it in posts that reference the tool but don't embed the full interactive
 * [[ai-visibility-tool]]. Links carry ?src=blog so analytics can see which posts
 * drive checks.
 *
 * Site's light language (white panel, soft yellow glow, hairline). CTA reuses the
 * canonical `.services-cta-button` GLOBAL class so it matches every other button.
 * Native <a> — Next's <Link> doesn't receive styled-jsx's scope class.
 */
export default function AiCheckCta() {
  return (
    <aside className="aicta-block">
      <div className="aicta-copy">
        <div className="aicta-eyebrow">
          <span className="aicta-dot" aria-hidden="true" />
          Free tool
        </div>
        <h3 className="aicta-title">Can AI find your business?</h3>
        <p className="aicta-lede">
          Run a free check to see whether ChatGPT, Gemini and Perplexity name you, or
          send your customers to a competitor.
        </p>
      </div>

      <a
        href="/tools/ai-visibility?src=blog"
        className="services-cta-button"
        onClick={() =>
          trackNavigation.ctaClick('AI Visibility Check', 'Blog CTA', '/tools/ai-visibility?src=blog')
        }
      >
        Run the free check
      </a>

      <style jsx>{`
        .aicta-block {
          background: radial-gradient(
            circle at top right,
            rgba(218, 255, 0, 0.18) 0%,
            rgba(218, 255, 0, 0.06) 26%,
            #ffffff 50%
          );
          border: 1px solid #e6e4de;
          border-radius: 0;
          padding: clamp(2rem, 4vw, 3rem);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2.5rem;
          flex-wrap: wrap;
        }

        .aicta-copy { flex: 1 1 22rem; min-width: 0; }

        .aicta-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          font-family: ff-real-text-pro, sans-serif;
          font-size: 0.8rem;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7a776f;
          margin: 0 0 1rem 0;
        }
        .aicta-dot {
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 50%;
          background: #daff00;
          display: inline-block;
          flex: 0 0 auto;
        }

        .aicta-title {
          font-family: futura-pt, sans-serif;
          font-weight: 400;
          font-size: clamp(1.7rem, 3vw, 2.1rem) !important;
          line-height: 1.15;
          letter-spacing: 0;
          text-transform: none !important;
          color: #35332f;
          margin: 0 0 0.85rem 0;
          padding: 0;
          text-indent: 0;
        }

        .aicta-lede {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(1rem, 1.3vw, 1.15rem);
          font-weight: 200;
          line-height: 1.55;
          color: #55524c;
          margin: 0;
          max-width: 42ch;
        }

        @media (max-width: 720px) {
          .aicta-block { gap: 1.75rem; }
        }
      `}</style>
    </aside>
  );
}
