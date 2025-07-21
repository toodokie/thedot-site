'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Answer {
  leads?: string;
  manual?: string;
  systems?: string;
  aoda?: string;
  brand?: string;
}

interface Question {
  id: string;
  text: string;
  options: { text: string; points: number; fullText?: string }[];
  benchmark?: string;
  dynamicText?: (answer: string) => string;
}

const questions: Question[] = [
  {
    id: 'leads',
    text: 'For every 10 qualified leads your website generates, how many become paying clients?',
    options: [
      { text: 'Fewer than 1', points: 10, fullText: 'Fewer than 1' },
      { text: '1-2', points: 20, fullText: '1-2 (The Industry Average)' },
      { text: '3-4', points: 30, fullText: '3-4 (You\'re Doing Well!)' },
      { text: '5+', points: 40, fullText: '5+ (You\'re a Pro!)' }
    ],
    benchmark: 'Benchmark: A typical lead-to-client conversion rate is 10-20%. Anything less may signal a problem with your follow-up process.'
  },
  {
    id: 'manual',
    text: 'How many hours does your team spend weekly on manual administrative work (like data entry, invoicing, or scheduling)?',
    options: [
      { text: '10+ hours', points: 10 },
      { text: '5-10 hours', points: 20 },
      { text: '2-5 hours', points: 30 },
      { text: 'Fewer than 2 hours', points: 40 }
    ],
    benchmark: 'Hint: 5 hours a week is 260 hours a year. That\'s over 6 full work weeks!'
  },
  {
    id: 'systems',
    text: 'When a new customer pays you, how many separate software tools does your team have to manually update?',
    options: [
      { text: 'So. Many. Clicks.', points: 10, fullText: 'So. Many. Clicks.' },
      { text: '4-5', points: 20, fullText: '4-5 (That\'s a lot of clicks)' },
      { text: '2-3', points: 30, fullText: '2-3 (Getting complicated)' },
      { text: 'Just 1', points: 40, fullText: 'Just 1 (You\'re integrated!)' }
    ],
    benchmark: 'Hint: Every manual update is a potential point of failure, risking costly data entry errors and wasted time.'
  },
  {
    id: 'aoda',
    text: 'As an Ontario business, are you confident your website meets mandatory AODA accessibility standards?',
    options: [
      { text: 'Yes, professionally audited.', points: 40 },
      { text: 'I think so, but I\'m not sure.', points: 20 },
      { text: 'No, it\'s something we need to address.', points: 10 },
      { text: 'What is AODA?', points: 0 }
    ],
    benchmark: 'Hint: Non-compliance can risk fines of up to $100,000/day, and inaccessible sites miss out on over 27% of Canadian consumers.'
  },
  {
    id: 'brand',
    text: 'Honestly, does your current website make your business look more or less professional than your top competitor?',
    options: [
      { text: 'It\'s embarrassing, frankly.', points: 10 },
      { text: 'Less Professional. It needs work.', points: 20 },
      { text: 'About the same.', points: 30 },
      { text: 'More Professional. We\'re proud of it.', points: 40 }
    ],
    benchmark: 'Benchmark: 94% of first impressions relate to your site\'s design. A professional site builds instant trust and credibility.'
  }
];

