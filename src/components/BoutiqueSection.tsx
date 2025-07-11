'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

// TypeScript interfaces
interface CircularTextSVGProps {
  text: string;
  radius?: number;
  isMobile?: boolean;
  index: number;
}

interface Capability {
  title: string;
  description: string;
}

// Circular Text SVG Component - Text OUTSIDE circles
const CircularTextSVG: React.FC<CircularTextSVGProps> = ({ 
  text, 
  radius = 85, 
  index = 0 
}) => {
  // Use single line for both tablet and mobile - no more ugly two-line approach
  const displayText = text;
  
  // Text OUTSIDE the circle - maintain 0.1em gap
  const adjustedRadius = radius + 4;
  const uniqueId = `circle-${index}`;

  return (
    <div className="circular-svg-container">
      <svg 
        width={radius * 2} 
        height={radius * 2} 
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        className="circular-text-svg"
      >
        <defs>
          {/* Single full circle path for clean text flow */}
          <path
            id={`${uniqueId}-path-1`}
            d={`M ${radius} ${radius - adjustedRadius} 
                A ${adjustedRadius} ${adjustedRadius} 0 0 1 ${radius} ${radius + adjustedRadius}
                A ${adjustedRadius} ${adjustedRadius} 0 0 1 ${radius} ${radius - adjustedRadius}`}
            fill="none"
          />
        </defs>
        
        {/* Single line circular text */}
        <text className="circular-text-path">
          <textPath 
            href={`#${uniqueId}-path-1`}
            startOffset="0%"
          >
            {displayText}
          </textPath>
        </text>
      </svg>
    </div>
  );
};

