'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Footer from './Footer';

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<'websites' | 'graphic' | 'photo'>('websites');

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

    const animatedElements = document.querySelectorAll('.services-page .animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    // Enhanced parallax effect for better browser compatibility
    const handleScroll = () => {
      const scrolled = window.pageYOffset;
      const parallaxElement = document.querySelector('.parallax-rectangle') as HTMLElement;
      
      if (parallaxElement) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = window.innerWidth < 1000; // Disable parallax on mobile/tablet
        
        if (!prefersReducedMotion && !isMobile) {
          const rect = parallaxElement.getBoundingClientRect();
          const elementTop = rect.top + window.pageYOffset;
          const windowHeight = window.innerHeight;
          
          // Check if element is in viewport
          if (rect.top < windowHeight && rect.bottom > 0) {
            // Calculate parallax offset - slower movement creates the parallax effect
            const speed = 0.5; // More pronounced effect for testing
            const yPos = (scrolled - elementTop) * speed;
            
            // Only move the background image, not the element itself
            const backgroundOffset = yPos * 0.8; // More pronounced background movement
            parallaxElement.style.backgroundPosition = `center ${backgroundOffset}px`;
          }
        } else {
          // Reset background position on mobile or when motion is reduced
          parallaxElement.style.backgroundPosition = 'center center';
        }
      }
    };

    // Add scroll listener for enhanced parallax
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div className="services-page">
      {/* Hero Section */}
      <section className="hero-title-copy-services services">
        <div className="div-block-184">
          <div className="div-block-183">
            <div className="div-block-178-services">
              <div className="w-layout-blockcontainer graphic-title-wrap-copy-services w-container">
                <div className="graphic-copy-services">
                  <h1 className="dot_h1_pages">We Create Digital Experiences</h1>
                  <div className="hero-circle-video-copy-mobile">
                    <video 
                      className="background-video-copy"
                      autoPlay 
                      muted 
                      loop
                      playsInline
                    >
                      <source src="/video/hero-video.mp4" type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
              </div>
              <div className="w-layout-blockcontainer graphic-copy-services-subheader w-container">
                <div className="graphic-copy-services-copy">
                  <h2 className="dot_h2_subheader">Elevate Your Brand with Our Expertise</h2>
                </div>
              </div>
            </div>
            <div className="hero-circle-video-copy-services">
              <video 
                className="background-video-copy-services"
                autoPlay 
                muted 
                loop
                playsInline
              >
                <source src="/video/hero-video.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Moving Text Section */}
      <section className="services-moving-text">
        <div className="scrolling-text-container">
          <h1 className="scrolling-text">
            transforming vision into captivating digital experiences • transforming vision into captivating digital experiences • transforming vision into captivating digital experiences • transforming vision into captivating digital experiences • transforming vision into captivating digital experiences •
          </h1>
        </div>
      </section>

      {/* Parallax Rectangle Section */}
      <section className="services-parallax-section">
        <div className="services-container">
          <div className="parallax-rectangle"></div>
        </div>
      </section>

      {/* Services Features Overview */}
      <section className="services-features">
        <div className="services-container">
          <h2 className="services-features-title">Services Features Overview</h2>
          
          {/* Tabs Navigation */}
          <div className="services-tabs">
            <div className="services-tabs-menu">
              <button 
                className={`services-tab-button ${activeTab === 'websites' ? 'active' : ''}`}
                onClick={() => setActiveTab('websites')}
              >
                <span className="tab-dot">●</span>
                <span className="tab-title">WEBSITES</span>
              </button>
              <button 
                className={`services-tab-button ${activeTab === 'graphic' ? 'active' : ''}`}
                onClick={() => setActiveTab('graphic')}
              >
                <span className="tab-dot">●</span>
                <span className="tab-title">GRAPHIC DESIGN</span>
              </button>
              <button 
                className={`services-tab-button ${activeTab === 'photo' ? 'active' : ''}`}
                onClick={() => setActiveTab('photo')}
              >
                <span className="tab-dot">●</span>
                <span className="tab-title">PHOTO & VIDEO</span>
              </button>
            </div>

            {/* Tab Content Decorative Lines */}
            <div className="tab-content-decorative-lines">
              <div className="decorative-line-yellow"></div>
              <div className="decorative-line-black"></div>
            </div>

            {/* Tabs Content */}
            <div className="services-tabs-content">
              {activeTab === 'websites' && <WebsitesTab />}
              {activeTab === 'graphic' && <GraphicTab />}
              {activeTab === 'photo' && <PhotoVideoTab />}
            </div>
          </div>
        </div>
      </section>

      {/* Contacts Link Section */}
      <section className="services-link-section">
        <div className="services-link-container">
          <Link href="/contacts" className="dot-bottom-link hero animate-on-scroll">
            contacts<br />
            <span className="small-bottom-link-text-eng">let&apos;s discuss your project</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// Websites Tab Component
function WebsitesTab() {
  return (
    <div className="services-tab-content">
      <div className="services-tab-header">
        <div className="services-tab-title-row">
          <h1 className="services-tab-title">Website Design</h1>
          <h6 className="services-tab-price">starting from $650</h6>
        </div>
        <p className="services-tab-description">
          For every client, we offer a curated suite of services tailored to your unique needs, all within our standard project fee. Should your project call for specialized features or functionalities beyond our comprehensive offerings, we are more than open to crafting a bespoke proposal to meet those specific requirements.
        </p>
      </div>

      <div className="services-features-grid">
        <ServiceFeature
          title="Strategic Express Marketing Analysis"
          description=" for Effective Website Prototyping. We explore goals, conduct competitor research, and formulate Unique Selling Propositions (USPs). A streamlined, yet often sufficient, set of services."
          iconType="strategy"
        />
        <ServiceFeature
          title="Exceptional Designs, Every Time."
          description=" We prioritize uniqueness, ensuring each project is truly one-of-a-kind. From logos to websites, our designs are crafted to make your company stand out in a crowd."
          iconType="design"
        />
        <ServiceFeature
          title="Responsive Layouts."
          description=" Understanding the nuances of modern web traffic, we create responsive designs (and sometimes separate mobile versions) for your website, ensuring it looks great on all common device sizes. With no extra charge."
          iconType="responsive"
        />
        <ServiceFeature
          title="Essential SEO Optimization."
          description=" We meticulously structure every website section for optimal search engine indexing. Plus, we'll set up the foundational configurations for Google Analytics and other search engines to ensure comprehensive tracking and insights."
          iconType="seo"
        />
        <ServiceFeature
          title="Comprehensive Support."
          description=" For the first 2 weeks after project delivery, we offer user training, technical support, and make corrective changes (excluding structural alterations) upon request, all accompanied by instructional videos at no additional cost."
          iconType="support"
        />
      </div>
      
      <div className="services-tab-cta">
        <h3 className="services-cta-title">Want to see what&apos;s included and estimate the costs?</h3>
        <Link href="/estimate#websites" className="services-cta-button">
          Learn More
        </Link>
      </div>
    </div>
  );
}

