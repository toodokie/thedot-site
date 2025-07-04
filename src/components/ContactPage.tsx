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