'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function QuoteSection() {
  useEffect(() => {
    const observerOptions: IntersectionObserverInit = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.quote-section .animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  return (
    <section className="quote-section">
      <div className="quote-container">
        <div className="quote-content animate-on-scroll">
          <p className="dot-quote">
            Design has the power to <em className="italic-text">move</em> brands and people{' '}
            <em className="italic-text-2">forward</em>. We believe that both unique designs and 
            emotional experiences are essential in order to bring people together and{' '}
            <em className="italic-text-3">inspire brands to flourish</em>. We foster that 
            anything can become more unique with enough love. Because of this, we have a 
            personal and professional commitment to making everything we touch more beautiful.
          </p>
        </div>
      </div>

      {/* Divider with line.png */}
      <div
        className="animate-on-scroll"
        style={{
          width: '100vw',
          marginTop: 0,
          marginRight: 0,
          marginBottom: '0.9rem',
          marginLeft: 0,
          position: 'relative'
        }}
      >
        <div style={{ position: 'relative', height: '8px', width: '100%' }}>
          {/* 1px line above line.png */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: '#35332f'
          }}></div>
          {/* line.png positioned below the 2px line */}
          <Image
            src="/images/line.png"
            alt="Divider line"
            width={1920}
            height={7}
            style={{ 
              width: '100%', 
              height: 'auto', 
              objectFit: 'cover',
              position: 'absolute',
              top: '1px'
            }}
          />
        </div>
      </div>

      {/* Vision Section */}
      <div className="vision-container">
        <div className="vision-grid animate-on-scroll">
          <div className="vision-column">Our vision</div>
          <div className="vision-column">is to convey meaning and creative spirit into everyday life</div>
          <div className="vision-column direction">THROUGH <strong className="bold-text">DESIGN</strong></div>
        </div>
      </div>

      {/* Services Link Section */}
      <div className="services-link-container">
        <Link href="/services" className="dot-bottom-link hero animate-on-scroll">
          services<br />
          <span className="small-bottom-link-text-eng">learn more</span>
        </Link>
      </div>

      <style jsx>{`
        .quote-section {
          background: var(--background);
          padding: 8rem 0;
          width: 100%;
          overflow: hidden;
        }

        .quote-container {
          max-width: 120rem;
          margin: 0 auto;
          padding: 0 2.5rem;
          width: 100%;
          box-sizing: border-box;
        }

        .quote-content {
          text-align: justify;
          width: 100%;
          min-width: 100%;
          margin-bottom: 1em;
          font-size: 2em;
          line-height: 2em;
        }

        .dot-quote {
          font-family: 'futura-pt', sans-serif;
          font-size: 1.6em;
          font-weight: 500;
          line-height: 1.1em;
          text-transform: uppercase;
          color: var(--foreground);
          margin-bottom: 2em;
          text-indent: 6ch;
        }

        .italic-text,
        .italic-text-2,
        .italic-text-3 {
          font-style: italic;
          color: var(--foreground);
          font-weight: 300;
        }


        /* Vision Section - Styled like projects-titles-grid */
        .vision-container {
          max-width: 120rem;
          margin: 0 auto;
          padding: 0 2.5rem;
          box-sizing: border-box;
        }

        .vision-grid {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          grid-column-gap: 2rem;
          align-items: center;
          margin-bottom: 0.1rem;
          padding: 0.1em 0;
          box-sizing: border-box;
          margin-top: 0.1rem;
        }

        .vision-grid.animate-on-scroll {
          margin-bottom: 0.9em;
        }

        .vision-column {
          text-align: left;
          flex-direction: row;
          align-items: flex-start;
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: 1em;
          font-weight: 400;
          display: flex;
          color: var(--foreground);
          opacity: 1;
        }

        .direction {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          justify-content: flex-start;
          font-size: 0.8em;
        }

        .bold-text {
          font-weight: 700;
          color: var(--foreground);
        }

        /* Services Link Section */
        .services-link-container {
          max-width: 120rem;
          margin: 0 auto;
          padding: 0 2.5rem;
          text-align: center;
          margin-top: 4rem;
        }

        .dot-bottom-link.hero {
          cursor: none;
          padding-top: 2em;
          font-family: 'futura-pt', sans-serif;
          font-weight: 300;
          font-size: clamp(1.5rem, 6vw, 7rem);
          color: #35332f;
          margin: 0;
          line-height: 1;
          text-decoration: none;
          text-transform: uppercase;
          display: inline-block;
          transition: letter-spacing 0.3s ease;
        }

        .dot-bottom-link.hero:hover {
          letter-spacing: 15px;
        }

        .dot-bottom-link.hero:hover .small-bottom-link-text-eng {
          transform: translateY(-15px);
        }

        .small-bottom-link-text-eng {
          letter-spacing: 0.1em;
          text-transform: lowercase;
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: 1.2rem;
          font-weight: 300;
          line-height: 1.3;
          transition: transform 0.3s ease;
          display: inline-block;
        }

        /* Animation styles */
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .animate-on-scroll.animate-in {
          opacity: 1;
          transform: translateY(0);
        }

        /* Responsive Design */
        @media (min-width: 769px) and (max-width: 999px) {
          .quote-section {
            padding: 6rem 0;
          }
          
          .quote-container {
            padding: 0 2rem;
          }
          
          .quote-content {
            width: 100%;
          }
          
          .dot-quote {
            font-size: 1.1em;
          }


          .vision-container {
            padding: 0 2rem;
          }

          .vision-grid {
            grid-template-columns: 1fr 1fr;
            grid-column-gap: 1.5rem;
          }

          .vision-column {
            font-size: 14px;
          }

          .direction {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .quote-section {
            padding: 5rem 0;
          }
          
          .quote-container {
            padding: 0 1.5rem;
          }
          
          .dot-quote {
            font-size: 1.8rem;
            line-height: 1.2;
          }


          .vision-container {
            padding: 0 1.5rem;
          }

          .vision-grid {
            grid-template-columns: 1fr 1fr;
            grid-column-gap: 2em;
            margin-left: 1em;
            margin-right: 1em;
          }

          .vision-column {
            font-family: 'ff-real-text-pro-2', sans-serif;
            font-size: 12px;
            font-weight: 100;
          }

          .direction {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .dot-quote {
            font-size: 1.8rem;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .animate-on-scroll {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}