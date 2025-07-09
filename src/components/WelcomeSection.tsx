export default function WelcomeSection() {
    return (
      <>
        <section style={{ 
          background: '#faf9f6', 
          padding: '6rem 0',
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
          <div style={{
            width: '60%',
            marginLeft: 'auto',
            textAlign: 'right',
            boxSizing: 'border-box',
          }}>
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
              Welcome to The Dot Creative Agency, your go-to partner for crafting an impactful digital presence and brand identity in the Greater Toronto Area. From <strong style={{ fontWeight: 700 }}>web</strong> and <strong style={{ fontWeight: 700 }}>graphic design</strong> to <strong style={{ fontWeight: 700 }}>motion</strong>, <strong style={{ fontWeight: 700 }}>video</strong>, <strong style={{ fontWeight: 700 }}>photography</strong>, and <strong style={{ fontWeight: 700 }}>marketing</strong>, we tailor our services to elevate your business. Experience our comprehensive support on all stages of your project and beyond.
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
              fontSize: '1.25rem',
              fontWeight: 400,
              lineHeight: 1.2,
              padding: '1.5rem 2rem',
              margin: 0,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              textAlign: 'right',
              boxSizing: 'border-box'
            }}>
              where aesthetics<br />
              meet purpose
            </h3>
          </div>
        </div>
      </section>
      
      <style jsx>{`
        section {
          padding: 6rem 0;
        }
        
        @media (max-width: 999px) {
          section {
            padding: 4rem 0;
          }
        }
        
        @media (max-width: 768px) {
          section {
            padding: 3rem 0;
          }
        }
      `}</style>
      </>
    );
  }