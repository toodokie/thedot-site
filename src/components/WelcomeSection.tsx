'use client';

export default function WelcomeSection() {
    return (
      <>
        <section style={{ 
          background: '#faf9f6', 
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
        <div style={{ 
          maxWidth: '120rem',
          margin: '0 auto',
          padding: '0 2.5rem',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          <div className="welcome-text-container">
            <h2 style={{
              fontFamily: 'ff-real-text-pro, sans-serif',
              fontSize: '2.5rem',
              fontWeight: 200,
              lineHeight: 1.3,
              color: 'var(--foreground)',
              margin: 0,
              letterSpacing: '-0.01em',
              boxSizing: 'border-box'
            }}>
              Your digital presence should work as strategically as your business does. The Dot Creative specializes in comprehensive digital solutions - <strong style={{ fontWeight: 400 }}>from refined visual identity to intelligent system integration</strong>.<br /><br />We transform how growing Ontario businesses present themselves and operate online, creating cohesive experiences that <strong style={{ fontWeight: 400 }}>elevate brands</strong> and <strong style={{ fontWeight: 400 }}>optimize operations</strong>.
            </h2>
          </div>
          
          <div style={{
            marginTop: '2rem',
            display: 'flex',
            justifyContent: 'flex-end',
            boxSizing: 'border-box',
          }}>
            <h3 className="welcome-tag">
              Performance,<br />
              beautifully engineered
            </h3>
          </div>
        </div>
      </section>
      
      <style jsx>{`
        section {
          padding: 6rem 0;
        }
        
        .welcome-text-container {
          width: 70%;
          margin-left: auto;
          text-align: right;
          box-sizing: border-box;
        }
        
        @media (max-width: 999px) {
          section {
            padding: 4rem 0;
          }
          
          .welcome-text-container {
            width: 100%;
            margin-left: 0;
            text-align: left;
            padding: 2rem 0 0 0;
          }
        }
        
        @media (min-width: 1000px) {
          section h2 {
            font-size: 2.75rem !important; /* Scale up from 2.5rem */
          }
          section h3 {
            font-size: 1.25rem !important; /* Scale up from 1.125rem */
          }
        }
        
        @media (min-width: 1240px) {
          section h2 {
            font-size: 3rem !important; /* Further scale for large screens */
          }
          section h3 {
            font-size: 1.375rem !important;
          }
        }
        
@media (max-width: 999px) {
          section h3 {
            font-size: 1rem !important;
          }
        }
        
        @media (max-width: 768px) {
          section {
            padding: 2rem 0;
          }
          
          .welcome-text-container {
            width: 100%;
            margin-left: 0;
            text-align: left;
            padding: 2rem 0 0 0;
          }
        }
      `}</style>
      </>
    );
  }