export default function ConversionDiagnosticTool() {
  const [screen, setScreen] = useState(0);
  const [answers, setAnswers] = useState<Answer>({});
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [showFullText, setShowFullText] = useState<string>('');

  useEffect(() => {
    // Load from sessionStorage on mount
    const savedAnswers = sessionStorage.getItem('diagnostic-answers');
    if (savedAnswers) {
      setAnswers(JSON.parse(savedAnswers));
    }
  }, []);

  const handleAnswer = (questionId: string, answer: string, points: number, fullText?: string) => {
    const newAnswers = { ...answers, [questionId]: answer };
    setAnswers(newAnswers);
    setSelectedAnswer(answer);
    
    // Check if text changes when pressed
    const hasTextChange = fullText && fullText !== answer;
    
    // Show full text if available
    if (hasTextChange) {
      setShowFullText(fullText);
      setTimeout(() => setShowFullText(''), 2000);
    }
    
    // Save to sessionStorage
    sessionStorage.setItem('diagnostic-answers', JSON.stringify(newAnswers));
    
    // Calculate score when we have all answers
    if (screen === 5) {
      const totalScore = Object.keys(newAnswers).reduce((total, key) => {
        const question = questions.find(q => q.id === key);
        const option = question?.options.find(opt => opt.text === newAnswers[key as keyof Answer]);
        return total + (option?.points || 0);
      }, 0);
      setScore(totalScore);
    }
    
    // Auto-advance after selection - immediate if no text change, delayed if text changes
    const delay = hasTextChange ? 2500 : 500;
    setTimeout(() => {
      setScreen(screen + 1);
      setSelectedAnswer('');
      setShowFullText('');
    }, delay);
  };

  const calculateScores = () => {
    const leadsPoints = questions.find(q => q.id === 'leads')?.options.find(opt => opt.text === answers.leads)?.points || 0;
    const brandPoints = questions.find(q => q.id === 'brand')?.options.find(opt => opt.text === answers.brand)?.points || 0;
    const manualPoints = questions.find(q => q.id === 'manual')?.options.find(opt => opt.text === answers.manual)?.points || 0;
    const systemsPoints = questions.find(q => q.id === 'systems')?.options.find(opt => opt.text === answers.systems)?.points || 0;
    
    const presenceScore = leadsPoints + brandPoints;
    const efficiencyScore = manualPoints + systemsPoints;
    
    const aodaRisk = answers.aoda !== 'Yes, professionally audited.';
    
    return { presenceScore, efficiencyScore, aodaRisk };
  };

  const getResultContent = () => {
    const { presenceScore, efficiencyScore, aodaRisk } = calculateScores();
    
    const getManualHours = () => {
      const hours = {
        '10+ hours': '10+ hours',
        '5-10 hours': '5-10 hours',
        '2-5 hours': '2-5 hours',
        'Fewer than 2 hours': 'fewer than 2 hours'
      };
      return hours[answers.manual as keyof typeof hours] || 'several hours';
    };

    const getYearlyHours = () => {
      const weeklyHours = {
        '10+ hours': 15,
        '5-10 hours': 7.5,
        '2-5 hours': 3.5,
        'Fewer than 2 hours': 1
      };
      const weekly = weeklyHours[answers.manual as keyof typeof weeklyHours] || 7.5;
      return Math.round(weekly * 52);
    };

    let result;

    // Primary logic: Efficiency Score < 55
    if (efficiencyScore < 55) {
      result = {
        headline: "Your Biggest Hidden Cost is Manual Work",
        diagnosis: `Based on your answers, your business is spending over **${getManualHours()}** on manual administrative tasks. That's more than **${getYearlyHours()} hours** of valuable time lost to updating disconnected software. While your website may be performing adequately, the real opportunity for growth lies in automating the work that happens behind the scenes.`,
        recommendation: "Connected Business System",
        description: "This is our flagship service for businesses ready to eliminate manual work and integrate their operations into one seamless system.",
        cta: "Schedule a Free Strategy Call"
      };
    }
    // Secondary logic: Presence Score < 55
    else if (presenceScore < 55) {
      result = {
        headline: "Your Digital First Impression is Costing You Clients",
        diagnosis: "Based on your answers, your website is not converting leads effectively and may not appear as professional as your competitors. This creates a leaky bucket—even if your internal systems are efficient, you're losing customers at the front door before they even get a chance to see your value.",
        recommendation: "Professional Foundation",
        description: "Our first step is to build you a strategic, high-performing website that commands respect, builds trust, and turns visitors into high-quality leads.",
        cta: "Schedule a Free Strategy Call"
      };
    }
    // Tertiary logic: Both scores 55+
    else {
      result = {
        headline: "You've Built a Solid Foundation. Now it's Time to Optimize",
        diagnosis: "Congratulations! You have a strong digital presence and solid operational processes. Your business is in the top tier, and the next stage of growth comes from targeted, expert-level optimizations to outperform the competition and maximize your profitability.",
        recommendation: "Design & Consulting Services",
        description: "We can help you achieve incremental growth through advanced strategies like an in-depth AODA Compliance Audit, advanced Conversion Rate Optimization, or strategic Brand Refinement.",
        cta: "Explore Consulting Options"
      };
    }

    return { ...result, aodaRisk, presenceScore, efficiencyScore };
  };

  const renderWelcomeScreen = () => (
    <div className="quiz-screen welcome-screen">
      <div className="welcome-content">
        <div className="quiz-headline">The Hidden Revenue Finder</div>
        <p className="quiz-subhead">Your business is likely losing money to inefficient systems and manual processes. Our 2-minute audit will show you exactly where.</p>
        <button 
          className="services-cta-button"
          onClick={() => setScreen(1)}
        >
          Start Quiz
        </button>
        <p className="quiz-small-text">No email required • Instant results</p>
      </div>
    </div>
  );

  const renderQuestionScreen = () => {
    const currentQuestion = questions[screen - 1];
    const currentAnswer = answers[currentQuestion.id as keyof Answer];

    return (
      <div className="quiz-screen question-screen">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(screen / 5) * 100}%` }}></div>
        </div>
        <p className="progress-text">Question {screen} of 5</p>
        
        <h3 className="question-text">{currentQuestion.text}</h3>
        
        {currentQuestion.benchmark && (
          <p className="benchmark-text">{currentQuestion.benchmark}</p>
        )}

        {currentQuestion.dynamicText && selectedAnswer && (
          <p className="dynamic-text">{currentQuestion.dynamicText(selectedAnswer)}</p>
        )}
        
        <div className="answer-buttons">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              className={`answer-button ${selectedAnswer === option.text ? 'selected' : ''}`}
              onClick={() => handleAnswer(currentQuestion.id, option.text, option.points, option.fullText)}
            >
              {selectedAnswer === option.text && option.fullText ? option.fullText : option.text}
            </button>
          ))}
        </div>
        
        {screen > 1 && (
          <button 
            className="back-button"
            onClick={() => setScreen(screen - 1)}
          >
            ← Back
          </button>
        )}
      </div>
    );
  };

  const renderResultsScreen = () => {
    const result = getResultContent();

    return (
      <div className="quiz-screen results-screen">
        <h2 className="results-headline">{result.headline}</h2>
        
        <div className="diagnosis" style={{ margin: '2rem 0', lineHeight: 1.6, fontSize: '1rem' }}>
          <p dangerouslySetInnerHTML={{ __html: result.diagnosis }}></p>
        </div>
        
        <div className="recommendation">
          <p><strong>Primary Recommendation:</strong> {result.recommendation}</p>
          <p className="recommendation-reason">{result.description}</p>
        </div>
        
        {result.aodaRisk && (
          <div className="secondary-priority" style={{ 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffeaa7', 
            padding: '1rem', 
            margin: '1rem 0',
            borderRadius: '4px'
          }}>
            <p><strong>Secondary Priority:</strong> AODA Compliance Review</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>
              Based on your answers, your website may not meet Ontario's accessibility standards, which could expose your business to significant legal and financial risks.
            </p>
          </div>
        )}
        
        <div className="results-actions">
          <Link 
            href={result.recommendation.includes("Consulting") ? "/estimate" : "/contacts"} 
            className="services-cta-button primary"
          >
            {result.cta}
          </Link>
        </div>
        
        <button 
          className="restart-button"
          onClick={() => {
            setScreen(0);
            setAnswers({});
            setScore(0);
            sessionStorage.removeItem('diagnostic-answers');
          }}
        >
          Take Quiz Again
        </button>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .diagnostic-tool-section {
          background: var(--raw-white);
          padding: 2rem 2.5rem 120px 2.5rem;
          font-family: ff-real-text-pro, sans-serif;
        }

        .quiz-container {
          width: 100%;
          margin: 0 auto;
          padding: 0 40px;
          border: 1px solid #35332f;
          background: var(--raw-white);
          border-radius: 1rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .quiz-screen {
          padding: 40px 0;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }

        .quiz-screen.welcome-screen {
          justify-content: center;
        }

        .quiz-screen.question-screen {
          justify-content: flex-start;
          padding-top: 20px;
        }

        .welcome-content {
          max-width: 600px;
          margin: 0 auto;
        }

        .quiz-headline {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(2.5rem, 5vw, 3.5rem);
          font-weight: 300;
          color: var(--foreground);
          margin: 0;
          padding-top: 2rem;
          padding-bottom: 0;
          line-height: 1.2;
          display: block;
        }

        .quiz-subhead {
          font-family: 'futura-pt', Arial, Helvetica, sans-serif;
          font-size: 1.4rem;
          font-weight: 300;
          line-height: 1.4;
          color: #7a776f;
          margin: 0 auto;
          margin-top: 1rem;
          margin-bottom: 40px;
          padding: 0;
          max-width: 60rem;
          text-align: center;
        }


        .services-cta-button.secondary {
          background: transparent;
          color: var(--foreground);
          border-color: var(--foreground);
        }

        .services-cta-button.secondary:hover {
          background: var(--foreground);
          color: var(--raw-white);
        }

        .quiz-small-text {
          font-size: 0.875rem;
          color: #888;
          margin-top: 20px;
          font-style: italic;
        }

        .progress-bar {
          width: 100%;
          height: 4px;
          background: #e0e0e0;
          margin-bottom: 10px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--yellow);
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 0.875rem;
          color: #666;
          margin-bottom: 40px;
          text-align: left;
        }

        .question-text {
          font-family: futura-pt, sans-serif;
          font-size: 1.6rem;
          font-weight: 500;
          color: var(--foreground);
          margin-top: 1rem;
          margin-bottom: 1rem;
          line-height: 1.3;
          border-bottom: 2px solid var(--yellow);
          padding: 1rem 0;
          position: relative;
        }

        .question-text::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 60px;
          height: 2px;
          background-color: var(--foreground);
        }

        .answer-buttons {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin: 2rem 0;
        }

        .answer-button {
          background: transparent;
          color: var(--foreground);
          padding: 18px 36px;
          border: 1px solid #ccc;
          font-family: ff-real-text-pro, sans-serif;
          font-size: 1rem;
          font-weight: 400;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-block;
          margin: 0;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .answer-button:hover {
          background: linear-gradient(135deg, rgba(218, 255, 0, 0.4) 0%, var(--raw-white) 100%);
          color: var(--foreground);
          border-color: var(--foreground);
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .answer-button:active {
          animation: buttonPress 0.3s ease-out;
        }

        @keyframes buttonPress {
          0% {
            transform: translateY(-2px) scale(1);
          }
          50% {
            transform: translateY(0) scale(0.98);
          }
          100% {
            transform: translateY(-2px) scale(1);
          }
        }

        .answer-button.selected {
          background: linear-gradient(135deg, rgba(218, 255, 0, 0.4) 0%, var(--raw-white) 100%);
          color: var(--foreground);
          border-color: var(--foreground);
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .benchmark-text {
          font-size: 0.875rem;
          color: #666;
          font-style: italic;
          margin-top: 20px;
        }

        .dynamic-text {
          font-size: 1rem;
          color: var(--foreground);
          font-weight: 600;
          margin: 1rem 0;
          padding: 15px 20px;
          background: var(--yellow);
          border-radius: 4px;
          display: block;
          text-align: center;
        }

        .back-button {
          background: transparent;
          border: 2px solid var(--foreground);
          color: var(--foreground);
          padding: 12px 24px;
          font-family: futura-pt, sans-serif;
          font-size: 1rem;
          font-weight: 300;
          cursor: pointer;
          margin-top: 30px;
          align-self: flex-start;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          background: transparent;
          color: var(--foreground);
          transform: translateY(-2px);
        }

        .score-gauge {
          margin-bottom: 20px;
        }

        .gauge-container {
          width: 100%;
          height: 20px;
          background: #e0e0e0;
          position: relative;
          overflow: hidden;
        }

        .gauge-fill {
          height: 100%;
          transition: width 1s ease;
          background: var(--yellow);
        }

        .results-headline {
          font-family: futura-pt, sans-serif;
          font-size: 2.2rem;
          font-weight: 300;
          color: var(--foreground);
          margin-bottom: 20px;
          line-height: 1.2;
        }

        .results-score {
          font-family: futura-pt, sans-serif;
          font-size: 4rem;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 30px;
          line-height: 1;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
        }

        .results-subhead {
          font-size: 1rem;
          color: #666;
          margin-bottom: 30px;
          line-height: 1.4;
        }

        .lost-revenue {
          background: transparent;
          border: 1px solid var(--foreground);
          padding: 20px;
          margin-bottom: 30px;
          border-radius: 4px;
        }

        .recommendation {
          margin-bottom: 40px;
          padding: 20px;
          background: #f8f9fa;
          border-left: 4px solid var(--yellow);
        }

        .recommendation-reason {
          margin-top: 10px;
          color: #666;
          font-style: italic;
        }

        .results-actions {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .restart-button {
          background: transparent;
          border: none;
          color: var(--foreground);
          padding: 0;
          font-family: futura-pt, sans-serif;
          font-size: 1rem;
          cursor: pointer;
          text-decoration: underline;
          margin-top: 50px;
          transition: all 0.3s ease;
        }

        .restart-button:hover {
          color: #666;
          transform: none;
        }

        /* Mobile styles */
        @media (max-width: 1239px) {
          .diagnostic-tool-section {
            padding: 2rem 2rem 120px 2rem;
          }
        }

        @media (max-width: 999px) {
          .diagnostic-tool-section {
            padding: 2rem 1.5rem 2rem 1.5rem;
          }
        }

        @media (max-width: 480px) {
          .diagnostic-tool-section {
            padding: 2rem 1rem 2rem 1rem;
          }
        }

        @media (max-width: 768px) {
          .quiz-container {
            padding: 0 20px;
          }

          .quiz-screen {
            padding: 40px 0;
          }

          .quiz-headline {
            font-size: 2rem;
          }

          .question-text {
            font-size: 1.4rem !important;
          }

          .answer-button {
            font-size: 1rem;
            padding: 16px 20px;
            min-height: 55px;
          }

          .results-score {
            font-size: 3rem;
          }

          .quiz-subhead {
            font-size: 1.125rem;
          }

          .results-actions {
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }

          .services-cta-button {
            width: 100%;
            max-width: 300px;
            margin: 0 auto;
          }
        }

        /* Color variables */
        :root {
          --foreground: var(--foreground);
          --raw-white: #faf9f6;
          --yellow: #daff00;
        }
      `}</style>

      <section className="diagnostic-tool-section">
        <div className="quiz-container">
          {screen === 0 && renderWelcomeScreen()}
          {screen >= 1 && screen <= 5 && renderQuestionScreen()}
          {screen === 6 && renderResultsScreen()}
        </div>
      </section>
    </>
  );
}