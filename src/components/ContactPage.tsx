'use client';

import Image from 'next/image';
import Footer from './Footer';

export default function ContactPage() {

  return (
    <>
      <style jsx>{`
        .body {
          cursor: none;
          background-color: var(--raw-white);
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: 1rem;
          font-weight: 400;
          line-height: 1.6;
        }
        
        .contacts-main-container {
          background-color: var(--raw-white);
          padding-top: 100px;
          min-height: 100vh;
        }
        
        .container-contact {
          width: 100%;
          max-width: 120rem;
          margin: 0 auto;
          padding: 2rem 2.5rem;
        }
        
        .social-icons-eng {
          display: none;
        }
        
        .link-block-social-icons-eng {
          text-decoration: none;
          display: inline-block;
          transition: all 0.3s ease;
        }
        
        .link-block-social-icons-eng:hover {
          transform: translateX(5px);
        }
        
        .social-media-icon {
          opacity: 1;
          color: var(--black);
          background-color: transparent;
          width: 3.4em;
          margin-right: 2em;
          padding: 8px;
          filter: brightness(0) saturate(100%) invert(14%) sepia(11%) saturate(636%) hue-rotate(28deg) brightness(96%) contrast(91%);
        }
        
        .link-block-social-icons-eng.twitter {
          display: none;
        }
        
        .phone-contact-section {
          margin-bottom: 2em;
          margin-top: 1em;
        }
        
        .phone-contact-link {
          display: flex;
          align-items: center;
          text-decoration: none !important;
          color: var(--black);
          font-family: futura-pt, sans-serif;
          font-size: 1.2rem;
          font-weight: 400;
          transition: all 0.3s ease;
        }
        
        .phone-contact-link:hover {
          color: var(--black);
          text-decoration: none !important;
          transform: translateX(5px);
        }
        
        .phone-icon {
          width: 24px;
          height: 24px;
          margin-right: 10px;
          fill: var(--black);
        }
        
        .phone-number {
          color: var(--black);
        }
        
        .contact-heading {
          color: var(--black);
          margin: 0;
          padding-top: 3rem;
          padding-bottom: 3rem;
          font-family: futura-pt, sans-serif;
          font-size: 5.8rem;
          font-weight: 400;
          text-align: left;
        }
        
        
        .code-embed {
          width: 100%;
        }
        
        .code-embed iframe {
          width: 100%;
          height: 1100px;
          border: 0;
        }
        
        .div-block-201 {
          width: 100%;
        }
        
        
        @media (max-width: 768px) {
          .contact-heading {
            font-size: 3.5rem;
          }
          
          .social-icons-eng {
            flex-wrap: wrap;
            gap: 10px;
            display: flex !important;
            margin-bottom: 1em;
          }
          
          .social-media-icon {
            width: 3.2rem;
            margin-right: 0.5em;
          }
          
          .code-embed iframe {
            height: 800px;
          }
        }
        
        :root {
          --white-smoke: #f8f8f8;
          --black: #35332f;
          --dim-grey: #47453f;
          --white-smoke-nav: #faf9f6b3;
          --white: #fafafa;
          --white-2: white;
          --raw-white: #faf9f6;
          --yellow: #daff00;
          --grey-2: #7a776f;
          --coral-nontr: #ff7432;
          --medium-aquamarine: #78c8af;
          --white-3: #fffefc;
          --grey: #8f7165;
          --dark-slate-grey: #1e4145;
          --rosy-brown: #c19d8f;
          --white-transp: #fafafac9;
          --white-smoke-2: #ebebe7;
          --beige: #ebead7;
          --antique-white: #dac9bb;
        }
      `}</style>

      <div className="body">
        <div className="contacts-main-container">
          <div className="container-contact">
            {/* Social Media Icons - Hidden */}
            <div className="social-icons-eng" style={{ display: 'none' }}>
              {/* Icons hidden as requested */}
            </div>

            {/* Contact Information Section */}
            <div className="phone-contact-section">
              <a href="tel:+16474024420" className="phone-contact-link">
                <svg className="phone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="var(--black)" d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 .95-.27 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1v3.52a1 1 0 0 1-1 1A18 18 0 0 1 2 3a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.27.95z"/>
                </svg>
                <span className="phone-number">+1 (647) 402-4420</span>
              </a>
              
              <a href="mailto:info@thedotcreative.co?subject=New%20Website%20Contact" className="phone-contact-link">
                <svg className="phone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="var(--black)" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <span className="phone-number">info@thedotcreative.co</span>
              </a>

              <a href="https://www.instagram.com/thedotcreativeagency/" target="_blank" rel="noopener noreferrer" className="phone-contact-link">
                <svg className="phone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="var(--black)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <span className="phone-number">Instagram</span>
              </a>

              <a href="https://www.linkedin.com/in/anna-volk-75b354373/" target="_blank" rel="noopener noreferrer" className="phone-contact-link">
                <svg className="phone-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="var(--black)" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <span className="phone-number">LinkedIn</span>
              </a>
            </div>

            {/* Main Content Section */}
            <h2 className="contact-heading eng">Let&apos;s create great designs together!</h2>
            
            <div className="code-embed">
              <iframe 
                src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ2-jj49NvN4gOJRVdYHrQjylFvFAqrtqMHWfW_rJx0WSRIdVJue7WfcjSlMwIRakKYHUD69zmbA?gv=true"
                title="Google Calendar Appointment Scheduling"
              />
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}