'use client';

import { useRef, useState, type FormEvent } from 'react';
import { byNamePrompt, byNeedPrompts, readabilityPrompt, SOURCE_PROMPT, type AivcFields } from '@/lib/aivc-prompts';

/**
 * AiVisibilitySelfCheck
 * "Can AI find your business?" self-check.
 *
 * The visitor sees the exact prompts before running (shared with the API via
 * lib/aivc-prompts, so shown === run). It posts to /api/ai-visibility, which runs
 * three different real-customer by-need phrasings plus a by-name and optional
 * readability check, and reports how many of the three name the business. On
 * cap/error it falls back to the same prompts to run by hand. The results credit
 * the engine (ChatGPT / the model) in small print.
 */

const DISPLAY = "'futura-pt','Futura','Avenir Next','Helvetica Neue',Arial,sans-serif";
const BODY = "'ff-real-text-pro','Helvetica Neue',Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace";
const EASE = 'cubic-bezier(.23,1,.32,1)';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Report = {
  byName: { found: boolean; wouldRecommend: string; summary: string };
  byNeed: { namedCount: number; runs: number; competitors: string[]; summary: string };
  readability?: { clear: boolean; summary: string };
  verdict: string;
};

type Manual = { check1: string[]; check2: string[]; bonus: string[]; source: string };

function PromptRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable; text stays visible to copy by hand */
    }
  }
  return (
    <div className="prompt">
      <p className="prompt-text">{text}</p>
      <div className="prompt-actions">
        <button type="button" className={'copy' + (copied ? ' copied' : '')} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span className="copy-hint">paste into your AI assistant</span>
      </div>
      <style jsx>{`
        .prompt { border: 1px solid var(--white-smoke-2, #ebebe7); background: var(--background, #faf9f6); border-radius: 10px; overflow: hidden; margin-top: 0.7em; }
        .prompt-text { font-family: ${MONO}; font-size: 0.86rem; line-height: 1.55; padding: 0.85em 1em; margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--foreground, #35332f); }
        .prompt-actions { display: flex; flex-wrap: wrap; gap: 0.6em; align-items: center; padding: 0.6em 1em; border-top: 1px solid var(--white-smoke-2, #ebebe7); background: var(--white-3, #fffefc); }
        .copy { font-family: ${DISPLAY}; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; cursor: pointer; background: var(--background, #faf9f6); color: var(--foreground, #35332f); border: 1px solid var(--foreground, #35332f); border-radius: 0; padding: 0.5em 0.95em; box-shadow: 0 1px 5px 0 rgba(218,255,0,0.85); transition: all 0.3s ${EASE}; }
        .copy:hover { background: linear-gradient(135deg, rgba(218,255,0,0.5) 0%, var(--background, #faf9f6) 100%); transform: translateY(-1px); box-shadow: 0 3px 11px rgba(0,0,0,0.08); }
        .copy.copied { background: var(--yellow, #daff00); color: var(--foreground, #35332f); }
        .copy:focus-visible { outline: 2px solid var(--foreground, #35332f); outline-offset: 2px; }
        .copy-hint { font-family: ${DISPLAY}; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--grey-2, #7a776f); }
      `}</style>
    </div>
  );
}

