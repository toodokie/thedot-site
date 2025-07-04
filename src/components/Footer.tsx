'use client';

import { useEffect, useState } from 'react';

export default function Footer() {
  const [showCookieBanner, setShowCookieBanner] = useState(false);

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

    const animatedElements = document.querySelectorAll('.footer .animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  const handleAcceptCookies = () => {
    setShowCookieBanner(false);
    // Add cookie acceptance logic here
  };

  const handleDenyCookies = () => {
    setShowCookieBanner(false);
    // Add cookie denial logic here
  };

  return (
    <>
      <footer className="footer">
        <div className="footer-container animate-on-scroll">
          <div className="footer-content">
            <div className="footer-text">
              Use, copying of materials (a selection of site materials, design elements and design) is allowed with the permission of the copyright holder and a link to{' '}
              <a href="http://www.thedotcreative.co" className="footer-link">
                www.thedotcreative.co
              </a>
              .
            </div>
            <div>
              <div className="footer-text">
                <br />
                The Dot Creative Agency © 2025
              </div>
            </div>
          </div>
        </div>
        <div className="black-line"></div>
      </footer>

      {/* Cookie Banner */}
      {showCookieBanner && (
        <div className="cookie-banner">
          <div className="cookie-banner-container">
            <div className="cookie-buttons-wrapper">
              <button 
                onClick={handleAcceptCookies}
                className="allow-button"
              >
                Accept
              </button>
              <button 
                onClick={handleDenyCookies}
                className="deny-button"
              >
                Deny
              </button>
            </div>
            <div className="cookie-text">
              By clicking &quot;Accept&quot;, you agree to the storing of cookies on your device to enhance site navigation, analyze site usage, and assist in our marketing efforts. View our{' '}
              <a href="#" className="cookie-link">Privacy Policy</a> for more information.
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .footer {
          background: var(--background);
          width: 100%;
          padding: 4rem 0 0 0;
        }

        .footer-container {
          max-width: 120rem;
          margin: 0 auto;
          padding: 0 2.5rem;
          box-sizing: border-box;
        }

        .footer-content {
          width: 100%;
        }

        .footer-text {
          color: var(--foreground);
          text-align: left;
          letter-spacing: 0;
          flex-direction: column;
          order: -1;
          align-items: flex-start;
          margin-bottom: auto;
          padding-left: 0;
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: 1rem;
          font-weight: 300;
          display: block;
        }

        .footer-link {
          color: var(--foreground);
          text-decoration: underline;
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: 1rem;
          font-weight: 300;
        }

        .footer-link:hover {
          opacity: 0.7;
        }

        .black-line {
          width: 100%;
          height: 1px;
          background: var(--foreground);
          margin: 2rem 0 0 0;
        }


        /* Cookie Banner */
        .cookie-banner {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: var(--background);
          border-top: 1px solid var(--foreground);
          z-index: 1000;
          padding: 1rem;
        }

        .cookie-banner-container {
          max-width: 120rem;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .cookie-buttons-wrapper {
          display: flex;
          gap: 1rem;
        }

        .allow-button,
        .deny-button {
          padding: 0.5rem 1rem;
          border: 1px solid var(--foreground);
          background: var(--background);
          color: var(--foreground);
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .allow-button:hover,
        .deny-button:hover {
          background: var(--foreground);
          color: var(--background);
        }

        .cookie-text {
          font-family: 'ff-real-text-pro-2', sans-serif;
          font-size: 0.9rem;
          color: var(--foreground);
          flex: 1;
        }

        .cookie-link {
          color: var(--foreground);
          text-decoration: underline;
        }

        .cookie-link:hover {
          opacity: 0.7;
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
        @media (max-width: 768px) {
          .footer {
            padding: 3rem 0 0 0;
          }

          .footer-container {
            padding: 0 1.5rem;
          }

          .footer-text {
            font-size: 0.9rem;
          }

          .cookie-banner-container {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .cookie-buttons-wrapper {
            order: 2;
          }

          .cookie-text {
            order: 1;
            font-size: 0.8rem;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .animate-on-scroll {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}