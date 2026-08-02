'use client';

import { trackNavigation } from '@/lib/analytics';

/**
 * AiVisibilityAuditPage — the GEO / AI-Visibility service landing page body.
 * Server wrapper (src/app/services/ai-visibility-audit/page.tsx) owns the
 * metadata + Service/FAQPage JSON-LD; this client component owns the content
 * and on-brand styled-jsx.
 *
 * Content is grounded in the existing free tool (/tools/ai-visibility, which
 * checks by-name / by-need / can-AI-read-your-site) and the "Can AI Find Your
 * Business?" article. PLACEHOLDERS to confirm with the founder: exact price and
 * the precise deliverables list.
 *
 * CTAs are native <a> — Next <Link> doesn't receive styled-jsx's scope class.
 */
export default function AiVisibilityAuditPage() {
  return (
    <main className="geo dot-root">
      {/* Hero */}
      <section className="geo-hero">
        <div className="geo-wrap">
          <div className="geo-eyebrow"><span className="geo-dot" aria-hidden="true" />AI Visibility · GEO</div>
          <h1 className="geo-h1">Get found when your customers ask AI.</h1>
          <p className="geo-lede">
            Search is moving into ChatGPT, Gemini, Perplexity and Google&rsquo;s AI answers.
            When someone asks one of them for a business like yours, it names a handful and
            ignores the rest. An AI-Visibility (GEO) audit finds out whether that&rsquo;s you,
            and fixes what&rsquo;s keeping AI from recommending you.
          </p>
          <div className="geo-cta-row">
            <a
              href="/tools/ai-visibility"
              className="services-cta-button"
              onClick={() => trackNavigation.ctaClick('Run the free check', 'GEO Service Hero', '/tools/ai-visibility')}
            >
              Run the free check
            </a>
            <a
              href="/contacts"
              className="geo-link"
              onClick={() => trackNavigation.ctaClick('Book an audit', 'GEO Service Hero', '/contacts')}
            >
              Book a full audit &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="geo-section geo-problem">
        <div className="geo-wrap">
          <h2 className="geo-h2">Why this matters now</h2>
          <p className="geo-body">
            People increasingly ask an AI assistant to <em>recommend</em> a business instead of
            scrolling a list of links. If AI doesn&rsquo;t know you exist, or can&rsquo;t read
            your site clearly, you&rsquo;re invisible at the exact moment a customer is ready to
            choose. Ranking #1 on Google doesn&rsquo;t help if the answer never shows a link at all.
          </p>
        </div>
      </section>

      {/* What we check / deliverables */}
      <section className="geo-section">
        <div className="geo-wrap">
          <h2 className="geo-h2">What the audit covers</h2>
          <div className="geo-grid">
            <div className="geo-card">
              <span className="geo-dot" aria-hidden="true" />
              <h3 className="geo-card-title">Do AI engines name you?</h3>
              <p className="geo-card-text">We ask ChatGPT, Gemini and Perplexity for a business like yours: <strong>by name</strong>, and, more importantly, <strong>by the problem a customer brings</strong> (where new clients actually find you).</p>
            </div>
            <div className="geo-card">
              <span className="geo-dot" aria-hidden="true" />
              <h3 className="geo-card-title">Can AI read your site?</h3>
              <p className="geo-card-text">We check whether AI crawlers can actually see and correctly describe your business: the content, structure and signals they rely on.</p>
            </div>
            <div className="geo-card">
              <span className="geo-dot" aria-hidden="true" />
              <h3 className="geo-card-title">A prioritised gap report</h3>
              <p className="geo-card-text">A plain-English report of where you&rsquo;re missing, why, and the specific fixes, ranked by impact. Not a 40-page PDF you&rsquo;ll never read.</p>
            </div>
            <div className="geo-card">
              <span className="geo-dot" aria-hidden="true" />
              <h3 className="geo-card-title">The fixes</h3>
              <p className="geo-card-text">Structured data, entity consistency, answer-ready content and machine-readable signals like schema and an <code>llms.txt</code> where it helps. These are the things that make AI describe you accurately.</p>
            </div>
            <div className="geo-card">
              <span className="geo-dot" aria-hidden="true" />
              <h3 className="geo-card-title">Monitoring</h3>
              <p className="geo-card-text">We track a fixed set of buyer questions across the major assistants over time, so you can see whether you&rsquo;re mentioned, cited and described correctly, with dates and sources.</p>
            </div>
            <div className="geo-card">
              <span className="geo-dot" aria-hidden="true" />
              <h3 className="geo-card-title">Built on real engineering</h3>
              <p className="geo-card-text">We don&rsquo;t just advise. We&rsquo;re a web and systems studio, so the fixes get implemented properly on your site, accessibility and content included.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="geo-section geo-process">
        <div className="geo-wrap">
          <h2 className="geo-h2">How it works</h2>
          <ol className="geo-steps">
            <li><span className="geo-step-n">1</span><div><h3 className="geo-step-t">Free self-check</h3><p className="geo-step-p">Run our <a href="/tools/ai-visibility" className="geo-inline-link">free AI-visibility tool</a> in about two minutes to see a snapshot today.</p></div></li>
            <li><span className="geo-step-n">2</span><div><h3 className="geo-step-t">Full audit</h3><p className="geo-step-p">We run the deeper checks across engines and your site, and deliver the prioritised gap report.</p></div></li>
            <li><span className="geo-step-n">3</span><div><h3 className="geo-step-t">Fixes</h3><p className="geo-step-p">We implement the highest-impact fixes (schema, content, entity and accessibility) on your live site.</p></div></li>
            <li><span className="geo-step-n">4</span><div><h3 className="geo-step-t">Monitor</h3><p className="geo-step-p">We re-check over time and report whether AI is now recommending and describing you correctly.</p></div></li>
          </ol>
        </div>
      </section>

      {/* Honesty note */}
      <section className="geo-section">
        <div className="geo-wrap">
          <div className="geo-note">
            <h3 className="geo-note-t">An honest word on guarantees</h3>
            <p className="geo-note-p">
              AI answers are probabilistic, personalised and change over time. No legitimate
              provider can <em>guarantee</em> you&rsquo;ll appear or rank in an AI answer, and
              anyone who promises that is selling you something. What we <em>can</em> do is remove
              every reason AI has to overlook or misdescribe you, and measure the change honestly.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ — mirrors the FAQPage schema on the server page */}
      <section className="geo-section geo-faq">
        <div className="geo-wrap">
          <h2 className="geo-h2">Frequently asked questions</h2>
          <div className="geo-faq-item">
            <h3 className="geo-faq-q">What is AI visibility / GEO?</h3>
            <p className="geo-faq-a">GEO (Generative Engine Optimization, also called AEO) is making sure AI assistants like ChatGPT, Gemini and Perplexity can find, understand and recommend your business when someone asks them for one like yours.</p>
          </div>
          <div className="geo-faq-item">
            <h3 className="geo-faq-q">How is this different from SEO?</h3>
            <p className="geo-faq-a">SEO gets you ranked in a list of links. GEO gets you named inside an AI&rsquo;s answer, which increasingly happens before anyone sees a list of links at all. They overlap, but the signals AI relies on (clear entity, structured data, answer-ready content) need deliberate work.</p>
          </div>
          <div className="geo-faq-item">
            <h3 className="geo-faq-q">Can you guarantee I&rsquo;ll appear in ChatGPT?</h3>
            <p className="geo-faq-a">No, and be wary of anyone who does. AI answers are probabilistic and change over time. We remove the reasons AI overlooks you and measure the change with documented prompts, dates and sources.</p>
          </div>
          <div className="geo-faq-item">
            <h3 className="geo-faq-q">Which AI engines do you check?</h3>
            <p className="geo-faq-a">ChatGPT, Google&rsquo;s Gemini and AI answers, and Perplexity: the assistants your customers are most likely to ask.</p>
          </div>
          <div className="geo-faq-item">
            <h3 className="geo-faq-q">Where do I start?</h3>
            <p className="geo-faq-a">Run the free check to see where you stand today, then book a full audit if you want the deeper analysis and fixes.</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="geo-section geo-final">
        <div className="geo-wrap">
          <h2 className="geo-h2">See what AI says about you today</h2>
          <p className="geo-body">Start with the free two-minute check, then we&rsquo;ll take it from there.</p>
          <div className="geo-cta-row">
            <a
              href="/tools/ai-visibility"
              className="services-cta-button"
              onClick={() => trackNavigation.ctaClick('Run the free check', 'GEO Service Footer', '/tools/ai-visibility')}
            >
              Run the free check
            </a>
            <a
              href="/contacts"
              className="geo-link"
              onClick={() => trackNavigation.ctaClick('Book an audit', 'GEO Service Footer', '/contacts')}
            >
              Book a full audit &rarr;
            </a>
          </div>
        </div>
      </section>

      <style jsx>{`
        .geo { background: #faf9f6; }
        .geo-wrap { max-width: 62rem; margin: 0 auto; padding: 0 2.5rem; }
        .geo-hero { padding: clamp(4rem, 9vw, 8rem) 0 clamp(2.5rem, 5vw, 4rem); }
        .geo-section { padding: clamp(2.5rem, 5vw, 4rem) 0; }

        .geo-eyebrow {
          display: inline-flex; align-items: center; gap: 0.6rem;
          font-family: ff-real-text-pro, sans-serif; font-size: 0.85rem; font-weight: 500;
          letter-spacing: 0.18em; text-transform: uppercase; color: #7a776f; margin: 0 0 1.4rem;
        }
        .geo-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #daff00; display: inline-block; flex: 0 0 auto; }

        .geo-h1 {
          font-family: futura-pt, sans-serif; font-weight: 400;
          font-size: clamp(2.4rem, 5vw, 3.6rem) !important; line-height: 1.1;
          text-transform: none !important; color: #35332f; margin: 0 0 1.6rem; padding: 0;
        }
        .geo-h2 {
          font-family: futura-pt, sans-serif; font-weight: 400;
          font-size: clamp(1.8rem, 3vw, 2.4rem) !important; line-height: 1.15;
          text-transform: none !important; color: #35332f; margin: 0 0 1.6rem; padding: 0;
        }
        .geo-lede, .geo-body {
          font-family: ff-real-text-pro, sans-serif; font-weight: 200;
          font-size: clamp(1.1rem, 1.5vw, 1.35rem); line-height: 1.6; color: #55524c; margin: 0 0 2rem; max-width: 44ch;
        }
        .geo-lede { max-width: 52ch; }
        .geo-body :global(em), .geo-lede :global(em) { font-style: italic; }

        .geo-cta-row { display: flex; align-items: center; gap: 1.5rem 2rem; flex-wrap: wrap; }
        .geo-link {
          font-family: ff-real-text-pro, sans-serif; font-size: 1.1rem; font-weight: 400;
          color: #35332f !important; text-decoration: none !important;
          border-bottom: 1px solid #35332f; padding-bottom: 2px; transition: opacity 0.3s ease;
        }
        .geo-link:hover { opacity: 0.6; }

        .geo-problem { background: #fff; border-top: 1px solid #e6e4de; border-bottom: 1px solid #e6e4de; }

        .geo-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 2rem 2.5rem;
        }
        .geo-card { border-top: 1px solid #e6e4de; padding-top: 1.25rem; }
        .geo-card .geo-dot { margin-bottom: 1rem; }
        .geo-card-title {
          font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.3rem !important;
          text-transform: none !important; color: #35332f; margin: 0 0 0.6rem; padding: 0; line-height: 1.2;
        }
        .geo-card-text { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.05rem; line-height: 1.55; color: #55524c; margin: 0; }
        .geo-card-text :global(strong) { font-weight: 500; color: #35332f; }
        .geo-card-text :global(code) { font-family: monospace; font-size: 0.95em; background: #f0efe9; padding: 0.05rem 0.3rem; }

        .geo-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.75rem; }
        .geo-steps li { display: flex; gap: 1.25rem; align-items: flex-start; }
        .geo-step-n {
          flex: 0 0 auto; width: 2.4rem; height: 2.4rem; border-radius: 50%;
          background: #daff00; color: #35332f; font-family: futura-pt, sans-serif; font-weight: 500;
          font-size: 1.15rem; display: flex; align-items: center; justify-content: center;
        }
        .geo-step-t { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.25rem !important; text-transform: none !important; color: #35332f; margin: 0.2rem 0 0.3rem; padding: 0; }
        .geo-step-p { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.05rem; line-height: 1.55; color: #55524c; margin: 0; }
        .geo-inline-link, .geo-step-p :global(a) { color: #35332f; text-decoration: underline; text-underline-offset: 3px; }

        .geo-note {
          background: radial-gradient(circle at top right, rgba(218,255,0,0.16) 0%, rgba(218,255,0,0.05) 26%, #ffffff 48%);
          border: 1px solid #e6e4de; padding: clamp(1.75rem, 4vw, 2.75rem);
        }
        .geo-note-t { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.4rem !important; text-transform: none !important; color: #35332f; margin: 0 0 0.8rem; padding: 0; }
        .geo-note-p { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.1rem; line-height: 1.6; color: #55524c; margin: 0; }

        .geo-faq { background: #fff; border-top: 1px solid #e6e4de; }
        .geo-faq-item { border-top: 1px solid #e6e4de; padding: 1.5rem 0; }
        .geo-faq-item:first-of-type { border-top: none; }
        .geo-faq-q { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.25rem !important; text-transform: none !important; color: #35332f; margin: 0 0 0.5rem; padding: 0; }
        .geo-faq-a { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.05rem; line-height: 1.55; color: #55524c; margin: 0; max-width: 60ch; }

        .geo-final { padding-bottom: clamp(4rem, 8vw, 7rem); }

        @media (max-width: 768px) {
          .geo-wrap { padding: 0 1.5rem; }
          .geo-grid { grid-template-columns: 1fr; gap: 0; }
          .geo-card { padding: 1.25rem 0; }
        }
      `}</style>
    </main>
  );
}
