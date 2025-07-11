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
              fontFamily: 'ff-real-text-pro-2, sans-serif',
              fontSize: '2.5rem',
              fontWeight: 400,
              lineHeight: 1.3,
              color: '#35332f',
              margin: 0,
              letterSpacing: '-0.01em',
              boxSizing: 'border-box'
            }}>
              Growing Ontario businesses trust us to turn their websites from expensive decorations into customer-generating machines. By integrating proven <strong style={{ fontWeight: 700 }}>conversion science</strong> and <strong style={{ fontWeight: 700 }}>data-driven design</strong>, we create online experiences that attract your ideal audience and inspire them to take action.
            </h2>
          </div>
          
          <div style={{
            marginTop: '2rem',
            display: 'flex',
            justifyContent: 'flex-end',
            boxSizing: 'border-box',
          }}>
            <h3 style={{
              background: '#35332f',
              color: '#faf9f6',
              fontFamily: 'ff-real-text-pro-2, sans-serif',
              fontSize: '1.2rem',
              fontWeight: 400,
              lineHeight: 1.2,
              padding: '1.5rem 2rem',
              margin: 0,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              textAlign: 'right',
              boxSizing: 'border-box'
            }}>
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