export default function AiVisibilitySelfCheck({
  bookingUrl = '/contacts',
  apiPath = '/api/ai-visibility',
}: {
  bookingUrl?: string;
  apiPath?: string;
}) {
  const [email, setEmail] = useState('');
  const [biz, setBiz] = useState('');
  const [city, setCity] = useState('');
  const [service, setService] = useState('');
  const [need, setNeed] = useState('');
  const [site, setSite] = useState('');
  const [prompts, setPrompts] = useState<{ byName: string; byNeed: string[] } | null>(null);
  const [engine, setEngine] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'report' | 'manual'>('idle');
  const [report, setReport] = useState<Report | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const resultsRef = useRef<HTMLDivElement | null>(null);

  function buildManual(): Manual {
    const f: AivcFields = { biz, city, service, need, site };
    const rp = readabilityPrompt(f);
    return {
      check1: [byNamePrompt(f)],
      check2: byNeedPrompts(f),
      bonus: rp ? [rp] : [],
      source: SOURCE_PROMPT,
    };
  }

  function scrollToResults() {
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setFormError('Please enter a valid email so we can run your check.');
      return;
    }
    if (!biz.trim() || !city.trim() || !service.trim() || !need.trim()) {
      setFormError('Please fill in your business name, city, what you do, and one customer need.');
      return;
    }
    setFormError('');
    setReport(null);
    setManual(null);
    setEmailSent(null);
    setPrompts(null);
    setEngine('');
    setNote('');
    setStatus('loading');
    scrollToResults();

    let fell = '';
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), biz, city, service, need, site }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.report) {
          setReport(data.report as Report);
          setPrompts(data.prompts ?? null);
          setEngine(typeof data.engine === 'string' ? data.engine : '');
          setEmailSent(data.emailSent === true);
          setStatus('report');
          scrollToResults();
          return;
        }
        fell = "The live check couldn't be completed just now, so here are the prompts to run yourself.";
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setFormError(data?.error === 'bad_email' ? 'Please enter a valid email.' : 'Please fill in all required fields, then try again.');
        setStatus('idle');
        return;
      } else if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        fell =
          data?.capped === 'global'
            ? "This free tool has hit today's overall limit. Here are the prompts to run yourself in the meantime."
            : "You've used today's free live checks. Here are the prompts to run yourself.";
      } else if (res.status === 503) {
        fell = 'The live check is not switched on yet. Here are the prompts to run yourself.';
      } else {
        fell = 'The live check hiccuped. Here are the prompts to run yourself.';
      }
    } catch {
      fell = "Couldn't reach the live check. Here are the prompts to run yourself.";
    }
    setNote(fell);
    setManual(buildManual());
    setStatus('manual');
    scrollToResults();
  }

  function reset() {
    setStatus('idle');
    setReport(null);
    setManual(null);
    setPrompts(null);
    setEngine('');
    setEmailSent(null);
    setNote('');
    setFormError('');
    setBiz('');
    setCity('');
    setService('');
    setNeed('');
    setSite('');
  }


  function needStatus(nc: number, runs: number) {
    if (nc >= runs) return { pill: 'good', tag: `Named ${nc}/${runs}`, line: `Named across all ${runs} customer questions, consistent visibility.` };
    if (nc > 0) return { pill: 'flag', tag: `Named ${nc}/${runs}`, line: `Named in only ${nc} of ${runs} customer questions, fragile, inconsistent visibility.` };
    return { pill: 'flag', tag: `0/${runs}`, line: `Not named in any of the ${runs} customer questions.` };
  }

  const recWord: Record<string, string> = { yes: 'Yes', maybe: 'Maybe', no: 'No', unknown: 'Unclear' };

  return (
    <section className="aivc" aria-label="AI visibility self-check">
      <div className="eyebrow"><span className="dot" aria-hidden="true" />Free tool · The Dot Creative</div>
      <h2 className="title">Can AI find your business?</h2>
      <p className="sub">
        When a potential customer asks AI for a recommendation, does it name you? Enter your details, see the exact
        questions we&apos;ll ask, then we run them live and hand you a short, honest report.
      </p>

      <form className="panel" onSubmit={run} noValidate>
        <div className="field">
          <label htmlFor="aivc-biz">Your business name</label>
          <span className="hint">Exactly as it appears online.</span>
          <input id="aivc-biz" type="text" autoComplete="organization" placeholder="e.g. Maple Leaf Dental" value={biz} onChange={(e) => setBiz(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="aivc-city">City or area you serve</label>
          <input id="aivc-city" type="text" autoComplete="address-level2" placeholder="e.g. North York, Toronto" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="aivc-service">What you do, in a customer&apos;s words</label>
          <span className="hint">Plain language, not your official title. What would a stranger call it?</span>
          <input id="aivc-service" type="text" placeholder="e.g. family dentistry" value={service} onChange={(e) => setService(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="aivc-need">A customer and the problem they bring you</label>
          <span className="hint">One real situation someone comes to you with.</span>
          <input id="aivc-need" type="text" placeholder="e.g. a nervous patient who needs an emergency root canal" value={need} onChange={(e) => setNeed(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="aivc-site">Your website <span className="optional">optional</span></label>
          <span className="hint">Add it to also check whether AI can read and describe your site correctly.</span>
          <input id="aivc-site" type="text" inputMode="url" autoComplete="url" placeholder="e.g. yourbusiness.ca" value={site} onChange={(e) => setSite(e.target.value)} />
        </div>

        {biz.trim() && city.trim() && service.trim() && need.trim() && (() => {
          const f: AivcFields = { biz, city, service, need, site };
          return (
            <div className="preview">
              <p className="preview-label">The questions we&apos;ll ask AI on your behalf</p>
              <ol className="preview-list">
                <li><span className="ptag">by name</span>{byNamePrompt(f)}</li>
                {byNeedPrompts(f).map((p, i) => <li key={i}><span className="ptag">by need</span>{p}</li>)}
              </ol>
              <p className="preview-note">These are real questions your customers ask. We run all four live, then report how you show up.</p>
            </div>
          );
        })()}

        <div className="field">
          <label htmlFor="aivc-email">Your email</label>
          <span className="hint">We run your live check and send a copy of the report here.</span>
          <input id="aivc-email" type="email" autoComplete="email" placeholder="you@yourbusiness.ca" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary" disabled={status === 'loading'}>
          {status === 'loading' ? 'Checking…' : 'Check my AI visibility'}
        </button>
        {formError && <p className="form-error" role="alert">{formError}</p>}
      </form>

      {status !== 'idle' && (
        <div className="results" ref={resultsRef} tabIndex={-1}>
          {status === 'loading' && (
            <div className="loading">
              <span className="spin" aria-hidden="true" />
              <div>
                <strong>Running your live AI checks.</strong>
                <span className="loading-sub">Searching the web a few times over. This can take up to a minute.</span>
              </div>
            </div>
          )}

          {status === 'report' && report && (() => {
            const ns = needStatus(report.byNeed.namedCount, report.byNeed.runs);
            return (
              <>
                <p className="lede">Here is what AI says today, checked several times so you can see how consistent it is.</p>
                {emailSent !== null && (
                  <p className={'delivery ' + (emailSent ? 'delivery--sent' : 'delivery--failed')} role="status">
                    {emailSent ? `A copy was emailed to ${email.trim()}.` : 'Your report is ready below, but the email copy could not be sent.'}
                  </p>
                )}

                <div className="check">
                  <div className="check-head">
                    <h3 className="check-title">By name</h3>
                    <span className={'tag ' + (report.byName.found ? 'good' : 'flat')}>{report.byName.found ? 'Found' : 'Not found'}</span>
                  </div>
                  <p className="rec">Would AI recommend you: <strong>{recWord[report.byName.wouldRecommend] ?? report.byName.wouldRecommend}</strong></p>
                  <p className="check-note">{report.byName.summary}</p>
                </div>

                <div className="check check--spotlight">
                  <div className="check-head">
                    <h3 className="check-title">By need (the one that wins clients)</h3>
                    <span className={'tag ' + ns.pill}>{ns.tag}</span>
                  </div>
                  <p className="rec"><strong>{ns.line}</strong></p>
                  <p className="check-note">{report.byNeed.summary}</p>
                  {report.byNeed.competitors.length > 0 && (
                    <div className="rivals">
                      <span className="rivals-label">{report.byNeed.namedCount > 0 ? 'Who else AI named' : 'AI recommended instead'}</span>
                      <div className="chips">
                        {report.byNeed.competitors.map((c, i) => <span className="chip" key={i}>{c}</span>)}
                      </div>
                    </div>
                  )}
                  {prompts && prompts.byNeed.length > 0 && (
                    <div className="asked">
                      <span className="asked-label">The customer questions we asked</span>
                      <ul className="asked-list">
                        {prompts.byNeed.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                {report.readability && (
                  <div className="check">
                    <div className="check-head">
                      <h3 className="check-title">Can AI read your site?</h3>
                      <span className={'tag ' + (report.readability.clear ? 'good' : 'flat')}>{report.readability.clear ? 'Clear' : 'Unclear'}</span>
                    </div>
                    <p className="check-note">{report.readability.summary}</p>
                  </div>
                )}

                {report.verdict && <p className="verdict"><span className="verdict-hl">{report.verdict}</span></p>}

                <div className="cta">
                  <h3>Want AI to see you clearly?</h3>
                  <p>That is what an AI-visibility audit is for: we find where AI misses or misreads you, do the legitimate work to make your real strengths legible to it, and re-test so you can see the change. No tricks, no magic, just the fundamentals done well.</p>
                  <a href={bookingUrl}>Book an AI-visibility audit &rarr;</a>
                </div>

                {engine && <p className="engine">{engine}</p>}
                <button type="button" className="restart" onClick={reset}>Run another check</button>
              </>
            );
          })()}

          {status === 'manual' && manual && (
            <>
              {note && <p className="note">{note}</p>}
              <p className="lede">Run each prompt in a fresh chat with an AI assistant. Two checks matter, and the gap between them is the whole point.</p>

              <div className="check">
                <div className="check-head">
                  <h3 className="check-title">Check 1 &mdash; by name</h3>
                  <span className="tag flat">Most pass</span>
                </div>
                <p className="check-note">Direct search. Reassuring, but it only reaches people who already know you exist.</p>
                {manual.check1.map((t, i) => <PromptRow key={i} text={t} />)}
              </div>

              <div className="check check--spotlight">
                <div className="check-head">
                  <h3 className="check-title">Check 2 &mdash; by need</h3>
                  <span className="tag flag">Most fail</span>
                </div>
                <p className="check-note">Where new clients actually discover you: by describing a problem, not a name.</p>
                {manual.check2.map((t, i) => <PromptRow key={i} text={t} />)}
              </div>

              {manual.bonus.length > 0 && (
                <div className="check">
                  <div className="check-head">
                    <h3 className="check-title">Bonus &mdash; can it read your site?</h3>
                    <span className="tag flat">Readability</span>
                  </div>
                  <p className="check-note">Point the AI at your page (use a tool that can open links). If the summary is vague or wrong, that is a fixable structure problem.</p>
                  {manual.bonus.map((t, i) => <PromptRow key={i} text={t} />)}
                </div>
              )}

              <div className="tip">
                <h4>One more move</h4>
                <p>After any answer, ask: <em>&quot;What sources are you basing that on?&quot;</em> If it cites your competitors and not you, that is your gap.</p>
                <PromptRow text={manual.source} />
              </div>

              <div className="cta">
                <h3>Passed by name but failed by need?</h3>
                <p>That is the common story, and it is workable. We run the full check against your real competitors, then do the legitimate work to make you more legible to AI and re-test to show the change. No tricks, no magic, just the fundamentals done well.</p>
                <a href={bookingUrl}>Book an AI-visibility audit &rarr;</a>
              </div>

              <button type="button" className="restart" onClick={reset}>Start over</button>
            </>
          )}
        </div>
      )}

      <div className="foot"><span className="dot" aria-hidden="true" />A free tool by The Dot Creative Agency</div>

      <style jsx>{`
        .aivc { max-width: 660px; margin: 0 auto; color: var(--foreground, #35332f); background: var(--background, #faf9f6); font-family: ${BODY}; font-size: 16px; line-height: 1.6; }
        .aivc * { box-sizing: border-box; }
        .eyebrow { display: flex; align-items: center; gap: 0.55em; font-family: ${DISPLAY}; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-2, #7a776f); margin: 0 0 1em; }
        .dot { width: 0.5em; height: 0.5em; border-radius: 100%; flex: 0 0 auto; background: radial-gradient(circle farthest-corner at 35% 30%, #ffffff, var(--yellow, #daff00)); border: 1px solid var(--foreground, #35332f); }
        .title { font-family: ${DISPLAY}; font-weight: 300; font-size: clamp(1.9rem, 5.5vw, 2.75rem); line-height: 1.08; letter-spacing: -0.01em; margin: 0 0 0.4em; text-wrap: balance; }
        .sub { color: #47453f; margin: 0 0 1.7em; max-width: 52ch; }

        .panel { background: var(--white-3, #fffefc); border: 1px solid var(--foreground, #35332f); border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.10); padding: clamp(20px, 4vw, 30px); }
        .field { display: flex; flex-direction: column; gap: 0.4em; margin-bottom: 1.05em; }
        .field:last-of-type { margin-bottom: 1.4em; }
        label { font-family: ${DISPLAY}; font-weight: 600; font-size: 0.82rem; letter-spacing: 0.03em; text-transform: uppercase; }
        .optional { font-weight: 500; font-size: 0.62rem; letter-spacing: 0.08em; color: var(--grey-2, #7a776f); border: 1px solid var(--white-smoke-2, #ebebe7); padding: 0.15em 0.5em; margin-left: 0.35em; vertical-align: middle; }
        .hint { color: #47453f; font-size: 0.82rem; line-height: 1.45; }
        .form-error { margin: 0.9em 0 0; font-family: ${DISPLAY}; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.02em; color: var(--foreground, #35332f); background: rgba(218,255,0,0.25); border: 1px solid var(--foreground, #35332f); padding: 0.6em 0.85em; }
        input { font-family: ${BODY}; font-size: 1rem; color: var(--foreground, #35332f); background: var(--background, #faf9f6); border: 1px solid var(--white-smoke-2, #ebebe7); border-radius: 0; padding: 0.72em 0.85em; width: 100%; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        input::placeholder { color: var(--grey-2, #7a776f); opacity: 0.75; }
        input:focus { outline: none; border-color: var(--foreground, #35332f); box-shadow: 0 2px 8px 0 rgba(218,255,0,0.55); }

        .btn-primary { font-family: ${DISPLAY}; font-weight: 400; font-size: 0.95rem; letter-spacing: 0.09em; text-transform: uppercase; cursor: pointer; background: var(--background, #faf9f6); color: var(--foreground, #35332f); border: 1px solid var(--foreground, #35332f); border-radius: 0; box-shadow: 0 2px 5px 0 var(--yellow, #daff00); padding: 1em 1.2em; width: 100%; transition: all 0.4s ${EASE}; }
        .btn-primary:hover:not(:disabled) { background: var(--foreground, #35332f); color: var(--background, #faf9f6); box-shadow: 2px 9px 20px 2px var(--yellow, #daff00); transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.7; cursor: progress; }
        .btn-primary:focus-visible { outline: 2px solid var(--foreground, #35332f); outline-offset: 3px; }

        .results { margin-top: 1.9em; }
        .lede { color: #47453f; font-size: 0.95rem; margin: 0 0 1.4em; }
        .delivery { font-family: ${DISPLAY}; font-size: 0.76rem; letter-spacing: 0.02em; padding: 0.65em 0.85em; margin: -0.55em 0 1.2em; border: 1px solid var(--white-smoke-2, #ebebe7); background: var(--white-3, #fffefc); }
        .delivery--sent { border-color: var(--foreground, #35332f); box-shadow: 0 2px 8px rgba(218,255,0,0.4); }
        .delivery--failed { color: #47453f; }
        .note { font-family: ${DISPLAY}; font-size: 0.78rem; letter-spacing: 0.02em; text-transform: uppercase; color: #47453f; background: var(--white-3, #fffefc); border: 1px solid var(--white-smoke-2, #ebebe7); border-radius: 10px; padding: 0.7em 1em; margin: 0 0 1.2em; }

        .loading { display: flex; align-items: center; gap: 0.9em; border: 1px solid var(--white-smoke-2, #ebebe7); background: var(--white-3, #fffefc); border-radius: 14px; box-shadow: 0 4px 18px rgba(0,0,0,0.07); padding: 1.2em 1.3em; }
        .loading strong { font-family: ${DISPLAY}; font-weight: 600; display: block; }
        .loading-sub { display: block; color: #47453f; font-size: 0.88rem; margin-top: 0.15em; }
        .spin { width: 20px; height: 20px; flex: 0 0 auto; border-radius: 100%; border: 3px solid var(--white-smoke-2, #ebebe7); border-top-color: var(--yellow, #daff00); animation: aivc-spin 0.8s linear infinite; }
        @keyframes aivc-spin { to { transform: rotate(360deg); } }

        .check { border: 1px solid var(--white-smoke-2, #ebebe7); background: var(--white-3, #fffefc); border-radius: 14px; box-shadow: 0 4px 18px rgba(0,0,0,0.07); padding: clamp(16px, 3.5vw, 22px); margin-bottom: 1.15em; }
        .check--spotlight { border-color: var(--foreground, #35332f); background: radial-gradient(circle farthest-corner at 100% 0%, rgba(218,255,0,0.38), rgba(238,251,157,0.25) 38%, var(--white-3, #fffefc) 70%); box-shadow: 0 6px 24px rgba(218,255,0,0.28); }
        .check-head { display: flex; align-items: baseline; justify-content: flex-start; gap: 0.65em; flex-wrap: wrap; text-align: left; margin: 0; padding: 0; }
        .check-title { font-family: ${DISPLAY}; font-weight: 500; font-size: 1.1rem; letter-spacing: -0.005em; margin: 0; padding: 0; text-align: left; text-indent: 0; }
        .tag { font-family: ${DISPLAY}; font-size: 0.64rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; padding: 0.35em 0.65em; border: 1px solid #47453f; color: #47453f; }
        .tag.good { background: var(--yellow, #daff00); color: var(--foreground, #35332f); border-color: var(--foreground, #35332f); }
        .tag.flag { background: var(--foreground, #35332f); color: var(--background, #faf9f6); border-color: var(--foreground, #35332f); }
        .tag.flat { background: transparent; }
        .rec { font-size: 0.94rem; margin: 0.5em 0 0.2em; }
        .check-note { color: #47453f; font-size: 0.92rem; margin: 0.35em 0 0; }

        .rivals { margin-top: 0.9em; }
        .rivals-label { font-family: ${DISPLAY}; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #47453f; }
        .chips { display: flex; flex-wrap: wrap; gap: 0.4em; margin-top: 0.4em; }
        .chip { font-size: 0.82rem; background: var(--background, #faf9f6); border: 1px solid var(--foreground, #35332f); padding: 0.3em 0.6em; border-radius: 100px; }

        .verdict { margin: 0.4em 0 1.3em; font-family: ${DISPLAY}; font-size: 1.15rem; font-weight: 400; line-height: 1.35; }
        .verdict-hl { background-image: linear-gradient(180deg, rgba(218,255,0,0.5), #daff00); background-repeat: no-repeat; background-position: 0 88%; background-size: 100% 0.4em; padding: 0 0.05em; }

        .tip { border: 1px dashed var(--antique-white, #dac9bb); border-radius: 12px; padding: 16px 18px; margin-bottom: 1.15em; }
        .tip h4 { font-family: ${DISPLAY}; font-weight: 600; font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.4em; }
        .tip p { margin: 0; color: #47453f; font-size: 0.9rem; }

        .cta { background: var(--foreground, #35332f); color: var(--background, #faf9f6); border-radius: 16px; box-shadow: 0 8px 28px rgba(0,0,0,0.16); padding: clamp(20px, 4vw, 30px); margin-top: 0.3em; }
        .cta h3 { font-family: ${DISPLAY}; font-weight: 400; font-size: 1.25rem; margin: 0 0 0.45em; text-wrap: balance; }
        .cta p { margin: 0 0 1.2em; opacity: 0.85; font-size: 0.94rem; }
        .cta a { display: inline-block; text-decoration: none; font-family: ${DISPLAY}; font-weight: 600; font-size: 0.82rem; letter-spacing: 0.09em; text-transform: uppercase; background: var(--background, #faf9f6); color: var(--foreground, #35332f); border: 1px solid var(--background, #faf9f6); border-radius: 0; box-shadow: 0 2px 8px 0 rgba(218,255,0,0.7); padding: 0.85em 1.35em; transition: all 0.4s ${EASE}; }
        .cta a:hover { background: linear-gradient(96deg, #faf9f6, #daff00); color: var(--foreground, #35332f); box-shadow: 2px 9px 22px 2px rgba(218,255,0,0.55); transform: translateY(-1px); }
        .cta a:focus-visible { outline: 2px solid var(--yellow, #daff00); outline-offset: 3px; }

        .restart { display: block; margin: 1.3em auto 0; background: none; border: none; cursor: pointer; color: var(--grey-2, #7a776f); font-family: ${BODY}; font-size: 0.85rem; text-decoration: underline; text-underline-offset: 3px; }
        .restart:hover { color: var(--foreground, #35332f); }
        .foot { display: flex; align-items: center; gap: 0.5em; justify-content: center; margin-top: 1.9em; padding-top: 1.2em; border-top: 1px solid var(--white-smoke-2, #ebebe7); color: var(--grey-2, #7a776f); font-family: ${DISPLAY}; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }

        .preview { border: 1px solid var(--foreground, #35332f); background: var(--white-3, #fffefc); border-radius: 12px; padding: 14px 16px; margin: 0 0 1.4em; box-shadow: 0 2px 10px rgba(218,255,0,0.25); }
        .preview-label { font-family: ${DISPLAY}; font-weight: 600; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--grey-2, #7a776f); margin: 0 0 0.7em; }
        .preview-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.55em; }
        .preview-list li { font-family: ${MONO}; font-size: 0.8rem; line-height: 1.5; color: var(--foreground, #35332f); }
        .ptag { display: inline-block; font-family: ${DISPLAY}; font-size: 0.6rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--grey-2, #7a776f); background: var(--background, #faf9f6); border: 1px solid var(--white-smoke-2, #ebebe7); padding: 0.12em 0.5em; margin-right: 0.55em; vertical-align: 1px; }
        .preview-note { font-size: 0.8rem; color: #47453f; margin: 0.8em 0 0; }
        .asked { margin-top: 0.9em; }
        .asked-label { font-family: ${DISPLAY}; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #47453f; }
        .asked-list { margin: 0.4em 0 0; padding: 0 0 0 1.1em; }
        .asked-list li { font-family: ${MONO}; font-size: 0.76rem; line-height: 1.5; color: #47453f; margin-bottom: 0.3em; }
        .engine { font-family: ${DISPLAY}; font-size: 0.66rem; letter-spacing: 0.06em; color: var(--grey-2, #7a776f); text-align: center; margin: 1.3em 0 0; }

        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } .btn-primary, .cta a { transition: none; } }
      `}</style>
    </section>
  );
}
