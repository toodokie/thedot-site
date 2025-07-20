'use client';

import Image from 'next/image';
import { useEffect } from 'react';

export default function Hero() {
    useEffect(() => {
        // Safari mobile video autoplay fix with performance optimization
        const videos = document.querySelectorAll('video');
        
        // Detect if on mobile for performance optimization
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        videos.forEach(video => {
            // Mobile optimization: reduce quality and frame rate if needed
            if (isMobile) {
                video.setAttribute('playbackRate', '0.8'); // Slightly slower playback for smoother performance
            }
            
            if (video.paused) {
                video.play().catch(console.error);
            }
        });
        
        // Try to play videos on first user interaction
        const handleFirstInteraction = () => {
            videos.forEach(video => {
                if (video.paused) {
                    video.play().catch(console.error);
                }
            });
            // Remove listeners after first interaction
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('click', handleFirstInteraction);
        };
        
        document.addEventListener('touchstart', handleFirstInteraction);
        document.addEventListener('click', handleFirstInteraction);
        
        return () => {
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('click', handleFirstInteraction);
        };
    }, []);

    return (
      <>
        {/* Main Hero Content */}
        <section className="hero-section">
          <div className="hero-container">
            <div className="hero-content">
              <div className="hero-text animate-on-scroll">
                {/* CONVERSION-FIRST DESIGN AGENCY standalone */}
                <h1 className="hero-title animate-on-scroll"><em style={{fontWeight: 300, fontSize: '4.2rem', fontStyle: 'italic'}}>WEBSITES & WORKFLOWS</em><br /><strong>DIGITAL DESIGN AGENCY</strong></h1>
                
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
              
              {/* Circular Video - Optimized for LCP and CLS */}
              <div 
                className="hero-video-circle animate-on-scroll"
                style={{
                  width: '260px',
                  height: '260px',
                  aspectRatio: '1 / 1',
                  overflow: 'hidden'
                }}
              >
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  preload="none"
                  className="circle-video"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                  width="300"
                  height="300"
                  onLoadedData={(e) => {
                    // Force play on Safari mobile
                    const video = e.target as HTMLVideoElement;
                    video.play().catch(console.error);
                  }}
                >
                  <source src="/video/hero-video-min.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
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
          
          {/* Full-Width Video */}
          <div 
            className="hero-video-section animate-on-scroll"
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              overflow: 'hidden'
            }}
          >
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              preload="none"
              className="hero-video"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              onLoadedData={(e) => {
                // Force play on Safari mobile
                const video = e.target as HTMLVideoElement;
                video.play().catch(console.error);
              }}
            >
              <source src="/video/hero-video-min.mp4" type="video/mp4" />
              Your browser does not support the video tag.
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
              fetchPriority="low"
            />
          </div>
        </section>
      </>
    );
  }