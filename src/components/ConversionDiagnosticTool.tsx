'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Answer {
  visitors?: string;
  conversion?: string;
  tools?: string;
  time?: string;
  speed?: string;
}

interface Question {
  id: string;
  text: string;
  options: { text: string; points: number }[];
  benchmark?: string;
  dynamicText?: (answer: string) => string;
}

const questions: Question[] = [
  {
    id: 'visitors',
    text: 'How many people visit your website monthly?',
    options: [
      { text: 'Under 500', points: 5 },
      { text: '500-2000', points: 10 },
      { text: '2000-5000', points: 15 },
      { text: '5000+', points: 20 },
      { text: 'Not sure', points: 0 }
    ]
  },
  {
    id: 'conversion',
    text: 'Out of 100 visitors, how many contact you?',
    options: [
      { text: '0-1 contacts', points: 0 },
      { text: '2-3 contacts', points: 10 },
      { text: '4-5 contacts', points: 15 },
      { text: '6+ contacts', points: 20 },
      { text: 'No idea', points: 0 }
    ],
    benchmark: 'Industry benchmark: 2-3% of visitors typically contact businesses'
  },
  {
    id: 'tools',
    text: 'How many different software tools do you use?',
    options: [
      { text: '1-2 tools', points: 20 },
      { text: '3-4 tools', points: 15 },
      { text: '5-6 tools', points: 10 },
      { text: '7+ tools', points: 5 },
      { text: 'Lost count', points: 0 }
    ],
    dynamicText: (answer: string) => {
      const costs = {
        '1-2 tools': 50,
        '3-4 tools': 150,
        '5-6 tools': 300,
        '7+ tools': 500,
        'Lost count': 800
      };
      return `That's roughly $${costs[answer as keyof typeof costs]}/month`;
    }
  },
  {
    id: 'time',
    text: 'Hours per week spent on repetitive tasks?',
    options: [
      { text: 'Under 2 hours', points: 20 },
      { text: '2-5 hours', points: 15 },
      { text: '5-10 hours', points: 10 },
      { text: '10+ hours', points: 5 },
      { text: 'Too many', points: 0 }
    ],
    dynamicText: (answer: string) => {
      const hours = {
        'Under 2 hours': 2,
        '2-5 hours': 3.5,
        '5-10 hours': 7.5,
        '10+ hours': 15,
        'Too many': 20
      };
      const yearly = Math.round(hours[answer as keyof typeof hours] * 52);
      return `That's ${yearly} hours/year you could save`;
    }
  },
  {
    id: 'speed',
    text: 'Count to 3. Is your mobile site fully loaded?',
    options: [
      { text: 'Yes, fast!', points: 20 },
      { text: 'Just finished', points: 15 },
      { text: 'Still loading', points: 5 },
      { text: 'Gave up', points: 0 }
    ],
    benchmark: '53% leave if it takes >3 seconds'
  }
];

