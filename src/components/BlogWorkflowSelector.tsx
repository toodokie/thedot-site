'use client';

import { useState } from 'react';

const routes = {
  canva: {
    number: '01',
    anchor: '#route-canva',
    question: 'Already make posts in Canva?',
    title: 'Keep Canva as your home base.',
    steps: [
      'Add your approved logo, colours and fonts to Brand Kit.',
      'Save one 9:16 Reel master with a title, captions and end card.',
      'Duplicate it, swap the real footage, review at phone size and export.'
    ],
    note: 'Best when your main slowdown is rebuilding the layout.'
  },
  chatgpt: {
    number: '02',
    anchor: '#route-chatgpt',
    question: 'Draft your words in ChatGPT?',
    title: 'Let ChatGPT write. Finish in Canva.',
    steps: [
      'Put the approved pack and voice rules in a ChatGPT Project.',
      'Ask for one hook, four short scenes and a caption. Check every claim.',
      'Connect Canva, copy your approved Reel master and finish the video there.'
    ],
    note: 'Best when the blank caption or script slows you down.'
  },
  claude: {
    number: '03',
    anchor: '#route-claude',
    question: 'Want Claude to shape the look?',
    title: 'Design in Claude. Edit where you already edit.',
    steps: [
      'Give Claude Design your approved brand pack and visual examples.',
      'Ask for a four-scene 9:16 storyboard, title style and end card.',
      'Build the real-footage Reel in your usual video editor. Canva is optional.'
    ],
    note: 'Best when you want a clearer visual direction before the edit.'
  }
} as const;

type Route = keyof typeof routes;

export default function BlogWorkflowSelector() {
  const [selected, setSelected] = useState<Route>('canva');
  const route = routes[selected];

  return (
    <section className="selector" aria-labelledby="workflow-selector-title">
      <div className="heading">
        <p className="eyebrow">THE DOT / FIELD GUIDE</p>
        <h2 id="workflow-selector-title">Pick your <em>starting point.</em></h2>
        <p>Choose the tool you already use. The guide below shows the full setup for each route.</p>
      </div>

      <div className="choices" role="group" aria-label="Choose your Reel workflow">
        {(Object.keys(routes) as Route[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`choice ${selected === key ? 'selected' : ''}`}
            aria-pressed={selected === key}
            onClick={() => setSelected(key)}
          >
            <span className="choiceNumber">{routes[key].number} /</span>
            <span>{routes[key].question}</span>
          </button>
        ))}
      </div>

      <div className="answer" aria-live="polite" aria-atomic="true">
        <div className="answerHeader">
          <span className="answerNumber">{route.number}</span>
          <h3>{route.title}</h3>
        </div>
        <ol>
          {route.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <div className="answerFooter">
          <p className="note">{route.note}</p>
          <a href={route.anchor}>Read the full setup <span aria-hidden="true">↓</span></a>
        </div>
      </div>

      <style jsx>{`
        .selector {
          max-width: 1160px;
          margin: 10px auto 70px;
          padding: 38px;
          border: 1px solid #242424;
          background: #f5f2eb;
          color: #242424;
          font-family: ff-real-text-pro, sans-serif;
        }
        .heading { max-width: 720px; }
        .eyebrow {
          margin: 0 0 16px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.15em;
        }
        h2 {
          margin: 0;
          font-family: futura-pt, sans-serif;
          font-size: clamp(2.4rem, 5vw, 4.7rem);
          font-weight: 300;
          line-height: 0.98;
        }
        h2 em {
          font-family: ff-real-text-pro, sans-serif;
          font-size: 0.75em;
          font-weight: 300;
        }
        .heading > p:last-child {
          margin: 22px 0 28px;
          font-size: 1rem;
          line-height: 1.5;
        }
        .choices {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .choice {
          min-height: 112px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          padding: 16px 18px;
          border: 1px solid #242424;
          background: #fffdfa;
          color: #242424;
          font: 600 1.05rem/1.25 ff-real-text-pro, sans-serif;
          text-align: left;
          cursor: pointer;
          transition: background-color 140ms ease;
        }
        .choice:not(.selected):hover { background: #f0eee6; }
        .choice:focus-visible { outline: 3px solid #242424; outline-offset: 3px; }
        .choice.selected { background: #daff00; }
        .choiceNumber {
          font: 700 0.78rem/1 ff-real-text-pro, sans-serif;
          letter-spacing: 0.1em;
        }
        .answer {
          margin-top: 8px;
          padding: 25px 28px 24px;
          border: 1px solid #242424;
          background: #fffdfa;
        }
        .answerHeader { display: flex; align-items: baseline; gap: 16px; }
        .answerNumber { font-size: 0.85rem; font-weight: 700; }
        h3 {
          margin: 0;
          font-family: futura-pt, sans-serif;
          font-size: clamp(1.65rem, 3vw, 2.4rem);
          font-weight: 400;
          line-height: 1.1;
        }
        ol {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin: 24px 0 18px;
          padding: 0;
          list-style: none;
          counter-reset: step;
        }
        li {
          padding-top: 12px;
          border-top: 1px solid #242424;
          font-size: 0.96rem;
          line-height: 1.45;
          counter-increment: step;
        }
        li::before {
          content: '0' counter(step) ' /';
          display: block;
          margin-bottom: 9px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
        }
        .answerFooter {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 18px;
        }
        .note { margin: 0; font-size: 0.9rem; font-style: italic; }
        .answerFooter a {
          color: #242424;
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          white-space: nowrap;
        }
        .answerFooter a:focus-visible { outline: 3px solid #242424; outline-offset: 3px; }
        @media (max-width: 760px) {
          .selector { margin: 0 16px 55px; padding: 24px 18px; }
          .choices, ol { grid-template-columns: 1fr; }
          .choice { min-height: 76px; }
          .answer { padding: 22px 18px; }
          .answerHeader { gap: 10px; }
          ol { gap: 13px; }
          .answerFooter { align-items: flex-start; flex-direction: column; }
        }
        @media (prefers-reduced-motion: reduce) {
          .choice { transition: none; }
        }
      `}</style>
    </section>
  );
}
