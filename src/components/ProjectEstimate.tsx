'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Footer from './Footer';
import HoneypotField from './HoneypotField';
import { trackLeadGeneration, trackNavigation } from '@/lib/analytics';

export default function ProjectEstimate() {
  const [activeTab, setActiveTab] = useState<'websites' | 'graphic' | 'photo'>('websites');

  useEffect(() => {
    // Handle hash-based routing for tabs
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'websites' || hash === 'graphic' || hash === 'photo') {
        setActiveTab(hash as 'websites' | 'graphic' | 'photo');
      }
    };

    // Check hash on initial load
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

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

    const animatedElements = document.querySelectorAll('.project-estimate .animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  const calculateWebsiteTotal = () => {
    let basePrice = 0;
    let timelineMultiplier = 1.0; // Default standard timeline (100%)
    let additionalFeatures = 0;
    
    // Check if website form exists
    const websiteForm = document.querySelector('.hack42-45-form-websites');
    if (!websiteForm) {
      console.log('Website form not found');
      return;
    }
    
    // Get base website price (radio button - only one selected)
    const websiteTypeRadio = document.querySelector('.hack42-45-form-websites input[name="website-type"]:checked') as HTMLInputElement;
    if (websiteTypeRadio) {
      basePrice = Number(websiteTypeRadio.getAttribute('base-price')) || 0;
      console.log('Base website price:', basePrice);
    }
    
    // Get timeline multiplier
    const timelineCheckboxes = document.querySelectorAll('.hack42-45-form-websites input[name^="timeline"]:checked') as NodeListOf<HTMLInputElement>;
    timelineCheckboxes.forEach((checkbox) => {
      timelineMultiplier = Number(checkbox.getAttribute('timeline-multiplier')) || 1.0;
      console.log('Timeline multiplier:', timelineMultiplier);
    });
    
    // Get additional features
    const featureCheckboxes = document.querySelectorAll('.hack42-45-form-websites input[name^="feature"]:checked') as NodeListOf<HTMLInputElement>;
    featureCheckboxes.forEach((checkbox) => {
      const featurePrice = Number(checkbox.getAttribute('add-value')) || 0;
      additionalFeatures += featurePrice;
      console.log('Adding feature:', featurePrice);
    });
    
    // Calculate total: (base price × timeline multiplier) + additional features
    const total = Math.round(basePrice * timelineMultiplier + additionalFeatures);
    
    console.log('Website calculation:', {
      basePrice,
      timelineMultiplier,
      additionalFeatures,
      total
    });
    
    // Note: total is calculated but not stored in state
    updateDisplay(total, '.hack45-added-value-2', '.hack45-send-value-2');
  };

  const calculateDesignTotal = () => {
    let basePrice = 0;
    let timelineMultiplier = 1.0; // Default standard timeline (100%)
    
    // Check if design form exists
    const designForm = document.querySelector('.hack42-45-form-design');
    if (!designForm) {
      console.log('Design form not found');
      return;
    }
    
    // Get base design service prices (multiple services can be selected)
    const serviceCheckboxes = document.querySelectorAll('.hack42-45-form-design input[name^="design-service"]:checked') as NodeListOf<HTMLInputElement>;
    serviceCheckboxes.forEach((checkbox) => {
      const servicePrice = Number(checkbox.getAttribute('add-value')) || 0;
      basePrice += servicePrice;
      console.log('Adding design service price:', servicePrice);
    });
    
    // Get timeline multiplier
    const timelineCheckboxes = document.querySelectorAll('.hack42-45-form-design input[name^="design-timeline"]:checked') as NodeListOf<HTMLInputElement>;
    timelineCheckboxes.forEach((checkbox) => {
      timelineMultiplier = Number(checkbox.getAttribute('timeline-multiplier')) || 1.0;
      console.log('Design timeline multiplier:', timelineMultiplier);
    });
    
    // Calculate total: base price × timeline multiplier
    const total = Math.round(basePrice * timelineMultiplier);
    
    console.log('Design calculation:', {
      basePrice,
      timelineMultiplier,
      total
    });
    
    // Note: total is calculated but not stored in state
    updateDisplay(total, '.hack45-added-value-3', '.hack45-send-value-3');
  };

  const calculatePhotoTotal = () => {
    let basePrice = 0;
    let timelineMultiplier = 1.0; // Default standard timeline (100%)
    let additionalServices = 0;
    
    // Check if photo form exists
    const photoForm = document.querySelector('.hack42-45-form-photo');
    if (!photoForm) {
      console.log('Photo form not found');
      return;
    }
    
    // Get base photo service price (radio button - only one selected)
    const photoServiceRadio = document.querySelector('.hack42-45-form-photo input[name="photo-service"]:checked') as HTMLInputElement;
    if (photoServiceRadio) {
      basePrice = Number(photoServiceRadio.getAttribute('base-price')) || 0;
      console.log('Base photo service price:', basePrice);
    }
    
    // Get timeline multiplier
    const timelineCheckboxes = document.querySelectorAll('.hack42-45-form-photo input[name^="photo-timeline"]:checked') as NodeListOf<HTMLInputElement>;
    timelineCheckboxes.forEach((checkbox) => {
      timelineMultiplier = Number(checkbox.getAttribute('timeline-multiplier')) || 1.0;
      console.log('Photo timeline multiplier:', timelineMultiplier);
    });
    
    // Get additional services
    const serviceCheckboxes = document.querySelectorAll('.hack42-45-form-photo input[name^="photo-additional"]:checked') as NodeListOf<HTMLInputElement>;
    serviceCheckboxes.forEach((checkbox) => {
      const servicePrice = Number(checkbox.getAttribute('add-value')) || 0;
      additionalServices += servicePrice;
      console.log('Adding photo service:', servicePrice);
    });
    
    // Calculate total: (base price × timeline multiplier) + additional services
    const total = Math.round(basePrice * timelineMultiplier + additionalServices);
    
    console.log('Photo calculation:', {
      basePrice,
      timelineMultiplier,
      additionalServices,
      total
    });
    
    // Note: total is calculated but not stored in state
    updateDisplay(total, '.hack45-added-value-4', '.hack45-send-value-4');
  };

  const updateDisplay = (sum: number, displaySelector: string, inputSelector: string) => {
    const formattedSum = new Intl.NumberFormat().format(sum);
    const displayElement = document.querySelector(displaySelector);
    if (displayElement) {
      displayElement.textContent = formattedSum;
    }
    const inputElement = document.querySelector(inputSelector) as HTMLInputElement;
    if (inputElement) {
      inputElement.value = formattedSum;
    }
  };

  useEffect(() => {
    // Set up event listeners after component mounts
    const setupCalculatorEvents = () => {
      // Calculator checkbox labels (website types, features, and design services)
      const websiteCheckboxLabels = document.querySelectorAll('.hack42-checkbox-label-2') as NodeListOf<HTMLElement>;
      console.log('Found', websiteCheckboxLabels.length, 'hack42-checkbox-label-2 elements');
      websiteCheckboxLabels.forEach((span) => {
        const handleClick = (e: Event) => {
          e.preventDefault();
          console.log('Span clicked:', span.className);
          // Find the input within the same label
          const labelElement = span.parentElement as HTMLLabelElement;
          const input = labelElement?.querySelector('input') as HTMLInputElement;
          
          if (input) {
            console.log('Found input:', input.name, 'type:', input.type, 'current state:', input.checked);
            
            if (input.type === 'radio') {
              // For radio buttons, clear all other selected states first
              const allWebsiteTypeSpans = document.querySelectorAll('.hack42-45-form-websites .hack42-checkbox-label-2');
              allWebsiteTypeSpans.forEach(s => s.classList.remove('selected'));
              
              // Set this radio button as checked
              input.checked = true;
              span.classList.add('selected');
              
              console.log('Website radio clicked:', input.name, 'checked:', input.checked, 'base-price:', input.getAttribute('base-price'));
            } else {
              // For checkboxes, toggle state
              input.checked = !input.checked;
              
              // Toggle selected class on the span
              if (input.checked) {
                span.classList.add('selected');
              } else {
                span.classList.remove('selected');
              }
              
              console.log('Website checkbox clicked:', input.name, 'checked:', input.checked, 'value:', input.getAttribute('add-value'));
            }
            
            // Determine which calculator to update based on the form
            const isDesignForm = span.closest('.hack42-45-form-design');
            const isPhotoForm = span.closest('.hack42-45-form-photo');
            if (isDesignForm) {
              calculateDesignTotal();
            } else if (isPhotoForm) {
              calculatePhotoTotal();
            } else {
              calculateWebsiteTotal();
            }
          } else {
            console.log('Could not find input for span:', span.className);
          }
        };
        
        // Remove existing listeners first
        span.removeEventListener('click', handleClick);
        span.addEventListener('click', handleClick);
      });

      // Design calculator checkbox labels (timeframe circles only)
      const designTimeframeLabels = document.querySelectorAll('.hack42-45-form-design .hack42-checkbox-label-3') as NodeListOf<HTMLElement>;
      designTimeframeLabels.forEach((span) => {
        const handleClick = (e: Event) => {
          e.preventDefault();
          // Find the checkbox within the same label
          const labelElement = span.parentElement as HTMLLabelElement;
          const checkbox = labelElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
          
          if (checkbox) {
            // For design timeframes, clear other timeframe selections first
            if (checkbox.name.includes('design-timeline')) {
              const allTimeframeSpans = document.querySelectorAll('.hack42-45-form-design .hack42-checkbox-label-3');
              allTimeframeSpans.forEach(s => s.classList.remove('selected'));
              const allTimeframeInputs = document.querySelectorAll('.hack42-45-form-design input[name*="design-timeline"]') as NodeListOf<HTMLInputElement>;
              allTimeframeInputs.forEach(input => input.checked = false);
            }
            
            // Set this checkbox as checked
            checkbox.checked = true;
            span.classList.add('selected');
            
            console.log('Design timeframe clicked:', checkbox.name, 'checked:', checkbox.checked, 'multiplier:', checkbox.getAttribute('timeline-multiplier'));
            calculateDesignTotal();
          }
        };
        
        // Remove existing listeners first
        span.removeEventListener('click', handleClick);
        span.addEventListener('click', handleClick);
      });
      
      // Design service cards (now using hack42-checkbox-label-2) will be handled by the website calculator event handler above

      // Back link functionality
      const backLink = document.querySelector('.back-link-text');
      if (backLink) {
        const handleBackClick = (e: Event) => {
          e.preventDefault();
          window.history.back();
        };
        backLink.removeEventListener('click', handleBackClick);
        backLink.addEventListener('click', handleBackClick);
      }
    };

    // Delay setup to ensure DOM is ready
    const timer = setTimeout(setupCalculatorEvents, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [activeTab]);

  return (
    <div className="project-estimate">
      {/* Hero Section */}
      <section className="hero-title-copy-services estimate">
        <div className="div-block-184">
          <div className="div-block-183">
            <div className="div-block-178-services">
              <div className="w-layout-blockcontainer graphic-title-wrap-copy-services w-container">
                <div className="graphic-copy-services">
                  <h1 className="dot_h1_pages">Estimate your project</h1>
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
                  <h2 className="dot_h2_subheader">Get Your Website Development Project Cost Online</h2>
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

      {/* Main Calculator Section */}
      <div className="section-main _14vw">
        <div className="container about-title brief">
          <div className="max-width-xlarge align-center">
            <h2 className="services-features-title">Services Features Overview</h2>
            
            {/* Tabs Navigation */}
            <div className="services-tabs">
              <div className="services-tabs-menu">
                <button 
                  className={`services-tab-button ${activeTab === 'graphic' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('graphic');
                    trackLeadGeneration.calculatorStart('graphic');
                  }}
                >
                  <span className="tab-dot">●</span>
                  <span className="tab-title">GRAPHIC DESIGN</span>
                </button>
                <button 
                  className={`services-tab-button ${activeTab === 'websites' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('websites');
                    trackLeadGeneration.calculatorStart('websites');
                  }}
                >
                  <span className="tab-dot">●</span>
                  <span className="tab-title">WEBSITES</span>
                </button>
                <button 
                  className={`services-tab-button ${activeTab === 'photo' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('photo');
                    trackLeadGeneration.calculatorStart('photo');
                  }}
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
                {/* Graphic Design Tab */}
                {activeTab === 'graphic' && (
                  <div className="services-tab-content">
                    <form className="hack42-45-form-design">
                      <h1 className="brief-title">Graphic Design Project Estimate</h1>
                      <div className="hack42-45-form-design-new _2">
                        <p className="paragraph brief hero">Please fill out the fields below to get an approximate cost for your project. This tool aims to give you a preliminary idea of your investment.</p>
                        
                        <h2 className="dot_forms_title sites estimate">Select Your Service:</h2>
                        
                        <DesignServiceOptions />
                        
                        <h3 className="dot_forms_title sites estimate">When your design has to be ready:</h3>
                        <DesignTimeframeOptions />
                        
                        <div className="hack42-45-form-right-3">
                          <div className="hack42-45-added-value-row-3">
                            <div className="text-block-70">CAD$</div>
                            <div className="hack45-added-value-3">0</div>
                            <input type="hidden" className="hack45-send-value-3" value="" />
                          </div>
                        </div>
                        
                        <QuoteBreakdown formType="design" />
                        
                        <LeadCaptureSection formType="design" />
                        
                      </div>
                    </form>
                  </div>
                )}

                {/* Website Tab */}
                {activeTab === 'websites' && (
                  <div className="services-tab-content">
                    <form className="hack42-45-form-websites">
                      <h1 className="brief-title">Website Project Estimate</h1>
                      <div className="hack42-45-form-left _2">
                        <p className="paragraph brief hero">Please fill out the fields below to get an approximate cost for your project. This tool aims to give you a preliminary idea of your investment.</p>
                        
                        <h2 className="dot_forms_title sites estimate">Estimated Number of Website Pages:</h2>
                        <WebsiteTypeOptions />
                        
                        <h2 className="dot_forms_title sites estimate">When your website has to be ready:</h2>
                        <WebsiteTimeframeOptions />
                        
                        <h2 className="dot_forms_title sites estimate">Features:</h2>
                        <WebsiteFeatureOptions />
                        
                        <div className="hack42-45-form-right-2">
                          <div className="hack42-45-added-value-row-2">
                            <div className="text-block-70">CAD$</div>
                            <div className="hack45-added-value-2">0</div>
                            <input type="hidden" className="hack45-send-value-2" value="" />
                          </div>
                        </div>
                        
                        <QuoteBreakdown formType="website" />
                        
                        <LeadCaptureSection formType="website" />
                        
                      </div>
                    </form>
                  </div>
                )}

                {/* Photo & Video Tab */}
                {activeTab === 'photo' && (
                  <div className="services-tab-content">
                    <form className="hack42-45-form-photo">
                      <h1 className="brief-title">Photo & Video Project Estimate</h1>
                      <div className="hack42-45-form-photo-new _2">
                        <p className="paragraph brief hero">Please fill out the fields below to get an approximate cost for your project. This tool aims to give you a preliminary idea of your investment.</p>
                        
                        <h2 className="dot_forms_title sites estimate">Select Your Service:</h2>
                        <PhotoVideoServiceOptions />
                        
                        <h3 className="dot_forms_title sites estimate">When your project has to be ready:</h3>
                        <PhotoVideoTimeframeOptions />
                        
                        <h3 className="dot_forms_title sites estimate">Additional Services:</h3>
                        <PhotoVideoAdditionalOptions />
                        
                        <div className="hack42-45-form-right-4">
                          <div className="hack42-45-added-value-row-4">
                            <div className="text-block-70">CAD$</div>
                            <div className="hack45-added-value-4">0</div>
                            <input type="hidden" className="hack45-send-value-4" value="" />
                          </div>
                        </div>
                        
                        <QuoteBreakdown formType="photo" />
                        
                        <LeadCaptureSection formType="photo" />
                        
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Link Section */}
      <section className="services-link-section">
        <div className="services-link-container">
          <Link href="/contacts" className="dot-bottom-link hero animate-on-scroll">
            questions?<br />
            <span className="small-bottom-link-text-eng">we are here for you</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// Design Service Options Component
function DesignServiceOptions() {
  const services = [
    // Logo & Brand Services
    { id: 'logo-design', name: 'Logo Design', value: 600, category: 'Logo & Brand', description: '3 concepts + color palette + typography + logo variations + usage guidelines' },
    { id: 'logo-redesign', name: 'Logo Redesign', value: 500, category: 'Logo & Brand', description: 'Brand analysis + 2 redesign directions + modernization strategy + transition guidelines' },
    { id: 'brand-identity', name: 'Brand Identity Package', value: 1800, category: 'Logo & Brand', description: 'Logo + color palette + typography + business card + letterhead + 12-page style guide' },
    { id: 'brand-guidelines', name: 'Brand Guidelines', value: 400, category: 'Logo & Brand', description: 'Logo usage rules + color codes + font specifications + do&apos;s/don&apos;ts document' },
    
    // Print Design
    { id: 'business-cards', name: 'Business Cards', value: 300, category: 'Print Design', description: 'Professional design front/back + print-ready files + multiple finish options' },
    { id: 'brochure', name: 'Brochure/Flyer', value: 450, category: 'Print Design', description: 'Custom layout + image sourcing + copy editing + print specifications' },
    { id: 'presentation', name: 'Sales Presentation', value: 600, category: 'Print Design', description: 'Custom PowerPoint/Keynote template + master layouts + branded charts + delivery tips' },
    { id: 'print-package', name: 'Print Package', value: 650, category: 'Print Design', description: 'Business cards + letterhead + folder with consistent brand design' },
    
    // Social Media Design
    { id: 'instagram-templates', name: 'Instagram Post Templates', value: 300, category: 'Social Media', description: 'Ten Editable Canva templates + brand colors/fonts + posting guidelines' },
    { id: 'social-ads', name: 'Facebook/<br/>Instagram<br/>Ads', value: 500, category: 'Social Media', description: 'Five Static ad designs + headline variations + CTA buttons + multiple sizes' },
    { id: 'social-brand-kit', name: 'Social Media Brand Kit', value: 350, category: 'Social Media', description: 'Profile/cover images + story highlights + post templates + brand setup' },
    
    // Website Support
    { id: 'website-graphics', name: 'Website Graphics', value: 450, category: 'Website Support', description: 'Custom icon set + header/banner designs + buttons + web-optimized formats' },
    { id: 'custom-illustrations', name: 'Custom Illustrations', value: 400, category: 'Website Support', description: 'Original artwork + multiple formats + color/black&white versions + usage rights' }
  ];

  // Group services by category
  const servicesByCategory = services.reduce((acc, service) => {
    if (!acc[service.category]) {
      acc[service.category] = [];
    }
    acc[service.category].push(service);
    return acc;
  }, {} as Record<string, typeof services>);

  return (
    <div>
      {Object.entries(servicesByCategory).map(([category, categoryServices]) => (
        <div key={category} className="design-category-section">
          <h4 className="design-category-title">{category}</h4>
          <div className="design-services-grid">
            {categoryServices.map((service) => (
              <div key={service.id} className="design-service-item">
                <div className="design-service-circle">
                  <label className="w-checkbox checkbox-field-12">
                    <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
                    <input 
                      type="checkbox" 
                      name={`design-service-${service.id}`} 
                      id={`design-service-${service.id}`} 
                      add-value={service.value.toString()}
                      style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
                    />
                    <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={`CAD $${service.value}`}>
                      <span className="label-text" dangerouslySetInnerHTML={{__html: service.name}}></span>
                      <span className="label-price">CAD ${service.value}</span>
                    </span>
                  </label>
                </div>
                <div className="design-service-description">
                  <p>{service.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Design Timeframe Options Component
function DesignTimeframeOptions() {
  const timeframes = [
    { id: 'express', name: 'Express Delivery', description: '1 week', multiplier: 1.6, percentage: '+60%' },
    { id: 'priority', name: 'Priority Delivery', description: '2 weeks', multiplier: 1.3, percentage: '+30%' },
    { id: 'standard', name: 'Standard', description: '2-3 weeks', multiplier: 1.0, percentage: 'Base price' }
  ];

  return (
    <div className="column-main horiz w-row">
      {timeframes.map((timeframe) => (
        <div key={timeframe.id} className="column-68 circles timeframe w-col w-col-4">
          <label className="w-checkbox checkbox-field-12">
            <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-3"></div>
            <input 
              type="checkbox" 
              name={`design-timeline-${timeframe.id}`} 
              id={`design-timeline-${timeframe.id}`} 
              timeline-multiplier={timeframe.multiplier.toString()}
              style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
            />
            <span className="hack42-checkbox-label-3 half circles w-form-label">
              <span className="label-text">{timeframe.name}<br />{timeframe.description}</span>
              <span className="label-price">{timeframe.percentage}</span>
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}

// Photo & Video Service Options Component
function PhotoVideoServiceOptions() {
  const services = [
    // Photography Services
    { id: 'corporate-headshots', name: 'Corporate Headshots', description: 'up to 5 people', price: 450, category: 'Photography', details: 'Professional headshot session for team or individual portraits (On-location setup + professional lighting + basic retouching + commercial usage rights)' },
    { id: 'product-photography', name: 'Product Photography Session', description: 'up to 10 products', price: 650, category: 'Photography', details: 'Professional product photography for marketing and e-commerce (Professional lighting setup + multiple angles + basic editing + commercial usage rights)' },
    { id: 'brand-photography', name: 'Brand Photography Session', description: 'half-day', price: 850, category: 'Photography', details: 'Comprehensive brand photography for marketing materials (4-hour session + multiple setups + lifestyle shots + basic editing + commercial usage rights)' },
    { id: 'event-photography', name: 'Event Photography', description: 'up to 4 hours', price: 750, category: 'Photography', details: 'Professional event documentation and coverage (4-hour coverage + candid and posed shots + basic editing + commercial usage rights)' },
    
    // Video Services
    { id: 'promotional-video', name: 'Promotional Video', description: 'up to 2 minutes', price: 1200, category: 'Video', details: 'Professional promotional video for marketing campaigns (Scripting + filming + editing + color correction + commercial usage rights)' },
    { id: 'product-demo-video', name: 'Product Demo Video', description: 'up to 1 minute', price: 800, category: 'Video', details: 'Product demonstration video for sales and marketing (Filming + basic editing + text overlays + commercial usage rights)' },
    { id: 'social-media-video', name: 'Social Media Video Package', description: '5 short videos', price: 950, category: 'Video', details: 'Platform-optimized video content for social media (5 videos under 60 seconds + platform-specific formatting + basic editing + commercial usage rights)' },
    { id: 'interview-testimonial', name: 'Interview/Testimonial Video', description: 'single session', price: 700, category: 'Video', details: 'Professional interview or testimonial video production (Single-camera setup + audio recording + basic editing + commercial usage rights)' }
  ];

  // Group services by category
  const servicesByCategory = services.reduce((acc, service) => {
    if (!acc[service.category]) {
      acc[service.category] = [];
    }
    acc[service.category].push(service);
    return acc;
  }, {} as Record<string, typeof services>);

  return (
    <div>
      <p className="services-tab-description">All photo & video services include: Commercial usage rights, professional equipment, basic editing, on-location setup in GTA</p>
      {Object.entries(servicesByCategory).map(([category, categoryServices]) => (
        <div key={category}>
          <h4 className="design-category-title">{category} Services</h4>
          <div className="column-main w-row">
            {categoryServices.map((service, index) => (
              <div key={service.id} className="column-68 w-col w-col-6">
                <label className="w-checkbox checkbox-field-12">
                  <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
                  <input 
                    type="radio" 
                    name="photo-service" 
                    id={`photo-service-${service.id}`} 
                    base-price={service.price.toString()}
                    style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
                  />
                  <span className={`hack42-checkbox-label-2 ${index === 0 ? '_01' : '_02'} w-form-label`} data-price={`approx. CAD $${service.price.toLocaleString()}`}>
                    <span className="label-text">{service.name}<br />{service.description}</span>
                    <span className="label-price">approx. CAD ${service.price.toLocaleString()}</span>
                  </span>
                </label>
                <div className="text-estimate-expl">{service.details}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Photo & Video Timeframe Options Component
function PhotoVideoTimeframeOptions() {
  const timeframes = [
    { id: 'express', name: 'Express Delivery', description: '1 week', multiplier: 1.6, percentage: '+60%' },
    { id: 'priority', name: 'Priority Delivery', description: '2 weeks', multiplier: 1.3, percentage: '+30%' },
    { id: 'standard', name: 'Standard', description: '2-3 weeks', multiplier: 1.0, percentage: 'Base price' }
  ];

  return (
    <div>
      <div className="column-main horiz w-row timeline-row">
        {timeframes.map((timeframe) => (
          <div key={timeframe.id} className="column-68 circles w-col w-col-4">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`photo-timeline-${timeframe.id}`} 
                id={`photo-timeline-${timeframe.id}`} 
                timeline-multiplier={timeframe.multiplier.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={timeframe.percentage}>
                <span className="label-text">{timeframe.name}<br />{timeframe.description}</span>
                <span className="label-price">{timeframe.percentage}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Photo & Video Additional Services Component
function PhotoVideoAdditionalOptions() {
  const additionalServices = [
    { id: 'additional-location', name: 'Additional Location', description: 'within GTA', value: 200 },
    { id: 'studio-hour', name: 'Studio Rental', description: 'per hour', value: 90 },
    { id: 'studio-half-day', name: 'Studio Half-Day', description: '4 hours', value: 300 },
    { id: 'studio-full-day', name: 'Studio Full-Day', description: '8 hours', value: 600 },
    { id: 'travel-outside-gta', name: 'Travel Outside GTA', description: '+ mileage', value: 150 },
    { id: 'drone-footage', name: 'Drone Footage Addition', description: 'aerial shots', value: 400 },
    { id: 'extended-editing', name: 'Extended Editing/Motion Graphics', description: '', value: 300 },
    { id: 'rush-same-day', name: 'Rush Same-Day Editing', description: '', value: 500 },
    { id: 'additional-talent', name: 'Additional Talent', description: 'per person', value: 100 }
  ];

  return (
    <div>
      <div className="column-main horiz w-row">
        {additionalServices.slice(0, 3).map((service) => (
          <div key={service.id} className="column-68 circles w-col w-col-4">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`photo-additional-${service.id}`} 
                id={`photo-additional-${service.id}`} 
                add-value={service.value.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={`CAD $${service.value}`}>
                <span className="label-text">{service.name}<br />{service.description}</span>
                <span className="label-price">CAD ${service.value}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
      <div className="column-main horiz w-row">
        {additionalServices.slice(3, 6).map((service) => (
          <div key={service.id} className="column-68 circles w-col w-col-4">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`photo-additional-${service.id}`} 
                id={`photo-additional-${service.id}`} 
                add-value={service.value.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={`CAD $${service.value}`}>
                <span className="label-text">{service.name}<br />{service.description}</span>
                <span className="label-price">CAD ${service.value}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
      <div className="column-main horiz w-row">
        {additionalServices.slice(6, 9).map((service) => (
          <div key={service.id} className="column-68 circles w-col w-col-4">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`photo-additional-${service.id}`} 
                id={`photo-additional-${service.id}`} 
                add-value={service.value.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={`CAD $${service.value}`}>
                <span className="label-text">{service.name}<br />{service.description}</span>
                <span className="label-price">CAD ${service.value}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Website Type Options Component
function WebsiteTypeOptions() {
  const websiteTypes = [
    { id: 'basic', name: 'Basic Website', description: '1-3 pages', price: 800 },
    { id: 'medium', name: 'Medium Website', description: '4-6 pages', price: 1400 },
    { id: 'large', name: 'Large Website', description: '7-15 pages', price: 2400 },
    { id: 'ecommerce', name: 'E-Commerce', description: 'up to 50 products', price: 2800 }
  ];

  return (
    <div>
      <p className="services-tab-description">All The Dot websites include: Design, Basic SEO, Google Analytics Setup, Contact Form, Mobile Responsive</p>
      <div className="column-main w-row">
        {websiteTypes.slice(0, 2).map((type, index) => (
          <div key={type.id} className="column-68 w-col w-col-6">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="radio" 
                name="website-type" 
                id={`website-type-${type.id}`} 
                base-price={type.price.toString()}
                page-count={type.description}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className={`hack42-checkbox-label-2 ${index === 0 ? '_01' : '_02 fuck_border'} w-form-label`} data-price={`approx. CAD $${type.price.toLocaleString()}`}>
                <span className="label-text">{type.name}<br />{type.description}</span>
                <span className="label-price">approx. CAD ${type.price.toLocaleString()}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
      <div className="column-main w-row">
        {websiteTypes.slice(2, 4).map((type, index) => (
          <div key={type.id} className="column-68 w-col w-col-6">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="radio" 
                name="website-type" 
                id={`website-type-${type.id}`} 
                base-price={type.price.toString()}
                page-count={type.description}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className={`hack42-checkbox-label-2 _02 ${index === 0 ? '_03 fuck' : '_04'} w-form-label`} data-price={`approx. CAD $${type.price.toLocaleString()}`}>
                <span className="label-text">{type.name}<br />{type.description}</span>
                <span className="label-price">approx. CAD ${type.price.toLocaleString()}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Website Timeframe Options Component
function WebsiteTimeframeOptions() {
  const timeframes = [
    { id: 'express', name: 'Express Delivery', description: '1 week', multiplier: 1.8, percentage: '+80%' },
    { id: 'priority', name: 'Priority Delivery', description: '2 weeks', multiplier: 1.4, percentage: '+40%' },
    { id: 'fast', name: 'Fast Track', description: '3 weeks', multiplier: 1.2, percentage: '+20%' },
    { id: 'standard', name: 'Standard', description: '4-6 weeks', multiplier: 1.0, percentage: 'Base price' }
  ];

  return (
    <div>
      <div className="column-main horiz w-row timeline-row">
        {timeframes.map((timeframe) => (
          <div key={timeframe.id} className="column-68 circles w-col w-col-3">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`timeline-${timeframe.id}`} 
                id={`timeline-${timeframe.id}`} 
                timeline-multiplier={timeframe.multiplier.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={timeframe.percentage}>
                <span className="label-text">{timeframe.name}<br />{timeframe.description}</span>
                <span className="label-price">{timeframe.percentage}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Website Feature Options Component
function WebsiteFeatureOptions() {
  const features = [
    { id: 'blog', name: 'Blog Setup & Training', value: 400 },
    { id: 'advanced-seo', name: 'Advanced SEO Strategy', value: 600 },
    { id: 'analytics', name: 'Advanced Analytics & Reporting', value: 300 },
    { id: 'simple-integrations', name: 'Simple Integrations', value: 400 },
    { id: 'complex-integrations', name: 'Complex Integrations', value: 800 },
    { id: 'animations', name: 'Custom Animations', value: 600 },
    { id: 'premium-animations', name: 'Premium Animation Package', value: 1200 }
  ];

  return (
    <div>
      <div className="column-main horiz w-row">
        {features.slice(0, 4).map((feature) => (
          <div key={feature.id} className="column-68 none circles w-col w-col-3">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`feature-${feature.id}`} 
                id={`feature-${feature.id}`} 
                add-value={feature.value.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={`approx. CAD $${feature.value}`}>
                <span className="label-text">{feature.name}</span>
                <span className="label-price">approx.<br />CAD ${feature.value}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
      <div className="column-main horiz w-row">
        {features.slice(4, 7).map((feature) => (
          <div key={feature.id} className="column-68 circles w-col w-col-4">
            <label className="w-checkbox checkbox-field-12">
              <div className="w-checkbox-input w-checkbox-input--inputType-custom hack42-checkbox-2"></div>
              <input 
                type="checkbox" 
                name={`feature-${feature.id}`} 
                id={`feature-${feature.id}`} 
                add-value={feature.value.toString()}
                style={{ opacity: 0, position: 'absolute', zIndex: -1 }}
              />
              <span className="hack42-checkbox-label-2 half circles w-form-label" data-price={`approx. CAD $${feature.value}`}>
                <span className="label-text">{feature.name}</span>
                <span className="label-price">approx.<br />CAD ${feature.value}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}


// Quote Breakdown Component
interface QuoteBreakdownProps {
  formType: 'website' | 'design' | 'photo';
}

function QuoteBreakdown({ formType }: QuoteBreakdownProps) {
  const [selectedOptions, setSelectedOptions] = useState({
    websiteType: '',
    pageCount: '',
    timeline: '',
    features: [] as string[],
    designServices: [] as string[],
    designTimeline: '',
    photoService: '',
    photoTimeline: '',
    photoAdditional: [] as string[]
  });

  useEffect(() => {
    const updateSelectedOptions = () => {
      if (formType === 'website') {
        // Get selected website type
        const websiteTypeCheckbox = document.querySelector('.hack42-45-form-websites input[name^="website-type"]:checked') as HTMLInputElement;
        const websiteType = websiteTypeCheckbox ? websiteTypeCheckbox.name.replace('website-type-', '') : '';
        const pageCount = websiteTypeCheckbox ? websiteTypeCheckbox.getAttribute('page-count') || '' : '';

        // Get selected timeline
        const timelineCheckbox = document.querySelector('.hack42-45-form-websites input[name^="timeline"]:checked') as HTMLInputElement;
        const timeline = timelineCheckbox ? timelineCheckbox.name.replace('timeline-', '') : '';

        // Get selected features
        const featureCheckboxes = document.querySelectorAll('.hack42-45-form-websites input[name^="feature"]:checked') as NodeListOf<HTMLInputElement>;
        const features = Array.from(featureCheckboxes).map(cb => cb.name.replace('feature-', ''));

        setSelectedOptions(prev => ({ ...prev, websiteType, pageCount, timeline, features }));
      } else if (formType === 'design') {
        // Get selected design services
        const designServiceCheckboxes = document.querySelectorAll('.hack42-45-form-design input[name^="design-service"]:checked') as NodeListOf<HTMLInputElement>;
        const designServices = Array.from(designServiceCheckboxes).map(cb => cb.name.replace('design-service-', ''));

        // Get selected design timeline
        const designTimelineCheckbox = document.querySelector('.hack42-45-form-design input[name^="design-timeline"]:checked') as HTMLInputElement;
        const designTimeline = designTimelineCheckbox ? designTimelineCheckbox.name.replace('design-timeline-', '') : '';

        setSelectedOptions(prev => ({ ...prev, designServices, designTimeline }));
      } else if (formType === 'photo') {
        // Get selected photo service
        const photoServiceRadio = document.querySelector('.hack42-45-form-photo input[name="photo-service"]:checked') as HTMLInputElement;
        const photoService = photoServiceRadio ? photoServiceRadio.id.replace('photo-service-', '') : '';

        // Get selected photo timeline
        const photoTimelineCheckbox = document.querySelector('.hack42-45-form-photo input[name^="photo-timeline"]:checked') as HTMLInputElement;
        const photoTimeline = photoTimelineCheckbox ? photoTimelineCheckbox.name.replace('photo-timeline-', '') : '';

        // Get selected additional services
        const photoAdditionalCheckboxes = document.querySelectorAll('.hack42-45-form-photo input[name^="photo-additional"]:checked') as NodeListOf<HTMLInputElement>;
        const photoAdditional = Array.from(photoAdditionalCheckboxes).map(cb => cb.name.replace('photo-additional-', ''));

        setSelectedOptions(prev => ({ ...prev, photoService, photoTimeline, photoAdditional }));
      }
    };

    // Update on initial load and when selections change
    const timer = setTimeout(updateSelectedOptions, 500);
    const interval = setInterval(updateSelectedOptions, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [formType]);

  // Don't show breakdown if no selections are made
  const hasWebsiteSelections = formType === 'website' && selectedOptions.websiteType;
  const hasDesignSelections = formType === 'design' && selectedOptions.designServices.length > 0;
  const hasPhotoSelections = formType === 'photo' && selectedOptions.photoService;
  
  if (!hasWebsiteSelections && !hasDesignSelections && !hasPhotoSelections) return null;

  if (formType === 'website') {
    return (
      <div className="quote-breakdown">
        <h3 className="dot_forms_title sites estimate">What&apos;s Included in Your Quote:</h3>
        
        {/* Project Specifications */}
        {selectedOptions.pageCount && (
          <div className="breakdown-section">
            <h4 className="breakdown-title">Project Specifications</h4>
            <div className="breakdown-category">
              <h5>Website Scope</h5>
              <ul>
                <li><strong>Pages: {selectedOptions.pageCount}</strong></li>
                {selectedOptions.websiteType === 'ecommerce' && (
                  <li><strong>E-Commerce functionality included</strong></li>
                )}
              </ul>
            </div>
          </div>
        )}
        
        {/* Base Deliverables for Websites */}
        <div className="breakdown-section">
          <h4 className="breakdown-title">Base Deliverables (Always Included)</h4>
          
          <div className="breakdown-category">
            <h5>Website Foundation</h5>
            <ul>
              <li>Professional custom design across all pages</li>
              <li>Mobile-responsive development and testing</li>
              <li>Cross-browser compatibility testing</li>
              <li>Basic SEO optimization (titles, meta descriptions, keywords)</li>
              <li>Google Analytics setup and configuration</li>
              <li>Contact form integration with spam protection</li>
              <li>SSL certificate setup assistance</li>
              <li>Performance optimization</li>
            </ul>
          </div>

          <div className="breakdown-category">
            <h5>Technical Support</h5>
            <ul>
              <li>Website hosting setup assistance</li>
              <li>Domain configuration support</li>
              <li>Two rounds of revisions included</li>
              <li>Launch support and testing</li>
              <li>30-day post-launch support</li>
              <li>Training session for your team</li>
            </ul>
          </div>
        </div>

        {/* Conditional Deliverables for Websites */}
        <div className="breakdown-section">
          <h4 className="breakdown-title">Additional Deliverables (Based on Your Selections)</h4>
          
          {/* Website Type Specific */}
          {(selectedOptions.websiteType === 'medium' || selectedOptions.websiteType === 'large') && (
            <div className="breakdown-category">
              <h5>Enhanced Website Features</h5>
              <ul>
                <li>Social media platform integration</li>
                <li>Advanced navigation systems</li>
              </ul>
            </div>
          )}

          {selectedOptions.websiteType === 'ecommerce' && (
            <div className="breakdown-category">
              <h5>E-Commerce Functionality</h5>
              <ul>
                <li>Product catalog management system</li>
                <li>Secure payment gateway integration</li>
                <li>Inventory tracking and management</li>
                <li>Customer account registration system</li>
                <li>Order management dashboard</li>
              </ul>
            </div>
          )}

          {/* Feature-specific deliverables */}
          {selectedOptions.features.includes('blog') && (
            <div className="breakdown-category">
              <h5>Blog Add-On</h5>
              <ul>
                <li>Blog content management system setup</li>
                <li>Publishing workflow training</li>
                <li>Content organization structure</li>
                <li>Author management capabilities</li>
              </ul>
            </div>
          )}

          {selectedOptions.features.includes('advanced-seo') && (
            <div className="breakdown-category">
              <h5>Advanced SEO Strategy</h5>
              <ul>
                <li>Comprehensive keyword research and strategy</li>
                <li>Content optimization recommendations</li>
                <li>Local SEO setup (Google Business Profile)</li>
                <li>Competitor analysis report</li>
                <li>3-month performance tracking</li>
              </ul>
            </div>
          )}

          {selectedOptions.features.includes('analytics') && (
            <div className="breakdown-category">
              <h5>Advanced Analytics & Reporting</h5>
              <ul>
                <li>Custom event tracking setup</li>
                <li>E-commerce conversion funnels</li>
                <li>Heat mapping integration</li>
                <li>Monthly performance reports</li>
              </ul>
            </div>
          )}

          {(selectedOptions.features.includes('simple-integrations') || selectedOptions.features.includes('complex-integrations')) && (
            <div className="breakdown-category">
              <h5>Integration Services</h5>
              <ul>
                <li>API integration and configuration</li>
                <li>Third-party tool connections</li>
                <li>Data synchronization setup</li>
              </ul>
            </div>
          )}

          {(selectedOptions.features.includes('animations') || selectedOptions.features.includes('premium-animations')) && (
            <div className="breakdown-category">
              <h5>Animation Package</h5>
              <ul>
                <li>Scroll-triggered animations</li>
                <li>Interactive page elements</li>
                <li>Custom loading animations</li>
                <li>Performance optimization for animations</li>
              </ul>
            </div>
          )}

          {/* Timeline-specific deliverables */}
          {selectedOptions.timeline && (
            <div className="breakdown-category">
              <h5>Timeline-Specific Service</h5>
              <ul>
                {selectedOptions.timeline === 'express' && (
                  <li>Priority development with dedicated team focus</li>
                )}
                {selectedOptions.timeline === 'priority' && (
                  <li>Fast-track delivery with regular progress updates</li>
                )}
                {selectedOptions.timeline === 'fast' && (
                  <li>Accelerated timeline with milestone check-ins</li>
                )}
                {selectedOptions.timeline === 'standard' && (
                  <li>Comprehensive development with thorough testing phases</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (formType === 'design') {
    return (
    <div className="quote-breakdown">
      <h3 className="dot_forms_title sites estimate">What&apos;s Included in Your Quote:</h3>
      
      {/* Base Deliverables for Design */}
      <div className="breakdown-section">
        <h4 className="breakdown-title">Base Deliverables (Always Included)</h4>
        
        <div className="breakdown-category">
          <h5>Project Foundation</h5>
          <ul>
            <li>Initial consultation and creative brief development</li>
            <li>Two rounds of revisions included</li>
            <li>High-resolution files for print and digital use</li>
            <li>Source files provided (AI, PSD, or native format)</li>
            <li>Project completion within agreed timeline</li>
            <li>14-day post-delivery support</li>
          </ul>
        </div>

        <div className="breakdown-category">
          <h5>Professional Standards</h5>
          <ul>
            <li>Industry-standard file formats and specifications</li>
            <li>Color-accurate proofs and previews</li>
            <li>Print coordination assistance when applicable</li>
            <li>Usage rights and licensing documentation</li>
          </ul>
        </div>
      </div>

      {/* Conditional Deliverables for Design Services */}
      <div className="breakdown-section">
        <h4 className="breakdown-title">Service-Specific Deliverables (Based on Your Selections)</h4>
        
        {/* Logo Design */}
        {selectedOptions.designServices.includes('logo-design') && (
          <div className="breakdown-category">
            <h5>Logo Design</h5>
            <ul>
              <li>Three distinct logo concept presentations</li>
              <li>Brand color palette recommendations (5-7 colors)</li>
              <li>Typography pairing suggestions and rationale</li>
              <li>Logo variations (horizontal, stacked, icon-only, reversed)</li>
              <li>Basic usage guidelines document</li>
              <li>Vector and raster file formats</li>
            </ul>
          </div>
        )}

        {/* Logo Redesign */}
        {selectedOptions.designServices.includes('logo-redesign') && (
          <div className="breakdown-category">
            <h5>Logo Redesign</h5>
            <ul>
              <li>Current brand analysis and competitive assessment</li>
              <li>Two strategic redesign directions</li>
              <li>Brand equity preservation strategy</li>
              <li>Modernization recommendations and rationale</li>
              <li>Before/after comparison presentation</li>
              <li>Transition timeline and implementation guidelines</li>
            </ul>
          </div>
        )}

        {/* Brand Identity Package */}
        {selectedOptions.designServices.includes('brand-identity') && (
          <div className="breakdown-category">
            <h5>Brand Identity Package</h5>
            <ul>
              <li>Complete logo system development</li>
              <li>Comprehensive brand color palette (primary, secondary, accent colors)</li>
              <li>Typography hierarchy and font pairing system</li>
              <li>Professional business card design and print specifications</li>
              <li>Letterhead template design (digital and print versions)</li>
              <li>12-page brand style guide document</li>
              <li>Brand application examples and mockups</li>
            </ul>
          </div>
        )}

        {/* Brand Guidelines */}
        {selectedOptions.designServices.includes('brand-guidelines') && (
          <div className="breakdown-category">
            <h5>Brand Guidelines</h5>
            <ul>
              <li>Detailed logo usage rules and restrictions</li>
              <li>Color specifications (hex, RGB, CMYK, Pantone)</li>
              <li>Typography hierarchy and usage examples</li>
              <li>Visual do&apos;s and don&apos;ts with examples</li>
              <li>Brand voice and tone recommendations</li>
              <li>Co-branding and partnership guidelines</li>
            </ul>
          </div>
        )}

        {/* Business Cards */}
        {selectedOptions.designServices.includes('business-cards') && (
          <div className="breakdown-category">
            <h5>Business Cards</h5>
            <ul>
              <li>Professional card design (front and back)</li>
              <li>Print-ready files with bleed and crop marks</li>
              <li>Multiple finish recommendations (matte, gloss, textured)</li>
              <li>Printer vendor recommendations and coordination</li>
              <li>Digital business card version for email signatures</li>
            </ul>
          </div>
        )}

        {/* Brochure/Flyer */}
        {selectedOptions.designServices.includes('brochure') && (
          <div className="breakdown-category">
            <h5>Brochure/Flyer</h5>
            <ul>
              <li>Custom layout design and information hierarchy</li>
              <li>Professional image sourcing and integration</li>
              <li>Copy editing and content optimization</li>
              <li>Print specifications and paper recommendations</li>
              <li>Digital PDF version for online distribution</li>
            </ul>
          </div>
        )}

        {/* Sales Presentation */}
        {selectedOptions.designServices.includes('presentation') && (
          <div className="breakdown-category">
            <h5>Sales Presentation</h5>
            <ul>
              <li>Custom PowerPoint or Keynote template design</li>
              <li>Master slide layouts (title, content, image, data, closing)</li>
              <li>Brand-consistent charts and infographic elements</li>
              <li>Icon library for presentation use</li>
              <li>Presentation delivery and design tips</li>
            </ul>
          </div>
        )}

        {/* Print Package */}
        {selectedOptions.designServices.includes('print-package') && (
          <div className="breakdown-category">
            <h5>Print Package</h5>
            <ul>
              <li>Coordinated business card design</li>
              <li>Professional letterhead template</li>
              <li>Matching folder design with brand integration</li>
              <li>Consistent visual identity system across all pieces</li>
              <li>Print vendor coordination for all items</li>
            </ul>
          </div>
        )}

        {/* Instagram Templates */}
        {selectedOptions.designServices.includes('instagram-templates') && (
          <div className="breakdown-category">
            <h5>Instagram Post Templates</h5>
            <ul>
              <li>10 editable Canva template designs</li>
              <li>Brand colors and fonts integrated into templates</li>
              <li>Multiple post styles (quotes, promotions, behind-the-scenes, product)</li>
              <li>Social media posting guidelines and best practices</li>
              <li>Template customization instructions</li>
            </ul>
          </div>
        )}

        {/* Social Media Ads */}
        {selectedOptions.designServices.includes('social-ads') && (
          <div className="breakdown-category">
            <h5>Facebook/Instagram Ads</h5>
            <ul>
              <li>5 complete ad design variations</li>
              <li>Multiple headline and call-to-action combinations</li>
              <li>Sizing for feed, stories, and carousel formats</li>
              <li>A/B testing recommendations</li>
              <li>Performance optimization tips and best practices</li>
            </ul>
          </div>
        )}

        {/* Social Media Brand Kit */}
        {selectedOptions.designServices.includes('social-brand-kit') && (
          <div className="breakdown-category">
            <h5>Social Media Brand Kit</h5>
            <ul>
              <li>Custom profile and cover image designs</li>
              <li>Story highlight icon set (8-10 branded icons)</li>
              <li>Basic post template designs (3 styles)</li>
              <li>Brand color and font setup guide for social platforms</li>
              <li>Social media brand voice recommendations</li>
            </ul>
          </div>
        )}

        {/* Website Graphics */}
        {selectedOptions.designServices.includes('website-graphics') && (
          <div className="breakdown-category">
            <h5>Website Graphics</h5>
            <ul>
              <li>Custom icon set design (8-12 icons)</li>
              <li>Header and banner designs for web use</li>
              <li>Button and UI element designs</li>
              <li>Web-optimized file formats (PNG, SVG, WebP)</li>
              <li>Integration guidelines for developers</li>
            </ul>
          </div>
        )}

        {/* Custom Illustrations */}
        {selectedOptions.designServices.includes('custom-illustrations') && (
          <div className="breakdown-category">
            <h5>Custom Illustrations</h5>
            <ul>
              <li>Original illustration artwork creation</li>
              <li>Vector and raster format deliveries</li>
              <li>Color and black/white versions</li>
              <li>Multiple sizing options for various applications</li>
              <li>Commercial usage rights and licensing documentation</li>
            </ul>
          </div>
        )}

        {/* Timeline-specific deliverables for Design */}
        {selectedOptions.designTimeline && (
          <div className="breakdown-category">
            <h5>Timeline-Specific Service</h5>
            <ul>
              {selectedOptions.designTimeline === 'express' && (
                <li>Priority queue placement, dedicated designer assignment, daily progress updates, expedited approval process</li>
              )}
              {selectedOptions.designTimeline === 'priority' && (
                <li>Fast-track development schedule, milestone check-ins, priority email support</li>
              )}
              {selectedOptions.designTimeline === 'standard' && (
                <li>Comprehensive design process, thorough concept development, detailed feedback sessions</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
  }

  if (formType === 'photo') {
    return (
      <div className="quote-breakdown">
        <h3 className="dot_forms_title sites estimate">What&apos;s Included in Your Quote:</h3>
        
        {/* Base Deliverables for Photo & Video */}
        <div className="breakdown-section">
          <h4 className="breakdown-title">Base Deliverables (Always Included)</h4>
          
          <div className="breakdown-category">
            <h5>Professional Setup</h5>
            <ul>
              <li>On-location professional equipment setup</li>
              <li>Professional lighting and backdrop systems</li>
              <li>High-resolution digital file delivery</li>
              <li>Basic color correction and editing</li>
              <li>Online gallery for viewing and downloading</li>
              <li>Usage rights for business and marketing purposes</li>
              <li>48-hour turnaround for edited files</li>
            </ul>
          </div>

          <div className="breakdown-category">
            <h5>Technical Standards</h5>
            <ul>
              <li>Broadcast-quality equipment and techniques</li>
              <li>Multiple format delivery (web, print, social)</li>
              <li>Backup and redundancy during shoots</li>
              <li>Professional post-production workflow</li>
            </ul>
          </div>
        </div>

        {/* Service-Specific Deliverables */}
        <div className="breakdown-section">
          <h4 className="breakdown-title">Service-Specific Deliverables (Based on Your Selections)</h4>
          
          {/* Product Photography */}
          {selectedOptions.photoService === 'product-photography' && (
            <div className="breakdown-category">
              <h5>Product Photography</h5>
              <ul>
                <li>Up to 25 individual product shots</li>
                <li>Multiple angles and detailed close-ups per product</li>
                <li>Clean white background and lifestyle setting options</li>
                <li>360-degree product spin photography (when applicable)</li>
                <li>E-commerce optimized image sizing and formatting</li>
                <li>Product styling and arrangement consultation</li>
              </ul>
            </div>
          )}

          {/* Corporate Headshots */}
          {selectedOptions.photoService === 'corporate-headshots' && (
            <div className="breakdown-category">
              <h5>Corporate Headshots</h5>
              <ul>
                <li>Professional headshots for up to 15 team members</li>
                <li>Multiple poses and expressions per person</li>
                <li>Consistent lighting and background styling</li>
                <li>Individual retouching and color correction</li>
                <li>High-resolution files suitable for print and web</li>
                <li>LinkedIn and social media optimized versions</li>
              </ul>
            </div>
          )}

          {/* Brand Photography */}
          {selectedOptions.photoService === 'brand-photography' && (
            <div className="breakdown-category">
              <h5>Brand Photography</h5>
              <ul>
                <li>Comprehensive brand story documentation</li>
                <li>Behind-the-scenes and workspace photography</li>
                <li>Team interaction and culture shots</li>
                <li>Product or service in action</li>
                <li>Website hero images and marketing visuals</li>
                <li>Social media content library creation</li>
              </ul>
            </div>
          )}

          {/* Video Production */}
          {selectedOptions.photoService === 'video-production' && (
            <div className="breakdown-category">
              <h5>Video Production</h5>
              <ul>
                <li>Professional multi-camera setup and filming</li>
                <li>Scripting and pre-production consultation</li>
                <li>Professional audio recording and mixing</li>
                <li>Complete post-production editing and color grading</li>
                <li>Motion graphics and title integration</li>
                <li>Multiple format delivery (social, web, broadcast)</li>
                <li>Unlimited revisions during editing phase</li>
              </ul>
            </div>
          )}

          {/* Drone/Aerial */}
          {selectedOptions.photoService === 'drone-aerial' && (
            <div className="breakdown-category">
              <h5>Drone/Aerial Photography</h5>
              <ul>
                <li>Licensed drone pilot and equipment</li>
                <li>Aerial photography and 4K video capture</li>
                <li>Property and location showcase</li>
                <li>Real estate and commercial applications</li>
                <li>Weather contingency planning and rescheduling</li>
                <li>FAA compliance and permit coordination</li>
              </ul>
            </div>
          )}

          {/* Event Photography */}
          {selectedOptions.photoService === 'event-photography' && (
            <div className="breakdown-category">
              <h5>Event Photography</h5>
              <ul>
                <li>Full event coverage (up to 8 hours)</li>
                <li>Candid and posed photography</li>
                <li>Key moments and speaker documentation</li>
                <li>Networking and interaction shots</li>
                <li>Same-day social media preview images</li>
                <li>Complete edited gallery within 5 business days</li>
              </ul>
            </div>
          )}

          {/* Additional Services */}
          {selectedOptions.photoAdditional.includes('additional-location') && (
            <div className="breakdown-category">
              <h5>Additional Location (within GTA)</h5>
              <ul>
                <li>Professional setup at secondary venue</li>
                <li>Equipment transport and setup</li>
                <li>Consistent lighting and styling across locations</li>
                <li>Travel coordination and logistics</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('studio-hour') && (
            <div className="breakdown-category">
              <h5>Studio Rental (per hour)</h5>
              <ul>
                <li>Professional studio space access</li>
                <li>Backdrop and lighting equipment included</li>
                <li>Controlled environment for optimal results</li>
                <li>Flexible hourly booking</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('studio-half-day') && (
            <div className="breakdown-category">
              <h5>Studio Half-Day (4 hours)</h5>
              <ul>
                <li>4-hour professional studio access</li>
                <li>Complete lighting and backdrop systems</li>
                <li>Extended session for multiple setups</li>
                <li>Costume/outfit changes accommodation</li>
                <li>Comprehensive content creation time</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('studio-full-day') && (
            <div className="breakdown-category">
              <h5>Studio Full-Day (8 hours)</h5>
              <ul>
                <li>8-hour dedicated studio access</li>
                <li>Multiple backdrop and lighting setups</li>
                <li>Extensive wardrobe and prop changes</li>
                <li>Break periods and meal accommodation</li>
                <li>Maximum content variety and volume</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('travel-outside-gta') && (
            <div className="breakdown-category">
              <h5>Travel Outside GTA (+ mileage)</h5>
              <ul>
                <li>Professional photography beyond Greater Toronto Area</li>
                <li>Equipment transport to distant locations</li>
                <li>Travel time and mileage coverage</li>
                <li>Location coordination and permits</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('drone-footage') && (
            <div className="breakdown-category">
              <h5>Drone Footage Addition (aerial shots)</h5>
              <ul>
                <li>Licensed drone pilot and equipment</li>
                <li>4K aerial photography and video capture</li>
                <li>Unique perspectives and establishing shots</li>
                <li>Weather contingency planning</li>
                <li>FAA compliance and safety protocols</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('extended-editing') && (
            <div className="breakdown-category">
              <h5>Extended Editing/Motion Graphics (advanced post)</h5>
              <ul>
                <li>Advanced post-production techniques</li>
                <li>Motion graphics and animated elements</li>
                <li>Complex compositing and visual effects</li>
                <li>Color grading and cinematic treatment</li>
                <li>Custom graphics and title sequences</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('rush-same-day') && (
            <div className="breakdown-category">
              <h5>Rush Same-Day Editing (same day delivery)</h5>
              <ul>
                <li>Priority processing queue placement</li>
                <li>Same-day edited file delivery</li>
                <li>Immediate post-production workflow</li>
                <li>Express quality control and review</li>
                <li>Emergency timeline accommodation</li>
              </ul>
            </div>
          )}

          {selectedOptions.photoAdditional.includes('additional-talent') && (
            <div className="breakdown-category">
              <h5>Additional Talent (per person)</h5>
              <ul>
                <li>Professional model or actor coordination</li>
                <li>Wardrobe and styling consultation</li>
                <li>Direction and posing guidance</li>
                <li>Multiple talent management during shoot</li>
              </ul>
            </div>
          )}

          {/* Timeline-specific deliverables for Photo & Video */}
          {selectedOptions.photoTimeline && (
            <div className="breakdown-category">
              <h5>Timeline-Specific Service</h5>
              <ul>
                {selectedOptions.photoTimeline === 'express' && (
                  <li>Priority scheduling, dedicated production team, daily progress updates, expedited post-production</li>
                )}
                {selectedOptions.photoTimeline === 'priority' && (
                  <li>Fast-track scheduling, milestone check-ins, priority editing queue</li>
                )}
                {selectedOptions.photoTimeline === 'standard' && (
                  <li>Comprehensive planning process, thorough content development, detailed review sessions</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback for unrecognized form types
  return (
    <div className="quote-breakdown">
      <h3 className="dot_forms_title sites estimate">What&apos;s Included in Your Quote:</h3>
      <p>Complete breakdown for {formType} form will be displayed here.</p>
    </div>
  );
}

// Lead Capture Section Component
interface LeadCaptureSectionProps {
  formType: 'website' | 'design' | 'photo';
}

function LeadCaptureSection({ formType }: LeadCaptureSectionProps) {
  const [selectedAction, setSelectedAction] = useState<'pdf' | 'email' | 'discuss' | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleActionSelect = (action: 'pdf' | 'email' | 'discuss', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedAction(action);
    setIsFormVisible(true);
  };

  const getServiceTitle = () => {
    switch (formType) {
      case 'website': return 'Website Development';
      case 'design': return 'Graphic Design';
      case 'photo': return 'Photo & Video Production';
      default: return 'Project';
    }
  };

  return (
    <div className="lead-capture-section">
      <div className="lead-capture-header">
        <h3 className="dot_forms_title sites estimate">Get Your {getServiceTitle()} Estimate</h3>
        <p className="lead-capture-subtitle">Choose how you&apos;d like to receive your detailed project estimate:</p>
      </div>

      <div className="lead-capture-actions">
        <button 
          className="lead-capture-action"
          type="button"
          onClick={(e) => handleActionSelect('pdf', e)}
        >
          <div className="action-content">
            <h4>Download PDF Estimate</h4>
            <p>Get a professional PDF with full project details and pricing breakdown</p>
          </div>
        </button>

        <button 
          className="lead-capture-action"
          type="button"
          onClick={(e) => handleActionSelect('email', e)}
        >
          <div className="action-content">
            <h4>Email Estimate to Myself</h4>
            <p>Receive a detailed estimate directly in your inbox for easy reference</p>
          </div>
        </button>

        <button 
          className="lead-capture-action"
          type="button"
          onClick={(e) => handleActionSelect('discuss', e)}
        >
          <div className="action-content">
            <h4>Email Us About This Project</h4>
            <p>Send us your project details and we&apos;ll get back to you within 24 hours</p>
          </div>
        </button>
      </div>

      {isFormVisible && selectedAction && typeof document !== 'undefined' && createPortal(
        <LeadCaptureForm 
          action={selectedAction} 
          formType={formType}
          onClose={() => setIsFormVisible(false)}
        />,
        document.body
      )}
    </div>
  );
}

// Lead Capture Form Component
interface LeadCaptureFormProps {
  action: 'pdf' | 'email' | 'discuss';
  formType: 'website' | 'design' | 'photo';
  onClose: () => void;
}

function LeadCaptureForm({ action, formType, onClose }: LeadCaptureFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: ''
  });
  const [honeypotData, setHoneypotData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Collect estimate data from the calculator
      const estimateData = {
        formType,
        total: getCurrentTotal(formType),
        selections: getCurrentSelections(formType)
      };

      const leadData = {
        name: formData.name,
        email: formData.email,
        company: formData.company,
        phone: formData.phone,
        message: formData.message,
        action,
        serviceType: formType,
        timestamp: new Date().toISOString()
      };

      if (action === 'pdf') {
        // Generate and download HTML-based PDF
        const pdfResponse = await fetch('/api/generate-pdf-simple', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estimateData, leadData, website: honeypotData }),
        });

        if (pdfResponse.ok) {
          const htmlContent = await pdfResponse.text();
          // Create a blob URL to avoid about:blank
          const blob = new Blob([htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const printWindow = window.open(url, '_blank');
          if (printWindow) {
            printWindow.focus();
            // Trigger print dialog after content loads
            setTimeout(() => {
              printWindow.print();
              // Clean up the blob URL after printing
              setTimeout(() => {
                URL.revokeObjectURL(url);
              }, 1000);
            }, 500);
          }
        } else {
          throw new Error('Failed to generate PDF');
        }
        
        // Save to Calculator Leads database (PDF download = Cold lead)
        const leadSaveResponse = await fetch('/api/save-calculator-lead', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            estimateData, 
            leadData: { ...leadData, action: 'pdf_download' },
            website: honeypotData
          }),
        });
        
        if (!leadSaveResponse.ok) {
          console.error('Failed to save PDF lead:', await leadSaveResponse.text());
        }

      } else if (action === 'email') {
        // Send email estimate to client and save lead
        const emailResponse = await fetch('/api/send-estimate-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estimateData, leadData, website: honeypotData }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error('Email API error:', errorText);
          throw new Error('Failed to send email');
        }
        
        // Save to Calculator Leads database (Email request = Warm lead)
        const leadSaveResponse = await fetch('/api/save-calculator-lead', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            estimateData, 
            leadData: { ...leadData, action: 'email_sent' },
            website: honeypotData
          }),
        });
        
        if (!leadSaveResponse.ok) {
          console.error('Failed to save email lead:', await leadSaveResponse.text());
        }

      } else if (action === 'discuss') {
        // For "discuss", send consultation request email with estimate data
        const consultationResponse = await fetch('/api/send-consultation-request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ estimateData, leadData, website: honeypotData }),
        });

        if (!consultationResponse.ok) {
          const errorText = await consultationResponse.text();
          console.error('Consultation API error:', errorText);
          throw new Error('Failed to send consultation request');
        }
        
        // Save to Calculator Leads database (Consultation request = Hot lead)
        const leadSaveResponse = await fetch('/api/save-calculator-lead', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            estimateData, 
            leadData: { ...leadData, action: 'contact_request' },
            website: honeypotData
          }),
        });
        
        if (!leadSaveResponse.ok) {
          console.error('Failed to save consultation lead:', await leadSaveResponse.text());
        }
      }

      setSubmitStatus('success');
      
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper functions to get current calculator data
  const getCurrentTotal = (formType: string) => {
    const totalElements = {
      'website': '.hack45-added-value-2',
      'design': '.hack45-added-value-3', 
      'photo': '.hack45-added-value-4'
    };
    
    const element = document.querySelector(totalElements[formType as keyof typeof totalElements]);
    if (element) {
      // Remove commas, dollar signs, and other formatting before parsing
      const cleanText = (element.textContent || '0').replace(/[$,\s]/g, '');
      return parseInt(cleanText) || 0;
    }
    return 0;
  };

  const getCurrentSelections = (formType: string) => {
    const selections: {
      websiteType?: string;
      pageCount?: string;
      timeline?: string;
      features?: string[];
      services?: string[];
      service?: string;
      additional?: string[];
    } = {};
    
    if (formType === 'website') {
      const websiteType = document.querySelector('.hack42-45-form-websites input[name^="website-type"]:checked') as HTMLInputElement;
      const timeline = document.querySelector('.hack42-45-form-websites input[name^="timeline"]:checked') as HTMLInputElement;
      const features = document.querySelectorAll('.hack42-45-form-websites input[name^="feature"]:checked') as NodeListOf<HTMLInputElement>;
      
      selections.websiteType = websiteType?.name || '';
      selections.pageCount = websiteType?.getAttribute('page-count') || '';
      selections.timeline = timeline?.name || '';
      selections.features = Array.from(features).map(f => f.name);
    } else if (formType === 'design') {
      const services = document.querySelectorAll('.hack42-45-form-design input[name^="design-service"]:checked') as NodeListOf<HTMLInputElement>;
      const timeline = document.querySelector('.hack42-45-form-design input[name^="design-timeline"]:checked') as HTMLInputElement;
      
      selections.services = Array.from(services).map(s => s.name);
      selections.timeline = timeline?.name || '';
    } else if (formType === 'photo') {
      const service = document.querySelector('.hack42-45-form-photo input[name="photo-service"]:checked') as HTMLInputElement;
      const timeline = document.querySelector('.hack42-45-form-photo input[name^="photo-timeline"]:checked') as HTMLInputElement;
      const additional = document.querySelectorAll('.hack42-45-form-photo input[name^="photo-additional"]:checked') as NodeListOf<HTMLInputElement>;
      
      selections.service = service?.id || '';
      selections.timeline = timeline?.name || '';
      selections.additional = Array.from(additional).map(a => a.name);
    }
    
    return selections;
  };

  const getActionTitle = () => {
    switch (action) {
      case 'pdf': return 'Download Your PDF Estimate';
      case 'email': return 'Email Your Estimate';
      case 'discuss': return 'Discuss Your Project With Us';
      default: return 'Contact Information';
    }
  };

  if (submitStatus === 'success') {
    return (
      <div className="lead-capture-form-container">
        <div className="lead-capture-form">
          <div className="form-header">
            <h4>Thank You!</h4>
            <button type="button" className="close-form-btn" onClick={onClose}>×</button>
          </div>
          <div className="lead-capture-success">
            {action === 'pdf' && <p>Your PDF estimate is being generated and will download shortly.</p>}
            {action === 'email' && <p>Your estimate has been sent to {formData.email}</p>}
            {action === 'discuss' && <p>We&apos;ll contact you within 24 hours to schedule your consultation.</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lead-capture-form-container">
      <div className="lead-capture-form">
        <div className="form-header">
          <h4>{getActionTitle()}</h4>
          <button type="button" className="close-form-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <HoneypotField onUpdate={setHoneypotData} />
          
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="name">Full Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="email">Email Address *</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="company">Company Name</label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-field">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </div>
          </div>

          {action === 'discuss' && (
            <div className="form-field">
              <label htmlFor="message">Project Details (Optional)</label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                rows={3}
                placeholder="Tell us more about your project goals, timeline, or specific requirements..."
              />
            </div>
          )}

          <div className="form-actions">
            <button 
              type="submit" 
              className="submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 
                action === 'pdf' ? 'Generate PDF' :
                action === 'email' ? 'Send Estimate' :
                'Discuss With Us'
              }
            </button>
          </div>

          {submitStatus === 'error' && (
            <div className="error-message">
              Something went wrong. Please try again or contact us directly at info@thedotcreative.co
            </div>
          )}
        </form>
      </div>
    </div>
  );
}