// Graphic Design Tab Component  
function GraphicTab() {
  return (
    <div className="services-tab-content">
      <div className="services-tab-header">
        <div className="services-tab-title-row">
          <h1 className="services-tab-title">Graphic Design</h1>
          <h6 className="services-tab-price">starting from $350</h6>
        </div>
        <p className="services-tab-description">
          For every client, we offer a curated suite of services tailored to your unique needs, all within our standard project fee. Should your project call for specialized features or functionalities beyond our comprehensive offerings, we are more than open to crafting a bespoke proposal to meet those specific requirements.
        </p>
      </div>

      <div className="services-features-grid">
        <ServiceFeature
          title="Impactful Brand Discovery and Strategy."
          description=" Before we put pencil to paper, we delve into your business ethos, goals, and target audience. This deep dive informs every choice we make, ensuring your graphic elements are both visually stunning and strategically sound."
          iconType="brand"
        />
        <ServiceFeature
          title="Creative Concepts That Resonate."
          description=" Our design process begins with understanding your vision and translating it into compelling visual narratives. We craft concepts that not only look exceptional but also communicate your brand's core message effectively."
          iconType="creative"
        />
        <ServiceFeature
          title="Versatile Design Solutions."
          description=" From business cards to billboards, our graphic design services span across all mediums. We ensure consistency in your brand&apos;s visual identity whether it&apos;s digital or print applications."
          iconType="versatile"
        />
        <ServiceFeature
          title="Collaborative Design Process."
          description=" We believe the best designs come from collaboration. Throughout the project, we work closely with you, incorporating your feedback and ensuring the final product exceeds your expectations."
          iconType="collaborative"
        />
      </div>
      
      <div className="services-tab-cta">
        <h3 className="services-cta-title">Want to see what&apos;s included and estimate the costs?</h3>
        <Link href="/estimate#graphic" className="services-cta-button">
          Learn More
        </Link>
      </div>
    </div>
  );
}

// Photo & Video Tab Component  
function PhotoVideoTab() {
  return (
    <div className="services-tab-content">
      <div className="services-tab-header">
        <div className="services-tab-title-row">
          <h1 className="services-tab-title">Photo & Video</h1>
          <h6 className="services-tab-price">starting from $450</h6>
        </div>
        <p className="services-tab-description">
          For every client, we offer a curated suite of services tailored to your unique needs, all within our standard project fee. Should your project call for specialized features or functionalities beyond our comprehensive offerings, we are more than open to crafting a bespoke proposal to meet those specific requirements.
        </p>
      </div>

      <div className="services-features-grid">
        <div className="service-feature">
          <div className="service-feature-text">
            <h3 className="service-feature-title">Professional Photography.</h3>
            <p className="service-feature-description"> From product shots to corporate headshots, we capture high-quality images that tell your brand&apos;s story. Our photography services ensure your visual content stands out across all platforms.</p>
          </div>
        </div>
        <div className="service-feature">
          <div className="service-feature-text">
            <h3 className="service-feature-title">Video Production & Editing.</h3>
            <p className="service-feature-description"> We create compelling video content from concept to final cut. Whether it&apos;s promotional videos, corporate presentations, or social media content, we deliver professional video solutions.</p>
          </div>
        </div>
        <div className="service-feature">
          <div className="service-feature-text">
            <h3 className="service-feature-title">Social Media Content.</h3>
            <p className="service-feature-description"> Specialized content creation for social platforms. We understand the unique requirements of different social channels and create optimized visual content that engages your audience.</p>
          </div>
        </div>
        <div className="service-feature">
          <div className="service-feature-text">
            <h3 className="service-feature-title">Brand Photography.</h3>
            <p className="service-feature-description"> Consistent visual identity across all your brand touchpoints. We develop and maintain a cohesive photographic style that aligns with your brand guidelines and messaging.</p>
          </div>
        </div>
      </div>
      
      <div className="services-tab-cta">
        <h3 className="services-cta-title">Want to see what&apos;s included and estimate the costs?</h3>
        <Link href="/estimate#photo" className="services-cta-button">
          Learn More
        </Link>
      </div>
    </div>
  );
}

// Service Feature Component
interface ServiceFeatureProps {
  title: string;
  description: string;
  iconType: string;
}

function ServiceFeature({ title, description, iconType }: ServiceFeatureProps) {
  return (
    <div className="service-feature">
      <div className="service-feature-icon">
        <ServiceIcon type={iconType} />
      </div>
      <div className="service-feature-content">
        <p className="service-feature-text">
          <span className="service-feature-title">{title}</span>
          <span className="service-feature-description">{description}</span>
        </p>
      </div>
    </div>
  );
}

