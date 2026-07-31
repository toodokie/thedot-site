'use client';

import { trackNavigation } from '@/lib/analytics';

/**
 * AiCheckPromo
 * Homepage module surfacing the free AI-visibility self-check (/tools/ai-visibility).
 * Sits between LatestFromJournal (whose blurb name-checks "AI visibility") and Services.
 *
 * Visual: the site's LIGHT language — a contained white "feature panel" lifted by a
 * soft yellow radial glow + hairline border (the emphasis device ServicesSection uses).
 * No dark backgrounds. Text left, CTA right (stacks on mobile).
 *
 * The CTA reuses the site's canonical `.services-cta-button` GLOBAL class (white / ink
 * border / yellow glow shadow, hover fills ink) so it matches every other button on the
 * page exactly. It's a native <a> (Next's <Link> doesn't get styled-jsx's scope class).
 */
export default function AiCheckPromo() {
  return (
    <section className="aicheck-section">
      <div className="aicheck-inner">
        <div className="aicheck-panel">
          <div className="aicheck-copy">
            <div className="aicheck-eyebrow">
              <span className="aicheck-dot" aria-hidden="true" />
              Free tool
            </div>
            <h2 className="aicheck-title">Can AI find your business?</h2>
            <p className="aicheck-lede">
              When a customer asks ChatGPT, Gemini or Perplexity for a business like
              yours, does it name you — or send them to a competitor? Run a free check
              and see exactly what AI says about you today.
            </p>
          </div>

          <div className="aicheck-action">
            <a
              href="/tools/ai-visibility"
              className="services-cta-button"
              onClick={() =>
                trackNavigation.ctaClick('AI Visibility Check', 'Homepage Module', '/tools/ai-visibility')
              }
            >
              Run the free check
            </a>
            <p className="aicheck-reassure">Free · takes about two minutes</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .aicheck-section {
          background: #faf9f6;
          padding: 8rem 0;
          width: 100%;
        }
        .aicheck-inner {
          max-width: 120rem;
          margin: 0 auto;
          padding: 0 2.5rem;
          width: 100%;
          box-sizing: border-box;
        }

        /* Contained white feature panel lifted by a soft yellow glow + hairline */
        .aicheck-panel {
          max-width: 72rem;
          margin: 0 auto;
          background: radial-gradient(
            circle at top right,
            rgba(218, 255, 0, 0.18) 0%,
            rgba(218, 255, 0, 0.06) 26%,
            #ffffff 50%
          );
          border: 1px solid #e6e4de;
          border-radius: 0;
          padding: clamp(2.5rem, 5vw, 4rem);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 3rem;
          flex-wrap: wrap;
        }

        .aicheck-copy { flex: 1 1 28rem; min-width: 0; max-width: 40rem; }

        .aicheck-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          font-family: ff-real-text-pro, sans-serif;
          font-size: 0.85rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #7a776f;
          margin: 0 0 1.4rem 0;
        }
        .aicheck-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 50%;
          background: #daff00;
          display: inline-block;
          flex: 0 0 auto;
        }

        .aicheck-title {
          font-family: futura-pt, sans-serif;
          font-weight: 400;
          font-size: clamp(2.2rem, 3.4vw, 3rem) !important;
          line-height: 1.12;
          letter-spacing: 0;
          text-transform: none !important;
          color: #35332f;
          margin: 0 0 1.4rem 0;
          padding: 0;
          text-indent: 0;
        }

        .aicheck-lede {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(1.05rem, 1.3vw, 1.25rem);
          font-weight: 200;
          line-height: 1.6;
          color: #55524c;
          margin: 0;
          max-width: 44ch;
        }

        /* Action column: CTA (global .services-cta-button) + reassurance */
        .aicheck-action {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1rem;
        }
        .aicheck-reassure {
          font-family: ff-real-text-pro, sans-serif;
          font-size: 0.9rem;
          font-weight: 200;
          color: #8f8c84;
          margin: 0;
        }

        @media (max-width: 860px) {
          .aicheck-panel { gap: 2.25rem; }
          .aicheck-copy { flex-basis: 100%; max-width: 100%; }
        }
        @media (max-width: 768px) {
          .aicheck-section { padding: 4.5rem 0; }
          .aicheck-inner { padding: 0 1.5rem; }
        }
      `}</style>
    </section>
  );
}
