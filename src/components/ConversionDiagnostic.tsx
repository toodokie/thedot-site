'use client';

import { useState } from 'react';
import Link from 'next/link';

interface DiagnosticCard {
  id: string;
  title: string;
  icon: string;
  questions: string[];
  quickWin: string;
  benchmark: string;
}

const diagnosticSteps: DiagnosticCard[] = [
  {
    id: 'visitor-analysis',
    title: 'Visitor Analysis',
    icon: '📊',
    questions: [
      'How many visitors monthly?',
      'Where from?',
      'How long stay?'
    ],
    quickWin: 'Increase engagement by 40% in 30 days',
    benchmark: 'Industry: 2-3 min average session'
  },
  {
    id: 'conversion-forensics',
    title: 'Conversion Forensics',
    icon: '💰',
    questions: [
      'What % become leads?',
      'What % become customers?',
      'Where drop off?'
    ],
    quickWin: 'Fix biggest leak for immediate impact',
    benchmark: 'Industry: 2-3% visitor to lead'
  },
  {
    id: 'tool-chaos-audit',
    title: 'Tool Chaos Audit',
    icon: '🔧',
    questions: [
      'List all subscriptions',
      'Monthly total cost?',
      'How many passwords?'
    ],
    quickWin: 'Save $300-500/month consolidating',
    benchmark: 'Industry: 5-7 tools average'
  },
  {
    id: 'time-drain-calculator',
    title: 'Time Drain Calculator',
    icon: '⏰',
    questions: [
      'Hours on manual entry?',
      'Time switching tools?',
      'Duplicate work?'
    ],
    quickWin: 'Save 5-10 hours/week with automation',
    benchmark: 'Industry: 8 hours/week on admin'
  },
  {
    id: 'growth-gap-identifier',
    title: 'Growth Gap Identifier',
    icon: '🚀',
    questions: [
      'Leads lost to slow follow-up?',
      'Sales missed from poor tracking?',
      'Revenue lost to friction?'
    ],
    quickWin: 'Identify biggest opportunity in 15 minutes',
    benchmark: 'Industry: 23% leads lost to slow response'
  }
];