export default function BoutiqueSection() {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isTablet, setIsTablet] = useState<boolean>(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsTablet(window.innerWidth > 768 && window.innerWidth <= 999);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    const observerOptions: IntersectionObserverInit = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          // Show circular text after circle animation
          const circularText = entry.target.querySelector('.circular-svg-container');
          if (circularText) {
            setTimeout(() => {
              circularText.classList.add('visible');
            }, 600);
          }
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      window.removeEventListener('resize', checkScreenSize);
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  const capabilities: Capability[] = [
    {
      title: 'Conversion Strategy',
      description: 'customer psychology, user journey mapping, metrics planning'
    },
    {
      title: 'Brand Development for Conversion', 
      description: 'trust-building design, messaging that converts, visual consistency'
    },
    {
      title: 'Website Engineering',
      description: 'speed optimization, mobile-first design, conversion tracking'
    },
    {
      title: 'Growth Systems',
      description: 'email automation, lead nurturing, continuous optimization'
    }
  ];

  return (
    <section className="boutique-section animate-on-scroll">
      {/* Header Content */}
      <div className="boutique-header animate-on-scroll">
        <h2 className="section-title-center animate-on-scroll">
          Strategic. Integrated. Results-Driven.
        </h2>
        <p className="section-description-center animate-on-scroll">
          We don't just make things pretty. We make them profitable.
        </p>
      </div>
        
      {/* Capabilities Process */}
      <div className="boutique-process animate-on-scroll">
        <div className="capabilities-container">
          {capabilities.map((capability, index) => (
            <div key={index} className="capability-item">
              {/* Circle with Circular Text */}
              <div className="flip-container animate-on-scroll" style={{ animationDelay: `${index * 0.2}s` }}>
                <div className="capability-circle" role="group" aria-labelledby={`capability-${index}-title`}>
                  
                  {/* Front side - Title STAYS CENTERED */}
                  <div className="circle-front">
                    <h5 id={`capability-${index}-title`} className="card-title">
                      {capability.title}
                    </h5>
                    
                    {/* Circular text for tablet/mobile only */}
                    {(isMobile || isTablet) && (
                      <CircularTextSVG 
                        text={capability.description}
                        radius={isMobile ? 80 : 90}
                        isMobile={isMobile}
                        index={index}
                      />
                    )}
                  </div>
                  
                  {/* Back side - Desktop hover only */}
                  <div className="circle-back">
                    <h5 className="card-title">
                      {capability.title}
                    </h5>
                    <p className="capability-description-hover">
                      {capability.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Traditional Mobile Description - Hidden when using circular text */}
              <div className={`mobile-description ${(isMobile || isTablet) ? 'hide-on-circular' : ''}`}>
                <p className="capability-description">
                  {capability.description}
                </p>
              </div>

              {/* Arrow (except after last circle) */}
              {index < capabilities.length - 1 && (
                <div 
                  className="capability-arrow animate-on-scroll"
                  style={{ animationDelay: `${(index * 0.2) + 0.1}s` }}
                  aria-hidden="true"
                >
                  <Image
                    src="/images/arrow.png"
                    width={56}
                    height={56}
                    alt=""
                    className="arrow-image"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .boutique-section {
          background: var(--background);
          padding: 8rem 0;
          width: 100%;
          overflow: hidden;
          position: relative;
          z-index: 1;
        }
        
        @media (max-width: 999px) {
          .boutique-section {
            padding: 4rem 0 6rem 0;
          }
        }

        .boutique-header {
          max-width: 120rem;
          margin: 0 auto 6rem;
          padding: 0 2.5rem;
          text-align: center;
        }

        .boutique-process {
          width: 100%;
          padding: 0 2rem;
        }

        .capabilities-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          max-width: 1400px;
          margin: 0 auto;
          flex-wrap: wrap;
        }

        .capability-item {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .flip-container {
          width: clamp(160px, 15vw, 220px);
          height: clamp(160px, 15vw, 220px);
          perspective: 1000px;
          position: relative;
          overflow: visible;
        }

        .capability-circle {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 1px solid var(--foreground);
          background: radial-gradient(circle, var(--background) 10%, #daff0087 80%, #daff00 100%);
          position: relative;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          transform-style: preserve-3d;
          overflow: visible;
        }

        .flip-container:hover .capability-circle {
          transform: rotateY(180deg);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .circle-front,
        .circle-back {
          position: absolute;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-radius: 50%;
          top: 0;
          left: 0;
          padding: clamp(0.75rem, 2.5vw, 1.5rem);
          box-sizing: border-box;
          backface-visibility: hidden;
        }

        .circle-front {
          background: transparent;
        }

        .circle-back {
          background: #ffffff;
          transform: rotateY(180deg);
        }

        .card-title {
          font-family: 'futura-pt', sans-serif;
          font-size: clamp(0.8rem, 2vw, 1.1rem);
          font-weight: 400;
          line-height: 1.2;
          margin: 0;
          color: var(--foreground);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          z-index: 20;
          position: relative;
        }

        .capability-description-hover {
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: clamp(0.65rem, 1.5vw, 0.85rem);
          font-weight: 300;
          line-height: 1.3;
          margin: 0;
          color: var(--foreground);
          opacity: 0.8;
        }

        .capability-description {
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: clamp(0.75rem, 1.8vw, 1rem);
          font-weight: 300;
          line-height: 1.3;
          margin: 0;
          color: var(--foreground);
          opacity: 0.8;
        }

        .capability-arrow {
          transition: transform 0.3s ease;
        }

        .capability-arrow:hover {
          transform: translateX(5px);
        }

        .arrow-image {
          opacity: 1;
          transform: rotate(0deg);
          transition: opacity 0.3s ease;
        }

        .mobile-description {
          display: none;
          text-align: center;
          margin-top: 1rem;
        }

        /* Hide/show logic */
        .hide-on-circular {
          display: none;
        }

        /* Responsive Design */
        @media (max-width: 999px) {
          .flip-container {
            width: clamp(180px, 35vw, 220px);
            height: clamp(180px, 35vw, 220px);
          }

          .mobile-description {
            display: block;
          }

          /* Disable hover effects on tablet/mobile */
          .flip-container:hover .capability-circle {
            transform: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }

          .capability-circle {
            cursor: default;
          }
        }

        @media (max-width: 768px) {
          .boutique-section {
            padding: 2rem 0 6rem 0; /* Increase bottom padding to create buffer */
          }
          
          .capability-item {
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 0;
          }

          .capability-arrow {
            display: none;
          }

          .flip-container {
            width: clamp(160px, 40vw, 200px);
            height: clamp(160px, 40vw, 200px);
          }

          .capabilities-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 3rem 2rem;
            max-width: 100%;
            justify-items: center;
          }

          .mobile-description {
            display: block;
            margin-top: 0.5rem;
          }
        }

        /* Animation base styles */
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .animate-on-scroll.animate-in {
          opacity: 1;
          transform: translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
          .circular-text-svg {
            animation: none;
          }
          
          .circular-svg-container {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}