import Image from 'next/image';

export default function Hero() {
    return (
      <>
        {/* Main Hero Content */}
        <section className="hero-section">
          <div className="hero-container">
            <div className="hero-content">
              <div className="hero-text animate-on-scroll">
                {/* CONVERSION-FIRST DESIGN AGENCY standalone */}
                <h1 className="hero-title animate-on-scroll"><em style={{fontWeight: 300, fontSize: '4.5rem'}}>CONVERSION-FIRST</em><br /><strong>DESIGN AGENCY</strong></h1>
                
                {/* Services list grouped */}
                <div className="agency-services-group animate-on-scroll">
                  {/* Services List - Desktop */}
                  <div className="services-list desktop-services">
                    <span>BRANDS THAT ATTRACT • WEBSITES THAT CONVERT • SYSTEMS THAT GROW</span>
                    <span style={{display: 'none'}}>PHOTO & VIDEO</span>
                    <span style={{display: 'none'}}>WEBSITES</span>
                    <span style={{display: 'none'}}>and MORE</span>
                  </div>
                </div>
              </div>
              
              {/* Circular Video - Optimized for LCP */}
              <div className="hero-video-circle animate-on-scroll">
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  preload="auto"
                  className="circle-video"
                >
                  <source src="/video/hero-video.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
            
            {/* Services List - Mobile */}
            <div className="services-list mobile-services animate-on-scroll">
              <span>LOGOS</span>
              <div className="service-divider"></div>
              <span>PHOTO & VIDEO</span>
              <div className="service-divider"></div>
              <span>WEBSITES</span>
              <div className="service-divider"></div>
              <span>and MORE</span>
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
            />
          </div>
          
          {/* Full-Width Video */}
          <div className="hero-video-section animate-on-scroll">
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="hero-video"
            >
              <source src="/video/hero-video.mp4" type="video/mp4" />
            </video>
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
            />
          </div>
        </section>
      </>
    );
  }