export default function ConversionDiagnostic() {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const toggleCard = (cardId: string) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  return (
    <>
      <style jsx>{`
        .conversion-diagnostic {
          background: var(--raw-white);
          padding: 120px 0;
          font-family: ff-real-text-pro-2, sans-serif;
        }

        .diagnostic-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 40px;
        }

        .diagnostic-header {
          text-align: center;
          margin-bottom: 80px;
        }

        .diagnostic-header h2 {
          font-family: futura-pt, sans-serif;
          font-size: 3rem;
          font-weight: 400;
          color: var(--black);
          margin-bottom: 20px;
          line-height: 1.2;
        }

        .diagnostic-header h3 {
          font-family: futura-pt, sans-serif;
          font-size: 2.2rem;
          font-weight: 300;
          color: var(--black);
          margin-bottom: 15px;
          line-height: 1.3;
        }

        .diagnostic-subtitle {
          font-size: 1.2rem;
          color: #666;
          line-height: 1.4;
          max-width: 600px;
          margin: 0 auto;
        }

        .diagnostic-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 30px;
          margin-bottom: 60px;
        }

        .diagnostic-card {
          background: #fff;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease-in-out;
          cursor: pointer;
        }

        .diagnostic-card:hover {
          border-color: var(--yellow);
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }

        .card-header {
          padding: 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          user-select: none;
        }

        .card-header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .card-icon {
          font-size: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 60px;
          height: 60px;
          background: var(--yellow);
          border-radius: 50%;
          border: 2px solid var(--black);
        }

        .card-title {
          font-family: futura-pt, sans-serif;
          font-size: 1.4rem;
          font-weight: 400;
          color: var(--black);
          margin: 0;
        }

        .card-chevron {
          font-size: 1.5rem;
          color: var(--black);
          transition: transform 0.3s ease-in-out;
        }

        .card-chevron.expanded {
          transform: rotate(180deg);
        }

        .card-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-in-out;
        }

        .card-content.expanded {
          max-height: 500px;
        }

        .card-content-inner {
          padding: 0 30px 30px;
        }

        .questions-list {
          margin-bottom: 25px;
        }

        .questions-title {
          font-weight: 600;
          color: var(--black);
          margin-bottom: 15px;
          font-size: 1rem;
        }

        .questions-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .questions-list li {
          padding: 8px 0;
          color: #555;
          font-size: 0.95rem;
          position: relative;
          padding-left: 20px;
        }

        .questions-list li:before {
          content: '•';
          color: var(--yellow);
          font-weight: bold;
          position: absolute;
          left: 0;
        }

        .quick-win-box {
          background: var(--yellow);
          border: 2px solid var(--black);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .quick-win-title {
          font-weight: 600;
          color: var(--black);
          margin-bottom: 8px;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .quick-win-text {
          color: var(--black);
          font-size: 1rem;
          font-weight: 500;
          margin: 0;
        }

        .benchmark {
          background: #f8f9fa;
          border-left: 4px solid var(--black);
          padding: 15px 20px;
          border-radius: 4px;
        }

        .benchmark-title {
          font-weight: 600;
          color: var(--black);
          margin-bottom: 5px;
          font-size: 0.9rem;
        }

        .benchmark-text {
          color: #666;
          font-size: 0.9rem;
          margin: 0;
        }

        .diagnostic-cta {
          text-align: center;
          padding-top: 40px;
          border-top: 2px solid #e0e0e0;
        }

        .cta-button {
          display: inline-block;
          background: var(--black);
          color: white;
          padding: 20px 40px;
          font-size: 1.1rem;
          font-weight: 600;
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.3s ease-in-out;
          margin-bottom: 15px;
        }

        .cta-button:hover {
          background: var(--yellow);
          color: var(--black);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .cta-helper {
          color: #666;
          font-size: 0.9rem;
          font-style: italic;
        }

        /* Mobile styles */
        @media (max-width: 768px) {
          .conversion-diagnostic {
            padding: 80px 0;
          }

          .diagnostic-container {
            padding: 0 20px;
          }

          .diagnostic-header h2 {
            font-size: 2.5rem;
          }

          .diagnostic-header h3 {
            font-size: 1.8rem;
          }

          .diagnostic-subtitle {
            font-size: 1.1rem;
          }

          .diagnostic-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .card-header {
            padding: 25px 20px;
          }

          .card-content-inner {
            padding: 0 20px 25px;
          }

          .card-icon {
            width: 50px;
            height: 50px;
            font-size: 1.5rem;
          }

          .card-title {
            font-size: 1.2rem;
          }

          .cta-button {
            padding: 18px 35px;
            font-size: 1rem !important;
          }
        }

        /* Color variables */
        :root {
          --black: #35332f;
          --raw-white: #faf9f6;
          --yellow: #daff00;
        }
      `}</style>

      <section className="conversion-diagnostic">
        <div className="diagnostic-container">
          <div className="diagnostic-header">
            <h2>Not Sure Which Package You Need?</h2>
            <h3>Take Our Free 5-Minute Conversion Diagnostic</h3>
            <p className="diagnostic-subtitle">
              Discover exactly where your website is leaking revenue
            </p>
          </div>

          <div className="diagnostic-grid">
            {diagnosticSteps.map((step) => (
              <div key={step.id} className="diagnostic-card">
                <div 
                  className="card-header"
                  onClick={() => toggleCard(step.id)}
                >
                  <div className="card-header-left">
                    <div className="card-icon">
                      {step.icon}
                    </div>
                    <h4 className="card-title">{step.title}</h4>
                  </div>
                  <div className={`card-chevron ${expandedCard === step.id ? 'expanded' : ''}`}>
                    ▼
                  </div>
                </div>

                <div className={`card-content ${expandedCard === step.id ? 'expanded' : ''}`}>
                  <div className="card-content-inner">
                    <div className="questions-list">
                      <div className="questions-title">Key Questions:</div>
                      <ul>
                        {step.questions.map((question, index) => (
                          <li key={index}>{question}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="quick-win-box">
                      <div className="quick-win-title">Quick Win</div>
                      <p className="quick-win-text">{step.quickWin}</p>
                    </div>

                    <div className="benchmark">
                      <div className="benchmark-title">Industry Benchmark</div>
                      <p className="benchmark-text">{step.benchmark}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="diagnostic-cta">
            <Link href="/conversion-diagnostic" className="cta-button">
              Start Your Free Diagnostic
            </Link>
            <p className="cta-helper">No email required. Get instant results.</p>
          </div>
        </div>
      </section>
    </>
  );
}