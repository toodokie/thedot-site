// Server component for Hero content that needs to be accessible to WAVE
import Image from 'next/image';

export default function HeroContent() {
  return (
    <>
    <section className="hero-section">
      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-text animate-on-scroll">
            {/* Server-rendered H1 for accessibility - always visible to WAVE */}
            <h1 className="hero-title">
              <em style={{fontWeight: 300, fontSize: '4.2rem', fontStyle: 'italic'}}>
                WEBSITES & WORKFLOWS
              </em>
              <br />
              <strong>DIGITAL DESIGN AGENCY</strong>
            </h1>
            
            {/* Services list grouped */}
            <div className="agency-services-group animate-on-scroll">
              {/* Services List - Desktop */}
              <div className="services-list desktop-services">
                <span>BRANDS THAT ATTRACT • WEBSITES THAT CONVERT • SYSTEMS THAT GROW</span>
              </div>
            </div>
          </div>
          
          {/* Circular Video - This will be handled by the client component */}
          <div 
            className="hero-video-circle animate-on-scroll"
            style={{
              width: '260px',
              height: '260px',  
              aspectRatio: '1 / 1',
              overflow: 'hidden'
            }}
          >
            <div id="hero-video-placeholder" style={{
              width: '100%',
              height: '100%',
              background: '#f0f0f0',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '14px'
            }}>
              Loading...
            </div>
          </div>
        </div>
        
        {/* Services List - Mobile */}
        <div className="services-list mobile-services animate-on-scroll">
          <span>BRANDS THAT ATTRACT</span>
          <div className="service-divider"></div>
          <span>WEBSITES THAT CONVERT</span>
          <div className="service-divider"></div>
          <span>SYSTEMS THAT GROW</span>
        </div>
      </div>
    </section>

    {/* Full-Width Video Section with Lines */}
    <section className="hero-video-full animate-on-scroll">
      {/* Top Line */}
      <div className="hero-line animate-on-scroll">
        <Image 
          src="/images/line.png" 
          alt="" 
          width={1920} 
          height={7} 
          className="line-image" 
          style={{ width: '100%', height: 'auto' }}
          priority
          fetchPriority="high"
        />
      </div>
      
      {/* Full-Width Video placeholder - actual video will be injected by client component */}
      <div 
        className="hero-video-section animate-on-scroll"
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          overflow: 'hidden'
        }}
        id="hero-video-full-placeholder"
      >
        <div style={{
          width: '100%',
          height: '100%',
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666'
        }}>
          Loading video...
        </div>
      </div>
      
      {/* Bottom Line */}
      <div className="hero-line animate-on-scroll">
        <Image 
          src="/images/line.png" 
          alt="" 
          width={1920} 
          height={7} 
          className="line-image" 
          style={{ width: '100%', height: 'auto' }}
          fetchPriority="low"
        />
      </div>
    </section>
    </>
  );
}