// Service Icons Component using detailed SVG icons
function ServiceIcon({ type }: { type: string }) {
  const getIcon = () => {
    switch (type) {
      case 'strategy':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M31.896,93c-3.552,0 -6.759,-2.24 -7.98,-5.575l-8.553,-23.303c-5.295,-0.533 -9.363,-5.012 -9.363,-10.44v-19.364c0,-5.621 4.398,-10.228 10.012,-10.489l32.688,-1.742l21.541,-11.599c0.905,-3.719 4.265,-6.488 8.259,-6.488h3c4.687,0 8.5,3.813 8.5,8.5v19.925l0.047,0.012c4.682,1.17 7.953,5.358 7.953,10.186v2.754c0,4.828 -3.271,9.017 -7.955,10.187l-0.045,0.011v18.925c0,4.687 -3.813,8.5 -8.5,8.5h-3c-3.942,0 -7.266,-2.698 -8.223,-6.344l-21.474,-10.737l-1.905,-0.102c-0.378,2.42 -1.781,4.506 -3.75,5.797l0.387,1.291l0.585,0.119c3.944,0.802 6.807,4.305 6.807,8.33v3.146c0,4.687 -3.813,8.5 -8.5,8.5z" fill="#000000"  opacity="0.35"></path>
                <path d="M29.896,91c-3.552,0 -6.759,-2.24 -7.98,-5.575l-8.553,-23.303c-5.295,-0.533 -9.363,-5.012 -9.363,-10.44v-19.364c0,-5.621 4.398,-10.228 10.012,-10.489l32.688,-1.742l21.541,-11.599c0.905,-3.719 4.265,-6.488 8.259,-6.488h3c4.687,0 8.5,3.813 8.5,8.5v19.925l0.047,0.012c4.682,1.17 7.953,5.358 7.953,10.186v2.754c0,4.828 -3.271,9.017 -7.955,10.187l-0.045,0.011v18.925c0,4.687 -3.813,8.5 -8.5,8.5h-3c-3.942,0 -7.266,-2.698 -8.223,-6.344l-21.474,-10.737l-1.905,-0.102c-0.378,2.42 -1.781,4.506 -3.75,5.797l0.387,1.291l0.585,0.119c3.944,0.802 6.807,4.305 6.807,8.33v3.146c0,4.687 -3.813,8.5 -8.5,8.5z" fill="#f2f2f2" ></path>
                <path d="M79.775,35.331l6.331,2.866c1.116,0.28 1.894,1.277 1.894,2.426v2.754c0,1.149 -0.778,2.146 -1.893,2.425l-6.193,2.806z" fill="#acca00" ></path>
                <path d="M75.105,73c-0.252,0 -0.458,-0.224 -0.458,-0.5v-2.918l-26.551,-13.562l-33.781,-1.84c-1.303,-0.062 -2.315,-1.159 -2.315,-2.498v-19.364c0,-1.339 1.012,-2.436 2.305,-2.497l33.816,-1.842l26.527,-14.592v-2.887c0,-0.276 0.205,-0.5 0.458,-0.5h4.448c0.252,0 0.458,0.224 0.458,0.5v62c0,0.276 -0.205,0.5 -0.458,0.5z" fill="#f6ffc2" ></path>
                <path d="M29.652,65.449l5.932,-1.415l2.916,-1.534l0.978,-9.796l-16.029,-1.951l3.102,10.719z" fill="#442afa" ></path>
                <path d="M15.107,53.399l12.912,29.79c0.289,0.787 1.039,1.311 1.878,1.311h10.531c1.105,0 2,-0.895 2,-2v-3.146c0,-0.951 -0.67,-1.771 -1.602,-1.96l-5.983,-0.894l-6.961,-23.202l-5.191,-0.404z" fill="#acca00" ></path>
                <path d="M48.983,26.98l-0.863,0.999l-33.816,1.842c-1.292,0.061 -2.304,1.158 -2.304,2.497v19.363c0,1.339 1.012,2.436 2.315,2.498l33.781,1.84l0.912,1.02z" fill="#daff00" ></path>
                <path d="M86.47,36.742l-4.97,-1.242v-25c0,-1.105 -0.895,-2 -2,-2h-3c-1.105,0 -2,0.895 -2,2v2l-26,14l-34.186,1.823c-2.135,0.099 -3.814,1.859 -3.814,3.996v19.363c0,2.137 1.68,3.896 3.814,3.996l3.742,0.368l9.963,27.144c0.289,0.787 1.039,1.311 1.878,1.311h10.531c1.105,0 2,-0.895 2,-2v-3.146c0,-0.951 -0.67,-1.771 -1.602,-1.96l-4.399,-0.895l-3.6,-12h3.673c1.105,0 2,-0.895 2,-2v-5.533l10,0.533l26,13v2c0,1.105 0.895,2 2,2h3c1.105,0 2,-0.895 2,-2v-24l4.97,-1.243c1.781,-0.445 3.03,-2.045 3.03,-3.881v-2.754c0,-1.834 -1.249,-3.434 -3.03,-3.88z" fill="none" stroke="#40396e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
              </g>
            </g>
          </svg>
        );
      case 'design':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M20,93c-4.971,0 -9,-4.029 -9,-9v-64c0,-4.971 4.029,-9 9,-9h64c4.971,0 9,4.029 9,9v64c0,4.971 -4.029,9 -9,9z" fill="#000000"  opacity="0.35"></path>
                <path d="M18,91c-4.971,0 -9,-4.029 -9,-9v-64c0,-4.971 4.029,-9 9,-9h64c4.971,0 9,4.029 9,9v64c0,4.971 -4.029,9 -9,9z" fill="#f2f2f2" ></path>
                <path d="M79.5,33.5h-59c-2.761,0 -5,-2.239 -5,-5v-8c0,-2.761 2.239,-5 5,-5h59c2.761,0 5,2.239 5,5v8c0,2.761 -2.239,5 -5,5z" fill="#daff00" ></path>
                <path d="M44.5,84.5h-25c-2.209,0 -4,-1.791 -4,-4v-37c0,-2.209 1.791,-4 4,-4h25c2.209,0 4,1.791 4,4v37c0,2.209 -1.791,4 -4,4z" fill="#daff00" ></path>
                <path d="M81.5,84.5h-24c-1.657,0 -3,-1.343 -3,-3v-5c0,-1.657 1.343,-3 3,-3h24c1.657,0 3,1.343 3,3v5c0,1.657 -1.343,3 -3,3z" fill="#daff00" ></path>
                <path d="M81.5,67.5h-24c-1.657,0 -3,-1.343 -3,-3v-5c0,-1.657 1.343,-3 3,-3h24c1.657,0 3,1.343 3,3v5c0,1.657 -1.343,3 -3,3z" fill="#daff00" ></path>
                <path d="M81.5,50.5h-24c-1.657,0 -3,-1.343 -3,-3v-5c0,-1.657 1.343,-3 3,-3h24c1.657,0 3,1.343 3,3v5c0,1.657 -1.343,3 -3,3z" fill="#daff00" ></path>
                <path d="M79.5,33.5h-59c-2.761,0 -5,-2.239 -5,-5v-8c0,-2.761 2.239,-5 5,-5h59c2.761,0 5,2.239 5,5v8c0,2.761 -2.239,5 -5,5z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M44.5,84.5h-25c-2.209,0 -4,-1.791 -4,-4v-37c0,-2.209 1.791,-4 4,-4h25c2.209,0 4,1.791 4,4v37c0,2.209 -1.791,4 -4,4z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M81.5,84.5h-24c-1.657,0 -3,-1.343 -3,-3v-5c0,-1.657 1.343,-3 3,-3h24c1.657,0 3,1.343 3,3v5c0,1.657 -1.343,3 -3,3z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M81.5,67.5h-24c-1.657,0 -3,-1.343 -3,-3v-5c0,-1.657 1.343,-3 3,-3h24c1.657,0 3,1.343 3,3v5c0,1.657 -1.343,3 -3,3z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M81.5,50.5h-24c-1.657,0 -3,-1.343 -3,-3v-5c0,-1.657 1.343,-3 3,-3h24c1.657,0 3,1.343 3,3v5c0,1.657 -1.343,3 -3,3z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
              </g>
            </g>
          </svg>
        );
      case 'responsive':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M33.5,95c-4.181,0 -7.798,-2.456 -9.486,-6h-7.514c-5.238,0 -9.5,-4.262 -9.5,-9.5v-56c0,-5.238 4.262,-9.5 9.5,-9.5h7.514c1.688,-3.544 5.306,-6 9.486,-6h37c4.181,0 5.264,5.067 9.486,6h7.514c5.238,0 9.5,4.262 9.5,9.5v56c0,5.238 -4.262,9.5 -9.5,9.5h-7.514c-1.688,3.544 -5.306,6 -9.486,6z" fill="#000000"  opacity="0.35"></path>
                <path d="M31.5,93c-4.181,0 -7.798,-2.456 -9.486,-6h-7.514c-5.238,0 -9.5,-4.262 -9.5,-9.5v-56c0,-5.238 4.262,-9.5 9.5,-9.5h7.514c1.688,-3.544 5.306,-6 9.486,-6h37c4.181,0 7.798,2.456 9.486,6h7.514c5.238,0 9.5,4.262 9.5,9.5v56c0,5.238 -4.262,9.5 -9.5,9.5h-7.514c-1.688,3.544 -5.306,6 -9.486,6z" fill="#f2f2f2" ></path>
                <path d="M32.5,80.5h-18c-1.657,0 -3,-1.343 -3,-3v-56c0,-1.657 1.343,-3 3,-3h18z" fill="#f2ffa3" ></path>
                <path d="M67.5,80.5h18c1.657,0 3,-1.343 3,-3v-56c0,-1.657 -1.343,-3 -3,-3h-18z" fill="#f2ffa3" ></path>
                <rect x="29" y="13" width="42" height="73" fill="#b6d500" ></rect>
                <path d="M85.5,18.5h-13v-2c0,-2.209 -1.791,-4 -4,-4h-37c-2.209,0 -4,1.791 -4,4v2h-13c-1.657,0 -3,1.343 -3,3v56c0,1.657 1.343,3 3,3h13v2c0,2.209 1.791,4 4,4h37c2.209,0 4,-1.791 4,-4v-2h13c1.657,0 3,-1.343 3,-3v-56c0,-1.657 -1.343,-3 -3,-3z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M61,27h-22c-1.105,0 -2,-0.895 -2,-2v0c0,-1.105 0.895,-2 2,-2h22c1.105,0 2,0.895 2,2v0c0,1.105 -0.895,2 -2,2z" fill="#f2ffa3" ></path>
                <path d="M61,36h-22c-1.105,0 -2,-0.895 -2,-2v0c0,-1.105 0.895,-2 2,-2h22c1.105,0 2,0.895 2,2v0c0,1.105 -0.895,2 -2,2z" fill="#f2ffa3" ></path>
                <path d="M61,57h-13c-1.105,0 -2,-0.895 -2,-2v0c0,-1.105 0.895,-2 2,-2h13c1.105,0 2,0.895 2,2v0c0,1.105 -0.895,2 -2,2z" fill="#f2ffa3" ></path>
                <path d="M61,67h-13c-1.105,0 -2,-0.895 -2,-2v0c0,-1.105 0.895,-2 2,-2h13c1.105,0 2,0.895 2,2v0c0,1.105 -0.895,2 -2,2z" fill="#f2ffa3" ></path>
                <path d="M61,77h-13c-1.105,0 -2,-0.895 -2,-2v0c0,-1.105 0.895,-2 2,-2h13c1.105,0 2,0.895 2,2v0c0,1.105 -0.895,2 -2,2z" fill="#f2ffa3" ></path>
                <circle cx="39" cy="55" r="3" fill="#f2ffa3" ></circle>
                <circle cx="39" cy="65" r="3" fill="#f2ffa3" ></circle>
                <circle cx="39" cy="75" r="3" fill="#f2ffa3" ></circle>
              </g>
            </g>
          </svg>
        );
      case 'seo':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M93,79.5v-48c0,-3.584 -2.916,-6.5 -6.5,-6.5h-1.364l2.587,-8.622c0.146,-0.482 0.231,-0.974 0.263,-1.502l0.012,-0.323l-0.004,-0.122c-0.003,-0.291 -0.024,-0.58 -0.065,-0.864l-0.01,-0.363l-0.43,-1.293l-0.104,-0.164c-0.131,-0.276 -0.28,-0.543 -0.447,-0.796l-0.122,-0.188l-0.101,-0.136c-0.356,-0.479 -0.772,-0.905 -1.302,-1.314l-0.181,-0.133l-0.102,-0.064c-0.358,-0.241 -0.742,-0.447 -1.158,-0.619l-0.264,-0.12l-0.337,-0.102c-0.341,-0.103 -0.686,-0.175 -1.03,-0.218l-0.235,-0.057h-12.606c-3.584,0 -6.5,2.916 -6.5,6.5c0,1.319 0.396,2.548 1.073,3.575l-1.701,1.105l-0.27,-0.27c-1.227,-1.232 -2.862,-1.91 -4.601,-1.91c-1.394,0 -2.725,0.436 -3.845,1.259l-10.504,7.701l-0.051,-0.051c-1.228,-1.231 -2.862,-1.909 -4.601,-1.909c-1.207,0 -2.388,0.335 -3.406,0.965l-26.001,16c-1.478,0.91 -2.514,2.34 -2.916,4.029c-0.402,1.69 0.878,2.436 1.787,3.912c0.93,1.512 2.398,2.54 4.079,2.922c-0.027,0.237 -1.043,1.478 -1.043,1.723v25.624c-2.863,0.679 -5,3.257 -5,6.325c0,3.584 2.916,6.5 6.5,6.5h78c3.584,0 6.5,-2.916 6.5,-6.5c0,-2.699 -1.653,-5.019 -4,-6z" fill="#000000"  opacity="0.35"></path>
                <path d="M91,77.5v-48c0,-3.584 -2.916,-6.5 -6.5,-6.5h-1.364l2.587,-8.622c0.146,-0.482 0.231,-0.974 0.263,-1.502l0.012,-0.323l-0.004,-0.122c-0.003,-0.291 -0.024,-0.58 -0.065,-0.864l-0.01,-0.363l-0.43,-1.293l-0.104,-0.164c-0.131,-0.276 -0.28,-0.543 -0.447,-0.796l-0.122,-0.188l-0.101,-0.136c-0.356,-0.479 -0.772,-0.905 -1.302,-1.314l-0.181,-0.133l-0.102,-0.064c-0.358,-0.241 -0.742,-0.447 -1.158,-0.619l-0.264,-0.12l-0.337,-0.102c-0.341,-0.103 -0.686,-0.175 -1.03,-0.218l-0.235,-0.057h-12.606c-3.584,0 -6.5,2.916 -6.5,6.5c0,1.319 0.396,2.548 1.073,3.575l-1.701,1.105l-0.27,-0.27c-1.227,-1.232 -2.862,-1.91 -4.601,-1.91c-1.394,0 -2.725,0.436 -3.845,1.259l-10.504,7.701l-0.051,-0.051c-1.228,-1.231 -2.862,-1.909 -4.601,-1.909c-1.207,0 -2.388,0.335 -3.406,0.965l-26.001,16c-1.478,0.91 -2.514,2.34 -2.916,4.029c-0.402,1.69 -0.122,3.436 0.787,4.912c0.93,1.512 2.398,2.54 4.079,2.922c-0.027,0.237 -0.043,0.478 -0.043,0.723v25.624c-2.863,0.679 -5,3.257 -5,6.325c0,3.584 2.916,6.5 6.5,6.5h78c3.584,0 6.5,-2.916 6.5,-6.5c0,-2.699 -1.653,-5.019 -4,-6z" fill="#f2f2f2" ></path>
                <path d="M27,83h-11.5v-31.449h12z" fill="#daff00" ></path>
                <path d="M65.5,83.5h-11.5l-0.5,-47h12z" fill="#daff00" ></path>
                <path d="M84.5,83.5h-11.5l-0.5,-54h12z" fill="#daff00" ></path>
                <rect x="15.5" y="51.551" width="12" height="31.949" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></rect>
                <path d="M46,83h-11.5v-38.508h12z" fill="#daff00" ></path>
                <rect x="34.5" y="44.492" width="12" height="39.008" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></rect>
                <rect x="53.5" y="36.5" width="12" height="47" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></rect>
                <rect x="72.5" y="29.5" width="12" height="54" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></rect>
                <path d="M10.5,83.5h78" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M67.5,12.5h12l-20,13l-4,-4l-15,11l-4,-4l-26,16" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M76.5,22.5l3,-10" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
              </g>
            </g>
          </svg>
        );
      case 'support':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero"  strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M88.647,94.201c-5.843,0 -11.676,-1.114 -16.966,-3.232c-1.608,0.218 -3.233,0.328 -4.849,0.328c-13.934,0 -25.885,-7.665 -30.38,-19.049c-0.62,-0.058 -1.242,-0.131 -1.864,-0.219c-5.852,2.37 -12.313,3.617 -18.784,3.617c-1.083,0 -2.182,-0.035 -3.265,-0.104c-2.351,-0.148 -4.442,-1.562 -5.457,-3.69c-1.016,-2.131 -0.795,-4.649 0.576,-6.571c1.357,-1.906 2.641,-3.891 3.834,-5.928c-4.266,-5.289 -6.577,-11.645 -6.577,-18.248c0,-17.263 15.775,-31.308 35.167,-31.308c16.945,0 31.035,10.396 34.398,24.752c14.266,3.089 24.602,14.558 24.602,27.963c0,5.932 -2.026,11.652 -5.77,16.447c0.995,1.675 2.061,3.312 3.185,4.891c1.365,1.915 1.587,4.43 0.576,6.559c-1.018,2.136 -3.109,3.55 -5.462,3.698c-0.984,0.062 -1.981,0.094 -2.964,0.094z" fill="#000000" opacity="0.35"></path>
                <path d="M86.647,92.201c-5.843,0 -11.676,-1.114 -16.966,-3.232c-1.608,0.218 -3.233,0.328 -4.849,0.328c-13.934,0 -25.885,-7.665 -30.38,-19.049c-0.62,-0.058 -1.242,-0.131 -1.864,-0.219c-5.852,2.37 -12.313,3.617 -18.784,3.617c-1.083,0 -2.182,-0.035 -3.265,-0.104c-2.351,-0.148 -4.442,-1.562 -5.457,-3.69c-1.016,-2.131 -0.795,-4.649 0.576,-6.571c1.357,-1.906 2.641,-3.891 3.834,-5.928c-4.266,-5.289 -6.577,-11.645 -6.577,-18.248c0,-17.263 15.775,-31.308 35.167,-31.308c16.945,0 31.035,10.396 34.398,24.752c14.266,3.089 24.602,14.558 24.602,27.963c0,5.932 -2.026,11.652 -5.77,16.447c0.995,1.675 2.061,3.312 3.185,4.891c1.365,1.915 1.587,4.43 0.576,6.559c-1.018,2.136 -3.109,3.55 -5.462,3.698c-0.984,0.062 -1.981,0.094 -2.964,0.094z" fill="#f2f2f2"></path>
                <path d="M90.583,60.513c0,-12.307 -11.529,-22.284 -25.75,-22.284c-14.221,0 -25.75,9.977 -25.75,22.284c0,12.307 11.529,22.284 25.75,22.284c1.947,0 3.842,-0.193 5.665,-0.548c5.459,2.496 11.848,3.804 18.705,3.371c-2.202,-3.093 -4.152,-6.315 -5.849,-9.634c4.473,-4.009 7.229,-9.461 7.229,-15.473z" fill="#b9d803"></path>
                <path d="M38.083,15.636c-15.031,0 -27.216,10.545 -27.216,23.552c0,6.354 2.913,12.117 7.64,16.353c-1.794,3.507 -3.854,6.913 -6.182,10.182c7.248,0.458 14,-0.925 19.77,-3.562c1.927,0.375 3.929,0.579 5.988,0.579c15.031,0 27.216,-10.545 27.216,-23.552c0,-13.007 -12.185,-23.552 -27.216,-23.552z" fill="#daff00"></path>
                <path d="M43.792,46.35c0.213,0.347 0.293,0.663 0.24,0.95c-0.054,0.286 -0.188,0.526 -0.4,0.72c-0.212,0.194 -0.47,0.316 -0.77,0.37c-0.3,0.053 -0.601,0.023 -0.9,-0.09c-0.3,-0.114 -0.557,-0.33 -0.77,-0.65l-1.42,-2.32c-0.334,-0.52 -0.907,-0.78 -1.721,-0.78c-1.387,-0.014 -2.6,-0.32 -3.64,-0.92c-1.04,-0.6 -1.85,-1.446 -2.43,-2.54c-0.58,-1.093 -0.87,-2.366 -0.87,-3.82c0,-1.466 0.29,-2.743 0.87,-3.83c0.58,-1.086 1.39,-1.93 2.43,-2.53c1.04,-0.6 2.26,-0.9 3.66,-0.9c1.399,0 2.623,0.3 3.67,0.9c1.047,0.6 1.86,1.443 2.439,2.53c0.58,1.087 0.87,2.357 0.87,3.81c0,1.534 -0.319,2.863 -0.96,3.99c-0.64,1.127 -1.513,1.977 -2.62,2.55c0.587,0.173 1.094,0.6 1.521,1.28zM38.073,41.91c1.173,0 2.09,-0.41 2.75,-1.23c0.66,-0.82 0.99,-1.957 0.99,-3.41c0,-1.466 -0.327,-2.603 -0.98,-3.41c-0.653,-0.806 -1.573,-1.21 -2.76,-1.21c-1.16,0 -2.07,0.404 -2.73,1.21c-0.66,0.807 -0.989,1.944 -0.989,3.41c0,1.454 0.329,2.59 0.989,3.41c0.659,0.82 1.57,1.23 2.73,1.23z" fill="#442afa"></path>
                <path d="M58.885,67.75c-0.56,0 -0.96,-0.187 -1.199,-0.56c-0.24,-0.373 -0.233,-0.833 0.02,-1.38l5.12,-11.22c0.213,-0.453 0.467,-0.783 0.76,-0.99c0.293,-0.207 0.634,-0.31 1.021,-0.31c0.387,0 0.727,0.103 1.02,0.31c0.293,0.207 0.54,0.537 0.74,0.99l5.16,11.22c0.253,0.56 0.263,1.023 0.03,1.39c-0.234,0.367 -0.61,0.55 -1.131,0.55c-0.453,0 -0.803,-0.107 -1.05,-0.32c-0.247,-0.213 -0.463,-0.546 -0.649,-1l-0.841,-1.92h-6.579l-0.82,1.92c-0.2,0.467 -0.414,0.804 -0.641,1.01c-0.227,0.206 -0.548,0.31 -0.961,0.31zM64.566,56.77l-2.221,5.32h4.521l-2.26,-5.32z" fill="#442afa"></path>
                <path d="M86.647,87.201c-5.69,0 -11.281,-1.157 -16.335,-3.391c-1.81,0.324 -3.65,0.487 -5.479,0.487c-13.062,0 -24.053,-7.867 -26.672,-18.883c-2.076,0.011 -4.151,-0.18 -6.2,-0.549c-6.486,2.875 -13.77,4.149 -21.105,3.688c-0.543,-0.034 -1.025,-0.36 -1.259,-0.852c-0.234,-0.492 -0.184,-1.071 0.132,-1.515c2.157,-3.029 4.13,-6.232 5.877,-9.536c-4.969,-4.832 -7.69,-11.02 -7.69,-17.544c0,-14.506 13.533,-26.308 30.167,-26.308c15.858,0 28.779,10.487 30.055,24.112c13.53,1.433 23.945,11.585 23.945,23.604c0,5.866 -2.432,11.431 -6.874,15.789c1.549,2.92 3.3,5.758 5.216,8.448c0.315,0.444 0.366,1.023 0.132,1.515c-0.234,0.492 -0.716,0.818 -1.26,0.852c-0.884,0.055 -1.768,0.083 -2.65,0.083zM70.498,80.749c0.214,0 0.427,0.046 0.624,0.136c4.708,2.153 9.946,3.283 15.29,3.315c-1.602,-2.428 -3.074,-4.951 -4.393,-7.532c-0.31,-0.606 -0.173,-1.345 0.334,-1.8c4.34,-3.889 6.73,-8.988 6.73,-14.355c0,-10.827 -9.862,-19.928 -22.452,-20.721c-0.769,-0.048 -1.376,-0.671 -1.405,-1.441c-0.47,-12.646 -12.393,-22.553 -27.144,-22.553c-14.98,0 -27.167,10.456 -27.167,23.308c0,6.025 2.681,11.746 7.548,16.108c0.507,0.455 0.645,1.194 0.334,1.8c-1.517,2.965 -3.212,5.858 -5.056,8.632c6.056,0.001 12.051,-1.257 17.409,-3.706c0.284,-0.13 0.601,-0.169 0.91,-0.108c2.395,0.466 4.863,0.65 7.257,0.555c0.777,-0.01 1.406,0.501 1.536,1.24c1.767,10.074 12.076,17.67 23.979,17.67c1.796,0 3.605,-0.175 5.378,-0.52c0.096,-0.019 0.192,-0.028 0.288,-0.028z" fill="#3d3c44"></path>
              </g>
            </g>
          </svg>
        );
      case 'brand':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M14.5,88c-3.584,0 -6.5,-2.916 -6.5,-6.5v-59c0,-3.584 2.916,-6.5 6.5,-6.5h75c3.584,0 6.5,2.916 6.5,6.5v59c0,3.584 -2.916,6.5 -6.5,6.5z" fill="#35332f" opacity="0.35"></path>
                <path d="M12.5,86c-3.584,0 -6.5,-2.916 -6.5,-6.5v-59c0,-3.584 2.916,-6.5 6.5,-6.5h75c3.584,0 6.5,2.916 6.5,6.5v59c0,3.584 -2.916,6.5 -6.5,6.5z" fill="#f2f2f2"></path>
                <rect x="12.5" y="20.5" width="75" height="59" fill="#ffffff"></rect>
                <path d="M79,31h8.5v-10.5h-10.5v10.5v4h-14v-14.5h-50.5v32.5h31.5v26.5h43.5v-33h-8.5v-11.5zM61,46.5v1v3.5h-16v-14h16z" fill="#35332f" opacity="0.35"></path>
                <rect x="13" y="21" width="30" height="30" fill="#daff00"></rect>
                <rect x="45" y="21" width="16" height="14" fill="#7a776f"></rect>
                <rect x="63" y="37" width="14" height="9.5" fill="#c6e700"></rect>
                <rect x="79" y="21" width="8" height="8" fill="#daff00"></rect>
                <rect x="46" y="53" width="15" height="26" fill="#c6e700"></rect>
                <rect x="63" y="48.5" width="24" height="30.5" fill="#7a776f"></rect>
                <path d="M87.5,81h-75c-0.829,0 -1.5,-0.672 -1.5,-1.5v-59c0,-0.829 0.671,-1.5 1.5,-1.5h75c0.828,0 1.5,0.671 1.5,1.5v59c0,0.828 -0.672,1.5 -1.5,1.5zM14,78h72v-56h-72z" fill="#35332f"></path>
              </g>
            </g>
          </svg>
        );
      case 'creative':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M50.803,89.989c-1.434,0 -2.855,-0.473 -4.002,-1.334l-1.366,-1.022c-0.61,-0.456 -1.394,-0.718 -2.155,-0.718h-29.948c-4.812,0 -8.726,-3.914 -8.726,-8.726v-54.41c0,-4.812 3.914,-8.726 8.726,-8.726h29.948c2.604,0 5.195,0.616 7.523,1.767c2.33,-1.151 4.919,-1.767 7.523,-1.767h29.948c4.812,0 8.726,3.914 8.726,8.726v54.41c0,4.812 -3.914,8.726 -8.726,8.726h-29.948c-0.76,0 -1.545,0.262 -2.156,0.719l-1.37,1.025c-1.142,0.857 -2.563,1.33 -3.997,1.33z" fill="#35332f" opacity="0.35"></path>
                <path d="M48.75,87.936c-1.434,0 -2.855,-0.473 -4.002,-1.334l-1.366,-1.022c-0.61,-0.456 -1.394,-0.718 -2.155,-0.718h-29.948c-4.812,0 -8.726,-3.914 -8.726,-8.726v-54.41c0,-4.812 3.914,-8.726 8.726,-8.726h29.948c2.604,0 5.195,0.616 7.523,1.767c2.33,-1.151 4.919,-1.767 7.523,-1.767h29.948c4.812,0 8.726,3.914 8.726,8.726v54.41c0,4.812 -3.914,8.726 -8.726,8.726h-29.948c-0.76,0 -1.545,0.262 -2.156,0.719l-1.369,1.025c-1.143,0.857 -2.564,1.33 -3.998,1.33z" fill="#f2f2f2"></path>
                <path d="M9.226,76.136v-54.41c0,-1.134 0.919,-2.053 2.053,-2.053h29.947c2.218,0 4.376,0.719 6.152,2.048l1.371,1.027l1.371,-1.027c1.776,-1.329 3.934,-2.048 6.152,-2.048h29.949c1.134,0 2.053,0.919 2.053,2.053v14.115v40.295c0,1.134 -0.919,2.053 -2.053,2.053h-29.947c-2.218,0 -4.376,0.719 -6.152,2.048l-1.371,1.027l-1.371,-1.027c-1.776,-1.329 -3.934,-2.048 -6.152,-2.048h-29.949c-1.135,0 -2.053,-0.92 -2.053,-2.053z" fill="#daff00"></path>
                <rect x="47.21" y="22.239" width="3.08" height="58.516" fill="#444d62" opacity="0.35"></rect>
                <path d="M80.49,37h-10.03c-0.828,0 -1.5,-0.672 -1.5,-1.5c0,-0.828 0.672,-1.5 1.5,-1.5h10.03c0.828,0 1.5,0.672 1.5,1.5c0,0.828 -0.672,1.5 -1.5,1.5z" fill="#7a776f"></path>
                <path d="M74,40.54v-10.037c0,-0.828 0.672,-1.5 1.5,-1.5c0.828,0 1.5,0.672 1.5,1.5v10.037c0,0.828 -0.672,1.5 -1.5,1.5c-0.828,0 -1.5,-0.672 -1.5,-1.5z" fill="#7a776f"></path>
                <path d="M71.49,63h-10.03c-0.828,0 -1.5,-0.672 -1.5,-1.5c0,-0.828 0.672,-1.5 1.5,-1.5h10.03c0.828,0 1.5,0.672 1.5,1.5c0,0.828 -0.672,1.5 -1.5,1.5z" fill="#7a776f"></path>
                <path d="M65,66.54v-10.037c0,-0.828 0.672,-1.5 1.5,-1.5c0.828,0 1.5,0.672 1.5,1.5v10.037c0,0.828 -0.672,1.5 -1.5,1.5c-0.828,0 -1.5,-0.672 -1.5,-1.5z" fill="#7a776f"></path>
                <g fill="#7a776f">
                  <path d="M34.49,44h-10.03c-0.828,0 -1.5,-0.672 -1.5,-1.5c0,-0.828 0.672,-1.5 1.5,-1.5h10.03c0.828,0 1.5,0.672 1.5,1.5c0,0.828 -0.672,1.5 -1.5,1.5z"></path>
                  <path d="M28,47.54v-10.037c0,-0.828 0.672,-1.5 1.5,-1.5c0.828,0 1.5,0.672 1.5,1.5v10.037c0,0.828 -0.672,1.5 -1.5,1.5c-0.828,0 -1.5,-0.672 -1.5,-1.5z"></path>
                </g>
                <g fill="#444d62">
                  <path d="M48.75,82.803c-0.324,0 -0.65,-0.103 -0.922,-0.307l-1.371,-1.026c-1.501,-1.123 -3.358,-1.741 -5.231,-1.741h-29.947c-1.981,0 -3.593,-1.612 -3.593,-3.593v-54.41c0,-1.981 1.612,-3.593 3.593,-3.593h29.948c2.533,0 5.046,0.836 7.075,2.355l0.448,0.336l0.449,-0.336c2.03,-1.518 4.543,-2.355 7.075,-2.355h29.947c1.981,0 3.593,1.612 3.593,3.593v54.41c0,1.981 -1.612,3.593 -3.593,3.593h-29.948c-1.871,0 -3.73,0.619 -5.231,1.741l-1.371,1.026c-0.271,0.204 -0.597,0.307 -0.921,0.307zM11.279,21.213c-0.282,0 -0.513,0.231 -0.513,0.513v54.41c0,0.282 0.231,0.513 0.513,0.513h29.948c2.533,0 5.046,0.836 7.075,2.355l0.448,0.336l0.449,-0.336c2.03,-1.518 4.543,-2.355 7.075,-2.355h29.947c0.282,0 0.513,-0.231 0.513,-0.513v-54.41c0,-0.282 -0.231,-0.513 -0.513,-0.513h-29.948c-1.871,0 -3.73,0.619 -5.231,1.741l-1.371,1.026c-0.545,0.409 -1.3,0.409 -1.845,0l-1.371,-1.026c-1.501,-1.123 -3.358,-1.741 -5.231,-1.741z"></path>
                </g>
              </g>
            </g>
          </svg>
        );
      case 'versatile':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M93,33.46484v-11.92969c0,-5.80957 -4.63574,-10.53516 -10.33301,-10.53516h-23.33398c-2.85815,0 -5.44824,1.19019 -7.3208,3.10889c-1.88525,-1.91638 -4.50391,-3.10889 -7.39795,-3.10889h-23.2168c-5.7334,0 -10.39746,4.66406 -10.39746,10.39746v35.2168c0,2.87964 1.17957,5.48792 3.07922,7.37109c-1.8988,1.87463 -3.07922,4.4751 -3.07922,7.34766v11.33398c0,5.69727 4.63574,10.33301 10.33301,10.33301h23.33398c2.86462,0 5.45947,-1.17334 7.33301,-3.06299c1.87354,1.88965 4.46838,3.06299 7.33301,3.06299h23.33398c5.69727,0 10.33301,-4.63574 10.33301,-10.33301v-34.33398c0,-2.88013 -1.18726,-5.48608 -3.09485,-7.36194c1.90759,-1.91248 3.09485,-4.56946 3.09485,-7.50623z" fill="#35332f" opacity="0.35"></path>
                <path d="M91,31.46484v-11.92969c0,-5.80957 -4.63574,-10.53516 -10.33301,-10.53516h-23.33398c-2.85815,0 -5.44824,1.19019 -7.3208,3.10889c-1.88525,-1.91638 -4.50391,-3.10889 -7.39795,-3.10889h-23.2168c-5.7334,0 -10.39746,4.66406 -10.39746,10.39746v35.2168c0,2.87964 1.17957,5.48792 3.07922,7.37109c-1.8988,1.87463 -3.07922,4.4751 -3.07922,7.34766v11.33398c0,5.69727 4.63574,10.33301 10.33301,10.33301h23.33398c2.86462,0 5.45947,-1.17334 7.33301,-3.06299c1.87354,1.88965 4.46838,3.06299 7.33301,3.06299h23.33398c5.69727,0 10.33301,-4.63574 10.33301,-10.33301v-34.33398c0,-2.88013 -1.18726,-5.48608 -3.09485,-7.36194c1.90759,-1.91248 3.09485,-4.56946 3.09485,-7.50623z" fill="#f2f2f2"></path>
                <path d="M42.60227,58.5h-23.21686c-2.14585,0 -3.88542,-1.73956 -3.88542,-3.88542v-35.21685c0,-2.15266 1.74507,-3.89773 3.89773,-3.89773h23.21685c2.14586,0 3.88542,1.73956 3.88542,3.88542v35.21686c0,2.15266 -1.74507,3.89773 -3.89773,3.89773z" fill="#daff00"></path>
                <path d="M42.60254,60h-23.2168c-2.96973,0 -5.38574,-2.41602 -5.38574,-5.38574v-35.2168c0,-2.97656 2.4209,-5.39746 5.39746,-5.39746h23.2168c2.96973,0 5.38574,2.41602 5.38574,5.38574v35.2168c0,2.97656 -2.4209,5.39746 -5.39746,5.39746zM19.39746,17c-1.32227,0 -2.39746,1.0752 -2.39746,2.39746v35.2168c0,1.31543 1.07031,2.38574 2.38574,2.38574h23.2168c1.32227,0 2.39746,-1.0752 2.39746,-2.39746v-35.2168c0,-1.31543 -1.07031,-2.38574 -2.38574,-2.38574z" fill="#444d62"></path>
                <path d="M80.66666,35.5h-23.33333c-2.11709,0 -3.83333,-1.80657 -3.83333,-4.03509v-11.92982c0,-2.22852 1.71624,-4.03509 3.83333,-4.03509h23.33333c2.1171,0 3.83334,1.80657 3.83334,4.03509v11.92982c0,2.22852 -1.71624,4.03509 -3.83334,4.03509z" fill="#7a776f"></path>
                <path d="M80.66699,37h-23.33398c-2.94043,0 -5.33301,-2.4834 -5.33301,-5.53516v-11.92969c0,-3.05176 2.39258,-5.53516 5.33301,-5.53516h23.33398c2.94043,0 5.33301,2.4834 5.33301,5.53516v11.92969c0,3.05176 -2.39258,5.53516 -5.33301,5.53516zM57.33301,17c-1.28613,0 -2.33301,1.1377 -2.33301,2.53516v11.92969c0,1.39746 1.04688,2.53516 2.33301,2.53516h23.33398c1.28613,0 2.33301,-1.1377 2.33301,-2.53516v-11.92969c0,-1.39746 -1.04687,-2.53516 -2.33301,-2.53516z" fill="#444d62"></path>
                <path d="M42.66667,84.5h-23.33333c-2.11709,0 -3.83333,-1.71624 -3.83333,-3.83334v-11.33333c0,-2.1171 1.71624,-3.83334 3.83333,-3.83334h23.33333c2.11709,0 3.83333,1.71624 3.83333,3.83334v11.33333c0,2.1171 -1.71624,3.83334 -3.83333,3.83334z" fill="#7a776f"></path>
                <path d="M42.66699,86h-23.33398c-2.94043,0 -5.33301,-2.39258 -5.33301,-5.33301v-11.33398c0,-2.94043 2.39258,-5.33301 5.33301,-5.33301h23.33398c2.94043,0 5.33301,2.39258 5.33301,5.33301v11.33398c0,2.94043 -2.39258,5.33301 -5.33301,5.33301zM19.33301,67c-1.28613,0 -2.33301,1.04688 -2.33301,2.33301v11.33398c0,1.28613 1.04688,2.33301 2.33301,2.33301h23.33398c1.28613,0 2.33301,-1.04687 2.33301,-2.33301v-11.33398c0,-1.28613 -1.04687,-2.33301 -2.33301,-2.33301z" fill="#444d62"></path>
                <path d="M80.66666,84.5h-23.33333c-2.11709,0 -3.83333,-1.71624 -3.83333,-3.83334v-34.33333c0,-2.11709 1.71624,-3.83333 3.83333,-3.83333h23.33333c2.1171,0 3.83334,1.71624 3.83334,3.83333v34.33333c0,2.1171 -1.71624,3.83334 -3.83334,3.83334z" fill="#daff00"></path>
                <path d="M80.66699,86h-23.33398c-2.94043,0 -5.33301,-2.39258 -5.33301,-5.33301v-34.33398c0,-2.94043 2.39258,-5.33301 5.33301,-5.33301h23.33398c2.94043,0 5.33301,2.39258 5.33301,5.33301v34.33398c0,2.94043 -2.39258,5.33301 -5.33301,5.33301zM57.33301,44c-1.28613,0 -2.33301,1.04688 -2.33301,2.33301v34.33398c0,1.28613 1.04688,2.33301 2.33301,2.33301h23.33398c1.28613,0 2.33301,-1.04687 2.33301,-2.33301v-34.33398c0,-1.28613 -1.04687,-2.33301 -2.33301,-2.33301z" fill="#444d62"></path>
              </g>
            </g>
          </svg>
        );
      case 'collaborative':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,256,256">
            <g fillRule="nonzero" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M88.6,94.2c-5.8,0 -11.7,-1.1 -17,-3.2c-1.6,0.2 -3.2,0.3 -4.8,0.3c-13.7,0 -25.8,-7.8 -30.4,-19c-0.6,-0.1 -1.3,-0.1 -1.9,-0.2c-5.9,2.4 -12.3,3.6 -18.8,3.6c-1.1,0 -2.2,0 -3.3,-0.1c-2.4,-0.1 -4.4,-1.6 -5.5,-3.7c-1,-2.1 -0.8,-4.6 0.6,-6.6c1.4,-1.9 2.6,-3.9 3.8,-5.9c-4.3,-5.3 -6.6,-11.6 -6.6,-18.2c0,-17.3 15.8,-31.3 35.2,-31.3c16.6,0 31,10.6 34.4,24.7c14.3,3.1 24.6,14.6 24.6,28c0,5.9 -2,11.7 -5.8,16.4c1,1.7 2.1,3.3 3.2,4.9c1.4,1.9 1.6,4.4 0.6,6.6c-1,2.1 -3.1,3.6 -5.5,3.7c-0.8,0 -1.8,0 -2.8,0v0z" fill="#35332f" opacity="0.35"></path>
                <path d="M86.6,92.2c-5.8,0 -11.7,-1.1 -17,-3.2c-1.6,0.2 -3.2,0.3 -4.8,0.3c-13.7,0 -25.8,-7.8 -30.4,-19c-0.6,-0.1 -1.3,-0.1 -1.9,-0.2c-5.9,2.4 -12.3,3.6 -18.8,3.6c-1.1,0 -2.2,0 -3.3,-0.1c-2.4,-0.1 -4.4,-1.6 -5.5,-3.7c-1,-2.1 -0.8,-4.6 0.6,-6.6c1.4,-1.9 2.6,-3.9 3.8,-5.9c-4.3,-5.3 -6.6,-11.6 -6.6,-18.2c0,-17.3 15.8,-31.3 35.2,-31.3c16.6,0 31,10.6 34.4,24.7c14.3,3.1 24.6,14.6 24.6,28c0,5.9 -2,11.7 -5.8,16.4c1,1.7 2.1,3.3 3.2,4.9c1.4,1.9 1.6,4.4 0.6,6.6c-1,2.1 -3.1,3.6 -5.5,3.7c-0.8,0 -1.8,0 -2.8,0v0z" fill="#f2f2f2"></path>
                <path d="M90.6,60.5c0,-12.3 -11.5,-22.3 -25.8,-22.3c-14.3,0 -25.8,10 -25.8,22.3c0,12.3 11.5,22.3 25.8,22.3c1.9,0 3.8,-0.2 5.7,-0.5c5.5,2.5 11.8,3.8 18.7,3.4c-2.2,-3.1 -4.2,-6.3 -5.8,-9.6c4.4,-4.1 7.2,-9.6 7.2,-15.6z" fill="#7a776f"></path>
                <path d="M37.6,14.4c-15.3,0 -27.8,10.8 -27.8,24c0,6.5 3,12.4 7.8,16.7c-1.8,3.6 -3.9,7.1 -6.3,10.4c7.4,0.5 14.3,-0.9 20.2,-3.6c2,0.4 4,0.6 6.1,0.6c15.3,0 27.8,-10.8 27.8,-24c0,-13.2 -12.5,-24.1 -27.8,-24.1z" fill="#daff00"></path>
                <path d="M90.6,60.5c0,-11.8 -10.5,-21.4 -23.9,-22.2c-0.5,-13.3 -13.1,-24 -28.6,-24c-15.8,0 -28.7,11.1 -28.7,24.8c0,6.7 3.1,12.8 8,17.2c-1.9,3.7 -4.1,7.3 -6.5,10.7c7.6,0.5 14.7,-1 20.8,-3.8c2,0.4 4.1,0.6 6.3,0.6c0.4,0 0.9,0 1.3,0c1.9,10.7 12.6,18.9 25.5,18.9c1.9,0 3.8,-0.2 5.7,-0.5c5.5,2.5 11.8,3.8 18.7,3.4c-2.2,-3.1 -4.2,-6.3 -5.8,-9.6c4.4,-4 7.2,-9.5 7.2,-15.5z" fill="none" stroke="#444d62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path>
              </g>
            </g>
          </svg>
        );
      case 'camera':
      case 'video':
      case 'social':
      default:
        return null;
    }
  };

  return (
    <div className="service-icon">
      {getIcon()}
    </div>
  );
}