export default function ConversionDiagnosticTool() {
  const [screen, setScreen] = useState(0);
  const [answers, setAnswers] = useState<Answer>({});
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');

  useEffect(() => {
    // Load from sessionStorage on mount
    const savedAnswers = sessionStorage.getItem('diagnostic-answers');
    if (savedAnswers) {
      setAnswers(JSON.parse(savedAnswers));
    }
  }, []);

  const handleAnswer = (questionId: string, answer: string, points: number) => {
    const newAnswers = { ...answers, [questionId]: answer };
    setAnswers(newAnswers);
    setSelectedAnswer(answer);
    
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
    
    // Auto-advance after selection with more time to read explainer
    setTimeout(() => {
      setScreen(screen + 1);
      setSelectedAnswer('');
    }, 2500);
  };

  const calculateLostRevenue = () => {
    const monthlyVisitors = {
      'Under 500': 250,
      '500-2000': 1250,
      '2000-5000': 3500,
      '5000+': 7500,
      'Not sure': 1000
    }[answers.visitors as keyof typeof monthlyVisitors] || 1000;

    const conversionRate = {
      '0-1 contacts': 0.5,
      '2-3 contacts': 2.5,
      '4-5 contacts': 4.5,
      '6+ contacts': 6,
      'No idea': 1
    }[answers.conversion as keyof typeof conversionRate] || 1;

    const optimalConversion = 3;
    const lostLeads = monthlyVisitors * Math.max(0, (optimalConversion - conversionRate) / 100);
    const lostRevenue = Math.round(lostLeads * 500 * 0.25 * 0.7); // Reduced by 30%
    
    return lostRevenue;
  };

  const getResultContent = () => {
    // Analyze answers to determine scenario
    const hasWebsite = answers.visitors !== 'Under 500' && answers.visitors !== 'Not sure';
    const hasSystemChaos = answers.tools === '7+ tools' || answers.tools === 'Lost count';
    const poorConversion = answers.conversion === '0-1 contacts' || answers.conversion === 'No idea';
    const slowSpeed = answers.speed === 'Still loading' || answers.speed === 'Gave up';
    const highTraffic = answers.visitors === '2000-5000' || answers.visitors === '5000+';
    const goodConversion = answers.conversion === '4-5 contacts' || answers.conversion === '6+ contacts';
    const fastSpeed = answers.speed === 'Yes, fast!' || answers.speed === 'Just finished';
    const timeWaste = answers.time === '10+ hours' || answers.time === 'Too many';

    // Scenario 1: No Website / Very Low Traffic
    if (!hasWebsite) {
      return {
        headline: "You Need a Professional Web Presence",
        subhead: "You need a professional web presence to start generating leads",
        color: "#ff4444",
        recommendation: "Fast-Track Website",
        reason: "You need a professional website that actually converts",
        cta1: "Book a Discovery Call",
        cta2: "Email Me These Results"
      };
    }

    // Scenario 2: Have Website but Poor Performance
    if (hasWebsite && (poorConversion || slowSpeed) && !hasSystemChaos) {
      return {
        headline: "Your Current Website is Costing You Customers",
        subhead: "Your current website is costing you customers. Time for a conversion-focused rebuild",
        color: "#ff4444",
        recommendation: "Fast-Track Website (rebuild)",
        reason: "Your website is failing to convert the traffic you have",
        cta1: "Book a Discovery Call",
        cta2: "Email Me These Results"
      };
    }

    // Scenario 3: Have Website but System Chaos
    if (hasSystemChaos || timeWaste) {
      return {
        headline: "Your Real Problem is System Chaos",
        subhead: "Your website needs optimization, but your real problem is system chaos",
        color: "#ffaa00",
        recommendation: "Conversion Growth Studio",
        reason: "You need more than a website fix - you need a complete business system",
        cta1: "Book a Discovery Call",
        cta2: "Email Me These Results"
      };
    }

    // Scenario 4: Good Website, Minor Issues
    if (highTraffic && goodConversion && fastSpeed) {
      return {
        headline: "Your Foundation is Solid",
        subhead: "Your foundation is solid. Let's optimize specific areas for even better results",
        color: "#00aa44",
        recommendation: "A La Carte Solutions",
        reason: "You're doing great! Let's fine-tune for maximum performance",
        cta1: "Get A La Carte Estimate",
        cta2: "Email Me These Results"
      };
    }

    // Score-based fallbacks with context
    if (score <= 40) {
      if (!hasWebsite) {
        return {
          headline: "You Need a Professional Website",
          subhead: "Without a converting website, you're invisible to potential customers",
          color: "#ff4444",
          recommendation: "Fast-Track Website",
          reason: "You need a professional website that actually converts",
          cta1: "Book a Discovery Call",
          cta2: "Email Me These Results"
        };
      } else {
        return {
          headline: "Your Website is Failing to Convert",
          subhead: "Time for a conversion-focused rebuild",
          color: "#ff4444",
          recommendation: "Fast-Track Website (rebuild)",
          reason: "Your website is failing to convert the traffic you have",
          cta1: "Book a Discovery Call",
          cta2: "Email Me These Results"
        };
      }
    } else if (score > 40 && score <= 70) {
      // First check if they have no website (score 41-70 + No/Low Traffic)
      if (!hasWebsite) {
        return {
          headline: "You Need a Professional Website",
          subhead: "Without a converting website, you're invisible to potential customers",
          color: "#ff4444",
          recommendation: "Fast-Track Website",
          reason: "You need a professional website that actually converts",
          cta1: "Book a Discovery Call",
          cta2: "Email Me These Results"
        };
      }
      // Then check for system chaos (score 41-70 + Multiple Tools/Time Waste)
      else if (hasSystemChaos || timeWaste) {
        return {
          headline: "You Need a Complete Business System",
          subhead: "Website issues are just the tip of the iceberg",
          color: "#ffaa00",
          recommendation: "Conversion Growth Studio",
          reason: "You need more than a website fix - you need a complete business system",
          cta1: "Book a Discovery Call",
          cta2: "Email Me These Results"
        };
      }
      // Otherwise, simple setup (score 41-70 + Simple Setup)
      else {
        return {
          headline: "Target Your Specific Weak Points",
          subhead: "Strategic improvements without overhauling everything",
          color: "#ffaa00",
          recommendation: "A La Carte Solutions",
          reason: "Target your specific weak points without overhauling everything",
          cta1: "Get A La Carte Estimate",
          cta2: "Email Me These Results"
        };
      }
    } else {
      return {
        headline: "You're Doing Great!",
        subhead: "Let's fine-tune for maximum performance",
        color: "#00aa44",
        recommendation: "A La Carte Solutions or Ongoing Conversion Care",
        reason: "You're doing great! Let's fine-tune for maximum performance",
        cta1: "Get A La Carte Estimate",
        cta2: "Email Me These Results"
      };
    }
  };

  const renderWelcomeScreen = () => (
    <div className="quiz-screen welcome-screen">
      <div className="welcome-content">
        <div className="quiz-headline">Is Your Website Actually Working?</div>
        <p className="quiz-subhead">Find out in 5 minutes where you're losing money</p>
        <button 
          className="services-cta-button"
          onClick={() => setScreen(1)}
        >
          Start Free Diagnostic
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
              onClick={() => handleAnswer(currentQuestion.id, option.text, option.points)}
            >
              {option.text}
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
    const lostRevenue = calculateLostRevenue();

    return (
      <div className="quiz-screen results-screen">
        <div className="score-gauge">
          <div className="gauge-container">
            <div 
              className="gauge-fill" 
              style={{ 
                width: `${score}%`
              }}
            ></div>
          </div>
        </div>
        
        <h2 className="results-headline">{result.headline}</h2>
        <div className="results-score">{score}/100</div>
        <p className="results-subhead">{result.subhead}</p>
        
        {lostRevenue > 0 && (
          <div className="lost-revenue">
            <p>Based on your answers, you could be losing <strong>up to ${lostRevenue.toLocaleString()}</strong> per month</p>
          </div>
        )}
        
        <div className="recommendation">
          <p><strong>Our Recommendation:</strong> {result.recommendation}</p>
          {result.reason && <p className="recommendation-reason">{result.reason}</p>}
        </div>
        
        <div className="results-actions">
          <Link 
            href={result.recommendation.includes("A La Carte") ? "/estimate" : "/contacts"} 
            className="services-cta-button primary"
          >
            {result.cta1}
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
          font-family: ff-real-text-pro-2, sans-serif;
        }

        .quiz-container {
          width: 100%;
          margin: 0 auto;
          padding: 0 40px;
          border: 1px solid var(--foreground);
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
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: clamp(2.5rem, 5vw, 3.5rem);
          font-weight: 400;
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

        .services-cta-button {
          background: var(--foreground);
          color: var(--raw-white);
          padding: 18px 1.25rem;
          border: 2px solid var(--foreground);
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-block;
          margin: 10px;
        }

        .services-cta-button:hover {
          background: var(--yellow);
          color: var(--foreground);
          border-color: var(--yellow);
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
          font-size: 0.9rem;
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
          font-size: 0.9rem;
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
          border: 1px solid var(--foreground);
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: 1rem;
          font-weight: 600;
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
          font-size: 0.9rem;
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
          font-weight: 400;
          cursor: pointer;
          margin-top: 30px;
          align-self: flex-start;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          background: var(--foreground);
          color: var(--raw-white);
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
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
          font-weight: 400;
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
          font-size: 1.1rem;
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
            padding: 1rem 1.5rem 80px 1.5rem;
          }
        }

        @media (max-width: 480px) {
          .diagnostic-tool-section {
            padding: 1rem 1rem 80px 1rem;
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
            font-size: 1.2rem;
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
          --foreground: #35332f;
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