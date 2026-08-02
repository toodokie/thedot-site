'use client';

import { trackNavigation } from '@/lib/analytics';

/**
 * ServicePageLayout — reusable, data-driven layout for SP3 service landing pages.
 * Extracted from the AI-Visibility (GEO) page so every service page shares the
 * same on-brand light structure (hero, "why", a card grid, optional steps, an
 * optional note, FAQ, final CTA). Each service route passes a `ServicePageData`
 * object and owns its own Service/FAQPage JSON-LD.
 *
 * Rich-text fields (lede, card/why/note/faq bodies) accept simple authored HTML
 * (<strong>/<em>/<code>/<a>) — this is first-party content, not user input.
 * CTAs are native <a> (Next <Link> doesn't get styled-jsx's scope class).
 */

export interface ServiceCta {
  label: string;
  href: string;
  kind?: 'button' | 'link';
  track?: { text: string; location: string };
}
export interface ServiceCard { title: string; body: string }
export interface ServiceStep { title: string; body: string }
export interface ServiceFaq { q: string; a: string }

export interface ServicePageData {
  eyebrow: string;
  h1: string;
  lede: string;
  ctas: ServiceCta[];
  why?: { heading: string; body: string };
  covers: { heading: string; cards: ServiceCard[] };
  how?: { heading: string; steps: ServiceStep[] };
  note?: { title: string; body: string };
  faqs: { heading: string; items: ServiceFaq[] };
  final: { heading: string; body: string };
}

function CtaRow({ ctas, location }: { ctas: ServiceCta[]; location: string }) {
  return (
    <div className="sp-cta-row">
      {ctas.map((c) => (
        <a
          key={c.href + c.label}
          href={c.href}
          className={c.kind === 'link' ? 'sp-link' : 'services-cta-button'}
          onClick={() => trackNavigation.ctaClick(c.track?.text || c.label, c.track?.location || location, c.href)}
          dangerouslySetInnerHTML={{ __html: c.label }}
        />
      ))}
    </div>
  );
}

export default function ServicePageLayout(data: ServicePageData) {
  return (
    <main className="sp dot-root">
      <section className="sp-hero">
        <div className="sp-wrap">
          <div className="sp-eyebrow"><span className="sp-dot" aria-hidden="true" />{data.eyebrow}</div>
          <h1 className="sp-h1" dangerouslySetInnerHTML={{ __html: data.h1 }} />
          <p className="sp-lede" dangerouslySetInnerHTML={{ __html: data.lede }} />
          <CtaRow ctas={data.ctas} location="Service Hero" />
        </div>
      </section>

      {data.why && (
        <section className="sp-section sp-why">
          <div className="sp-wrap">
            <h2 className="sp-h2" dangerouslySetInnerHTML={{ __html: data.why.heading }} />
            <p className="sp-body" dangerouslySetInnerHTML={{ __html: data.why.body }} />
          </div>
        </section>
      )}

      <section className="sp-section">
        <div className="sp-wrap">
          <h2 className="sp-h2" dangerouslySetInnerHTML={{ __html: data.covers.heading }} />
          <div className="sp-grid">
            {data.covers.cards.map((c) => (
              <div className="sp-card" key={c.title}>
                <span className="sp-dot" aria-hidden="true" />
                <h3 className="sp-card-title" dangerouslySetInnerHTML={{ __html: c.title }} />
                <p className="sp-card-text" dangerouslySetInnerHTML={{ __html: c.body }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {data.how && (
        <section className="sp-section sp-process">
          <div className="sp-wrap">
            <h2 className="sp-h2" dangerouslySetInnerHTML={{ __html: data.how.heading }} />
            <ol className="sp-steps">
              {data.how.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="sp-step-n">{i + 1}</span>
                  <div>
                    <h3 className="sp-step-t" dangerouslySetInnerHTML={{ __html: s.title }} />
                    <p className="sp-step-p" dangerouslySetInnerHTML={{ __html: s.body }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {data.note && (
        <section className="sp-section">
          <div className="sp-wrap">
            <div className="sp-note">
              <h3 className="sp-note-t" dangerouslySetInnerHTML={{ __html: data.note.title }} />
              <p className="sp-note-p" dangerouslySetInnerHTML={{ __html: data.note.body }} />
            </div>
          </div>
        </section>
      )}

      <section className="sp-section sp-faq">
        <div className="sp-wrap">
          <h2 className="sp-h2" dangerouslySetInnerHTML={{ __html: data.faqs.heading }} />
          {data.faqs.items.map((f) => (
            <div className="sp-faq-item" key={f.q}>
              <h3 className="sp-faq-q" dangerouslySetInnerHTML={{ __html: f.q }} />
              <p className="sp-faq-a" dangerouslySetInnerHTML={{ __html: f.a }} />
            </div>
          ))}
        </div>
      </section>

      <section className="sp-section sp-final">
        <div className="sp-wrap">
          <h2 className="sp-h2" dangerouslySetInnerHTML={{ __html: data.final.heading }} />
          <p className="sp-body" dangerouslySetInnerHTML={{ __html: data.final.body }} />
          <CtaRow ctas={data.ctas} location="Service Footer" />
        </div>
      </section>

      <style jsx>{`
        .sp { background: #faf9f6; }
        .sp-wrap { max-width: 62rem; margin: 0 auto; padding: 0 2.5rem; }
        .sp-hero { padding: clamp(4rem, 9vw, 8rem) 0 clamp(2.5rem, 5vw, 4rem); }
        .sp-section { padding: clamp(2.5rem, 5vw, 4rem) 0; }

        .sp-eyebrow { display: inline-flex; align-items: center; gap: 0.6rem; font-family: ff-real-text-pro, sans-serif; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #7a776f; margin: 0 0 1.4rem; }
        .sp-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #daff00; display: inline-block; flex: 0 0 auto; }

        .sp-h1 { font-family: futura-pt, sans-serif; font-weight: 400; font-size: clamp(2.4rem, 5vw, 3.6rem) !important; line-height: 1.1; text-transform: none !important; color: #35332f; margin: 0 0 1.6rem; padding: 0; }
        .sp-h2 { font-family: futura-pt, sans-serif; font-weight: 400; font-size: clamp(1.8rem, 3vw, 2.4rem) !important; line-height: 1.15; text-transform: none !important; color: #35332f; margin: 0 0 1.6rem; padding: 0; }
        .sp-lede, .sp-body { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: clamp(1.1rem, 1.5vw, 1.35rem); line-height: 1.6; color: #55524c; margin: 0 0 2rem; max-width: 46ch; }
        .sp-lede { max-width: 52ch; }
        .sp-lede :global(em), .sp-body :global(em) { font-style: italic; }
        .sp-lede :global(strong), .sp-body :global(strong) { font-weight: 500; color: #35332f; }

        .sp-cta-row { display: flex; align-items: center; gap: 1.5rem 2rem; flex-wrap: wrap; }
        .sp-link { font-family: ff-real-text-pro, sans-serif; font-size: 1.1rem; font-weight: 400; color: #35332f !important; text-decoration: none !important; border-bottom: 1px solid #35332f; padding-bottom: 2px; transition: opacity 0.3s ease; }
        .sp-link:hover { opacity: 0.6; }

        .sp-why { background: #fff; border-top: 1px solid #e6e4de; border-bottom: 1px solid #e6e4de; }

        .sp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 2rem 2.5rem; }
        .sp-card { border-top: 1px solid #e6e4de; padding-top: 1.25rem; }
        .sp-card .sp-dot { margin-bottom: 1rem; }
        .sp-card-title { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.3rem !important; text-transform: none !important; color: #35332f; margin: 0 0 0.6rem; padding: 0; line-height: 1.2; }
        .sp-card-text { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.05rem; line-height: 1.55; color: #55524c; margin: 0; }
        .sp-card-text :global(strong) { font-weight: 500; color: #35332f; }
        .sp-card-text :global(code) { font-family: monospace; font-size: 0.95em; background: #f0efe9; padding: 0.05rem 0.3rem; }

        .sp-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.75rem; }
        .sp-steps li { display: flex; gap: 1.25rem; align-items: flex-start; }
        .sp-step-n { flex: 0 0 auto; width: 2.4rem; height: 2.4rem; border-radius: 50%; background: #daff00; color: #35332f; font-family: futura-pt, sans-serif; font-weight: 500; font-size: 1.15rem; display: flex; align-items: center; justify-content: center; }
        .sp-step-t { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.25rem !important; text-transform: none !important; color: #35332f; margin: 0.2rem 0 0.3rem; padding: 0; }
        .sp-step-p { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.05rem; line-height: 1.55; color: #55524c; margin: 0; }
        .sp-step-p :global(a) { color: #35332f; text-decoration: underline; text-underline-offset: 3px; }

        .sp-note { background: radial-gradient(circle at top right, rgba(218,255,0,0.16) 0%, rgba(218,255,0,0.05) 26%, #ffffff 48%); border: 1px solid #e6e4de; padding: clamp(1.75rem, 4vw, 2.75rem); }
        .sp-note-t { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.4rem !important; text-transform: none !important; color: #35332f; margin: 0 0 0.8rem; padding: 0; }
        .sp-note-p { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.1rem; line-height: 1.6; color: #55524c; margin: 0; }

        .sp-faq { background: #fff; border-top: 1px solid #e6e4de; }
        .sp-faq-item { border-top: 1px solid #e6e4de; padding: 1.5rem 0; }
        .sp-faq-item:first-of-type { border-top: none; }
        .sp-faq-q { font-family: futura-pt, sans-serif; font-weight: 400; font-size: 1.25rem !important; text-transform: none !important; color: #35332f; margin: 0 0 0.5rem; padding: 0; }
        .sp-faq-a { font-family: ff-real-text-pro, sans-serif; font-weight: 200; font-size: 1.05rem; line-height: 1.55; color: #55524c; margin: 0; max-width: 60ch; }
        .sp-faq-a :global(a) { color: #35332f; text-decoration: underline; text-underline-offset: 3px; }

        .sp-final { padding-bottom: clamp(4rem, 8vw, 7rem); }

        @media (max-width: 768px) {
          .sp-wrap { padding: 0 1.5rem; }
          .sp-grid { grid-template-columns: 1fr; gap: 0; }
          .sp-card { padding: 1.25rem 0; }
        }
      `}</style>
    </main>
  );
}
