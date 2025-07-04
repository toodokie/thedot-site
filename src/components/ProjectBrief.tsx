'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Footer from './Footer';

// Type definitions for form data
interface LeadData {
  name: string;
  email: string;
}

interface WebsiteBriefData {
  [key: string]: string | boolean | FormDataEntryValue;
  'name-2': string;
  'email-2': string;
  'company-size'?: string;
  'decision-level'?: string;
  'project-urgency'?: string;
  'how-did-you-hear'?: string;
  'sphere-2'?: string;
  'competitors-2'?: string;
  'stand-out-2'?: string;
  // Add other website-specific fields as needed
}

interface GraphicBriefData {
  [key: string]: string | boolean | FormDataEntryValue;
  'name-4': string;
  'email-4': string;
  'company-size-graphic'?: string;
  'decision-level-graphic'?: string;
  'project-urgency-graphic'?: string;
  'how-did-you-hear-graphic'?: string;
  // Add other graphic-specific fields as needed
}

interface PhotoBriefData {
  [key: string]: string | boolean | FormDataEntryValue;
  'name-6': string;
  'email-6': string;
  'company-size-photo'?: string;
  'decision-level-photo'?: string;
  'project-urgency-photo'?: string;
  'how-did-you-hear-photo'?: string;
  // Add other photo-specific fields as needed
}

type BriefData = WebsiteBriefData | GraphicBriefData | PhotoBriefData;


export default function ProjectBrief() {
  const [activeTab, setActiveTab] = useState<'Tab 1 - Websites' | 'Tab 2 - Graphic' | 'Tab 3 - Photo'>('Tab 1 - Websites');

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

    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  const handleBriefSubmission = (formType: 'website' | 'graphic' | 'photo', leadData: LeadData, briefData: BriefData) => {
    // Encode the data to pass to new window
    const briefDataEncoded = encodeURIComponent(JSON.stringify({
      formType,
      leadData,
      briefData
    }));
    
    // Open results in new tab
    const newWindow = window.open(
      `/brief/results?data=${briefDataEncoded}`,
      '_blank'
    );
    
    if (newWindow) {
      newWindow.focus();
    }
  };


  return (
    <>
      <div className="dot_body">
      <style jsx>{`
        .radio-button-field-13.w-radio {
          margin-bottom: 10px !important;
        }
        .radio-button-field.w-radio {
          margin-bottom: 10px !important;
        }
        .brief-title {
          margin-top: 2rem !important;
        }
        .button-is-webflow {
          margin-top: 3rem !important;
          margin-bottom: 5rem !important;
        }
      `}</style>
      <a id="back_link" href="#" className="back-link w-inline-block"></a>
      <section className="hero-title-copy-services estimate">
        <div className="div-block-184">
          <div className="div-block-183">
            <div className="div-block-178-services">
              <div className="w-layout-blockcontainer graphic-title-wrap-copy-services w-container">
                <div className="graphic-copy-services">
                  <h1 className="dot_h1_pages">Start your project</h1>
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
                  <h2 className="dot_h2_subheader">Fill Out Our Design Brief</h2>
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

      <div className="section-main _14vw">
        <div className="container about-title brief">
          <div className="max-width-xlarge align-center">
            <h2 className="services-features-title">Services Features Overview</h2>
            <div className="services-tabs">
              <div className="services-tabs-menu">
                <button 
                  className={`services-tab-button ${activeTab === 'Tab 1 - Websites' ? 'active' : ''}`}
                  onClick={() => setActiveTab('Tab 1 - Websites')}
                >
                  <span className="tab-dot">●</span>
                  <span className="tab-title">WEBSITES</span>
                </button>
                <button 
                  className={`services-tab-button ${activeTab === 'Tab 2 - Graphic' ? 'active' : ''}`}
                  onClick={() => setActiveTab('Tab 2 - Graphic')}
                >
                  <span className="tab-dot">●</span>
                  <span className="tab-title">GRAPHIC DESIGN</span>
                </button>
                <button 
                  className={`services-tab-button ${activeTab === 'Tab 3 - Photo' ? 'active' : ''}`}
                  onClick={() => setActiveTab('Tab 3 - Photo')}
                >
                  <span className="tab-dot">●</span>
                  <span className="tab-title">PHOTO & VIDEO</span>
                </button>
              </div>
              
              <div className="tab-content-decorative-lines">
                <div className="decorative-line-yellow"></div>
                <div className="decorative-line-black"></div>
              </div>
              <div className="services-tabs-content">
                
                {activeTab === 'Tab 1 - Websites' && (
                  <div className="services-tab-content">
                    <div className="tabs_content-wrapper-service">
                      <div className="max-width-full">
                        <div className="w-layout-grid tabs-layout_component">
                          <div className="tabs-layout_content">
                            <div className="tabs-layout_component w-form">
                              <form id="wf-form-Website-Form" name="wf-form-Website-Form" data-name="Website Form" redirect="/" data-redirect="/" method="get" className="website-form" data-wf-page-id="650e3ca06cf62f0b69c35e31" data-wf-element-id="fedee880-7b4d-c63e-75bd-9f4fb22a3840">
                                <div className="w-layout-blockcontainer form-container-web-section w-container">
                                  <h1 className="brief-title">Websites Brief</h1>
                                  
                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">Your Contacts:</h1>
                                    <label htmlFor="name-3" className="dot_field_label">Name:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="name-2" data-name="Name 2" placeholder="" type="text" id="name-3" required />
                                    <label htmlFor="email-3" className="dot_field_label">Email:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="email-2" data-name="Email 2" placeholder="" type="email" id="email-3" required />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">Lead Qualification:</h1>
                                    
                                    <h1 className="dot_field_label"><strong>Company Size</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="Solo" />
                                      <span className="radio-button-label w-form-label">Solo</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="2-10" />
                                      <span className="radio-button-label w-form-label">2-10 employees</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="11-50" />
                                      <span className="radio-button-label w-form-label">11-50 employees</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="50+" />
                                      <span className="radio-button-label w-form-label">50+ employees</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>Decision Maker Level</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="I make decisions" />
                                      <span className="radio-button-label w-form-label">I make decisions</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="I recommend" />
                                      <span className="radio-button-label w-form-label">I recommend</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="Team decision" />
                                      <span className="radio-button-label w-form-label">Team decision</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>Project Urgency</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="ASAP" />
                                      <span className="radio-button-label w-form-label">ASAP</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="1-3 months" />
                                      <span className="radio-button-label w-form-label">1-3 months</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="3-6 months" />
                                      <span className="radio-button-label w-form-label">3-6 months</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="Planning ahead" />
                                      <span className="radio-button-label w-form-label">Planning ahead</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>How Did You Hear About Us?</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Google" />
                                      <span className="radio-button-label w-form-label">Google</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Referral" />
                                      <span className="radio-button-label w-form-label">Referral</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Social Media" />
                                      <span className="radio-button-label w-form-label">Social Media</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Other" />
                                      <span className="radio-button-label w-form-label">Other</span>
                                    </label>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">1/6 Company&apos;s Info:</h1>
                                    <h1 className="dot_field_label"><strong className="bold-text-6">Business Sector</strong></h1>
                                    <textarea id="sphere-3" name="sphere-2" maxLength={5000} data-name="Sphere 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-5">Key Competitors</strong></h1>
                                    <textarea id="competitors-3" name="competitors-2" maxLength={5000} data-name="Competitors 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-16">Competitive Edge</strong></h1>
                                    <textarea id="stand-out-3" name="stand-out-2" maxLength={5000} data-name="Stand Out 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">2/6 <strong className="bold-text-7">Core Business Activities</strong>:</h1>
                                    <h1 className="dot_field_label"><strong className="bold-text-8">Products/Services Offered</strong></h1>
                                    <textarea id="produces-3" name="produces-2" maxLength={5000} data-name="Produces 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-9">Target Audience Description</strong></h1>
                                    <textarea id="audience-3" name="audience-2" maxLength={5000} data-name="Audience 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-10">Primary Sales Channels</strong></h1>
                                    <textarea id="sales-channel-3" name="sales-channel-2" maxLength={5000} data-name="Sales Channel 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-11">Sales Regions</strong></h1>
                                    <textarea id="sales-geography-3" name="sales-geography-2" maxLength={5000} data-name="Sales Geography 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-12">Unique Selling Points</strong></h1>
                                    <textarea id="produce-benefits-3" name="produce-benefits-2" maxLength={5000} data-name="Produce Benefits 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-13">Pricing Strategy</strong></h1>
                                    <textarea id="pricing-niche-2" name="pricing-niche-2" maxLength={5000} data-name="Pricing Niche 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-14">Main Source of Customers</strong></h1>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a387f" className="radio-button-field-14 w-radio">
                                      <input id="search-2" type="radio" name="getting-clients" data-name="getting clients" className="w-form-formradioinput radio-button-13 w-radio-input" value="search" />
                                      <span htmlFor="search-2" className="radio-button-label w-form-label">Search Engine Advertising</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3883" className="radio-button-field-12 w-radio">
                                      <input id="social-2" type="radio" name="getting-clients" data-name="getting clients" className="w-form-formradioinput radio-button-14 w-radio-input" value="social" />
                                      <span htmlFor="social-2" className="radio-button-label w-form-label">Social Media</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3887" className="radio-button-field-13 w-radio">
                                      <input id="other-4" type="radio" name="getting-clients" data-name="getting clients" className="w-form-formradioinput radio-button-15 w-radio-input" value="other" />
                                      <span htmlFor="other-4" className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="getting-clients-other-text-2" data-name="Getting Clients Other Text 2" placeholder="Provide Details" type="text" id="getting-clients-other-text-3" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">3/6 Website Development Preferences</h1>
                                    
                                    <h1 className="dot_field_label">Current Website</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="current-website" data-name="Current Website" placeholder="Website URL or 'No current website'" type="text" id="current-website" />
                                    
                                    <h1 className="dot_field_label">Biggest Website Challenge</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="website-challenge" className="w-form-formradioinput radio-button w-radio-input" value="Traffic" />
                                      <span className="radio-button-label w-form-label">Traffic</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="website-challenge" className="w-form-formradioinput radio-button w-radio-input" value="Conversions" />
                                      <span className="radio-button-label w-form-label">Conversions</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="website-challenge" className="w-form-formradioinput radio-button w-radio-input" value="Design" />
                                      <span className="radio-button-label w-form-label">Design</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="website-challenge" className="w-form-formradioinput radio-button w-radio-input" value="Technical" />
                                      <span className="radio-button-label w-form-label">Technical</span>
                                    </label>
                                    
                                    <h1 className="dot_field_label">Success Metrics</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="success-metrics" className="w-form-formradioinput radio-button w-radio-input" value="More leads" />
                                      <span className="radio-button-label w-form-label">More leads</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="success-metrics" className="w-form-formradioinput radio-button w-radio-input" value="Sales" />
                                      <span className="radio-button-label w-form-label">Sales</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="success-metrics" className="w-form-formradioinput radio-button w-radio-input" value="Brand awareness" />
                                      <span className="radio-button-label w-form-label">Brand awareness</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="success-metrics" className="w-form-formradioinput radio-button w-radio-input" value="User experience" />
                                      <span className="radio-button-label w-form-label">User experience</span>
                                    </label>

                                    <h1 className="dot_field_label">What Type of Website Are You Interested In?</h1>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3893" className="radio-button-field-8 w-radio">
                                      <input id="company " type="radio" name="site-type" data-name="site type" className="w-form-formradioinput radio-button-3 w-radio-input" value="company " />
                                      <span htmlFor="company " className="radio-button-label w-form-label">Company&apos;s Website</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3897" className="radio-button-field-9 w-radio">
                                      <input id="online shop" type="radio" name="site-type" data-name="site type" className="w-form-formradioinput radio-button-4 w-radio-input" value="online shop" />
                                      <span htmlFor="online shop" className="radio-button-label w-form-label">E-Commerce</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a389b" className="radio-button-field-10 w-radio">
                                      <input id="landing " type="radio" name="site-type" data-name="site type" className="w-form-formradioinput radio-button-5 w-radio-input" value="landing " />
                                      <span htmlFor="landing " className="radio-button-label w-form-label">Landing Page for a Specific Product or Service Category</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a389f" className="radio-button-field-11 w-radio">
                                      <input id="other-5" type="radio" name="site-type" data-name="site type" className="w-form-formradioinput radio-button-6 w-radio-input" value="other " />
                                      <span htmlFor="other-5" className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="site-type-other-text-2" data-name="Site Type Other Text 2" placeholder="Provide Details" type="text" id="site-type-other-text-3" />
                                    
                                    <h1 className="dot_field_label">Domain&apos;s Address, if applicable<span className="text-span-38"></span></h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="domain-name-2" data-name="Domain Name 2" placeholder="" type="text" id="domain-name-2" />
                                    
                                    <h1 className="dot_field_label">What do you think could set your website apart from others in your niche?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="site-stand-out-2" data-name="Site Stand Out 2" placeholder="" type="text" id="site-stand-out-2" />
                                    
                                    <h1 className="dot_field_label">Expected action from the website visitor</h1>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38ae" className="radio-button-field-4 w-radio">
                                      <input id="form" type="radio" name="desired-behavior" data-name="desired behavior" className="w-form-formradioinput radio-button-7 w-radio-input" value="form" />
                                      <span htmlFor="form" className="radio-button-label w-form-label">Form Filling</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38b2" className="radio-button-field-7 w-radio">
                                      <input id="purchase" type="radio" name="desired-behavior" data-name="desired behavior" className="w-form-formradioinput radio-button-8 w-radio-input" value="purchase" />
                                      <span htmlFor="purchase" className="radio-button-label w-form-label">Purchase</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38b6" className="radio-button-field-6 w-radio">
                                      <input id="call" type="radio" name="desired-behavior" data-name="desired behavior" className="w-form-formradioinput radio-button-9 w-radio-input" value="call" />
                                      <span htmlFor="call" className="radio-button-label w-form-label">Call</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38ba" className="radio-button-field-5 w-radio">
                                      <input id="other-2" type="radio" name="desired-behavior" data-name="desired behavior" className="w-form-formradioinput radio-button-10 w-radio-input" value="other" />
                                      <span htmlFor="other-2" className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="desired-behavior-other-text-2" data-name="Desired Behavior Other Text 2" placeholder="Provide Details" type="text" id="desired-behavior-other-text-2" />
                                    
                                    <h1 className="dot_field_label">Approximate Number of Pages</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="pages-per-site-2" data-name="Pages Per Site 2" placeholder="" type="text" id="pages-per-site-2" />
                                    
                                    <h1 className="dot_field_label">Website Structure with Section Titles</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="site-structure-2" data-name="Site Structure 2" placeholder="" type="text" id="site-structure-2" required />
                                    
                                    <h1 className="dot_field_label">Desired Content Blocks on the Main Page</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="main-page-architecture-2" data-name="Main Page Architecture 2" placeholder="" type="text" id="main-page-architecture-2" />
                                    
                                    <h1 className="dot_field_label">Desired Content Blocks on Other Pages</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="other-pages-architecture-2" data-name="Other Pages Architecture 2" placeholder="" type="text" id="other-pages-architecture-2" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">4/6 Design & Contents</h1>
                                    <h1 className="dot_field_label">Please indicate what elements of corporate identity your company has</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="brand-assets-2" data-name="Brand Assets 2" placeholder="" type="text" id="brand-assets-2" required />
                                    
                                    <h1 className="dot_field_label">Examples of websites you like (try to note what exactly caught your attention)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="reference-sites-2" data-name="Reference Sites 2" placeholder="" type="text" id="reference-sites-2" required />
                                    
                                    <h1 className="dot_field_label">Examples of websites you do not like (try to specify the reasons)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="sites-no-follow-2" data-name="Sites No Follow 2" placeholder="" type="text" id="sites-no-follow-2" required />
                                    
                                    <h1 className="dot_field_label">Will there be a need for creating and selecting visual content for the website (photos, illustrations, 3D graphics, etc.)?</h1>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38eb" className="radio-button-label w-radio">
                                      <input id="yes" type="radio" name="assets-creation" data-name="assets creation" className="w-form-formradioinput radio-button w-radio-input" value="yes" />
                                      <span htmlFor="yes" className="radio-button-label w-form-label">Yes</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38f0" className="radio-button-label w-radio">
                                      <input id="no" type="radio" name="assets-creation" data-name="assets creation" className="w-form-formradioinput radio-button-2 w-radio-input" value="no" />
                                      <span htmlFor="no" className="radio-button-label w-form-label">No</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="assets-creation-yes-text-2" data-name="Assets Creation Yes Text 2" placeholder="Specify please" type="text" id="assets-creation-yes-text-2" required />
                                    
                                    <h1 className="dot_field_label">Overall style and mood (for example, modern/ elegant/ bright/ minimalistic/classic, etc.)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="overall-site-style-2" data-name="Overall Site Style 2" placeholder="" type="text" id="overall-site-style-2" required />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">5/6 Functional Features</h1>
                                    <h1 className="dot_field_label">What embedded elements are necessary for the website (select multiple if required)</h1>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a38ff" className="w-checkbox checkbox-field-6">
                                      <input id="built in elements catalog" type="checkbox" name="built-in-elements-catalog" data-name="built in elements catalog" className="w-checkbox-input checkbox" />
                                      <span htmlFor="built-in-elements-catalog" className="checkbox-label w-form-label">Product Catalog</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3903" className="w-checkbox checkbox-field-7">
                                      <input id="built in elements cart" type="checkbox" name="built-in-elements-cart" data-name="built in elements cart" className="w-checkbox-input checkbox-2" />
                                      <span htmlFor="built-in-elements-cart" className="checkbox-label w-form-label">Online Cart</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3907" className="w-checkbox checkbox-field-8">
                                      <input id="built in elements cart payments" type="checkbox" name="built-in-elements-cart-payments" data-name="built in elements cart payments" className="w-checkbox-input checkbox-3" />
                                      <span htmlFor="built-in-elements-cart-payments" className="checkbox-label w-form-label">Online Payments</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a390b" className="w-checkbox checkbox-field-9">
                                      <input id="built in elements crm" type="checkbox" name="built-in-elements-crm" data-name="built in elements crm" className="w-checkbox-input checkbox-4" />
                                      <span htmlFor="built-in-elements-crm" className="checkbox-label w-form-label">CRM</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a390f" className="w-checkbox checkbox-field-10">
                                      <input id="built in elements form" type="checkbox" name="built-in-elements-form" data-name="built in elements form" className="w-checkbox-input checkbox-5" />
                                      <span htmlFor="built-in-elements-form" className="checkbox-label w-form-label">Contact Forms</span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3913" className="w-checkbox checkbox-field-11">
                                      <input id="built in elements other" type="checkbox" name="built-in-elements-other" data-name="built in elements other" className="w-checkbox-input checkbox-6" />
                                      <span htmlFor="built-in-elements-other" className="checkbox-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="built-in-elements-other-text-2" data-name="Built In Elements Other Text 2" placeholder="Specify please" type="text" id="built-in-elements-other-text-2" />
                                    
                                    <h1 className="dot_field_label">How often do you plan to update the content on the website?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="update-frequency-2" data-name="Update Frequency 2" placeholder="for example, a couple of times a week" type="text" id="update-frequency-2" required />
                                    
                                    <h1 className="dot_field_label">Who will be responsible for updating the content?</h1>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a391d" className="radio-button-field-3 w-radio">
                                      <input id="skilled" type="radio" name="update-person" data-name="update person" className="w-form-formradioinput radio-button-11 w-radio-input" value="skilled" />
                                      <span htmlFor="skilled" className="radio-button-label w-form-label">Skilled Specialist </span>
                                    </label>
                                    <label data-w-id="fedee880-7b4d-c63e-75bd-9f4fb22a3921" className="w-radio">
                                      <input id="unskilled" type="radio" name="update-person" data-name="update person" className="w-form-formradioinput radio-button-12 w-radio-input" value="unskilled" />
                                      <span htmlFor="unskilled" className="radio-button-label w-form-label">Employee without specialized experience</span>
                                    </label>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">6/6 General information about the project:</h1>
                                    <h1 className="dot_field_label">Desired launch date for the website?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="deadline-date-2" data-name="Deadline Date 2" placeholder="" type="text" id="deadline-date-3" required />
                                    
                                    <h1 className="dot_field_label">Approximate Budget</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="project-budjet-2" data-name="Project Budjet 2" placeholder="" type="text" id="project-budjet-3" required />
                                    
                                    <div className="w-layout-blockcontainer form-container-web w-container">
                                      <button type="button" className="button-submit" onClick={async (e) => {
                                        e.preventDefault();
                                        const form = e.currentTarget.closest('form');
                                        if (form) {
                                          const formData = new FormData(form);
                                          const briefData: WebsiteBriefData = {} as WebsiteBriefData;
                                          for (const [key, value] of formData.entries()) {
                                            briefData[key] = value;
                                          }
                                          const leadData = {
                                            name: formData.get('name-2') as string,
                                            email: formData.get('email-2') as string
                                          };
                                          
                                          // Submit to API first and get briefId
                                          let briefId = null;
                                          try {
                                            const response = await fetch('/api/brief-submission', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                formType: 'website',
                                                name: leadData.name,
                                                email: leadData.email,
                                                company: briefData['sphere-2'] || '',
                                                briefData
                                              })
                                            });
                                            if (response.ok) {
                                              const result = await response.json();
                                              briefId = result.briefId;
                                            }
                                          } catch (error) {
                                            console.error('Failed to submit to API:', error);
                                          }
                                          
                                          // Add briefId to briefData
                                          briefData.briefId = briefId;
                                          
                                          handleBriefSubmission('website', leadData, briefData);
                                        }
                                      }}>Submit Brief</button>
                                    </div>
                                  </div>
                                </div>
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'Tab 2 - Graphic' && (
                  <div className="services-tab-content">
                    <div className="tabs_content-wrapper-service">
                      <div className="max-width-full">
                        <div className="w-layout-grid tabs-layout_component">
                          <div className="tabs-layout_content">
                            <div className="tabs-layout_component w-form">
                              <form id="wf-form-Webdesign-Form" name="wf-form-Webdesign-Form" data-name="Webdesign Form" redirect="/" data-redirect="/" method="get" className="webdesign-form" data-wf-page-id="650e3ca06cf62f0b69c35e31" data-wf-element-id="0d26b044-80d0-a38f-eccd-c3ce5a46d3e2">
                                <div className="w-layout-blockcontainer form-container-web-section w-container">
                                  <h1 className="brief-title">Graphic Design Brief</h1>
                                  
                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">Your Contacts:</h1>
                                    <label htmlFor="name-2" className="dot_field_label">Name:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="name-2" data-name="Name 2" placeholder="" type="text" id="name-2" required />
                                    <label htmlFor="email-2" className="dot_field_label">Email:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="email-2" data-name="Email 2" placeholder="" type="email" id="email-2" required />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">Lead Qualification:</h1>
                                    
                                    <h1 className="dot_field_label"><strong>Company Size</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="Solo" />
                                      <span className="radio-button-label w-form-label">Solo</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="2-10" />
                                      <span className="radio-button-label w-form-label">2-10 employees</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="11-50" />
                                      <span className="radio-button-label w-form-label">11-50 employees</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="50+" />
                                      <span className="radio-button-label w-form-label">50+ employees</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>Decision Maker Level</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="I make decisions" />
                                      <span className="radio-button-label w-form-label">I make decisions</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="I recommend" />
                                      <span className="radio-button-label w-form-label">I recommend</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="Team decision" />
                                      <span className="radio-button-label w-form-label">Team decision</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>Project Urgency</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="ASAP" />
                                      <span className="radio-button-label w-form-label">ASAP</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="1-3 months" />
                                      <span className="radio-button-label w-form-label">1-3 months</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="3-6 months" />
                                      <span className="radio-button-label w-form-label">3-6 months</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="Planning ahead" />
                                      <span className="radio-button-label w-form-label">Planning ahead</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>How Did You Hear About Us?</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Google" />
                                      <span className="radio-button-label w-form-label">Google</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Referral" />
                                      <span className="radio-button-label w-form-label">Referral</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Social Media" />
                                      <span className="radio-button-label w-form-label">Social Media</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Other" />
                                      <span className="radio-button-label w-form-label">Other</span>
                                    </label>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">1/5 Company&apos;s Info:</h1>
                                    <h1 className="dot_field_label"><strong className="bold-text-6">Business Sector</strong></h1>
                                    <textarea id="sphere-2" name="sphere-2" maxLength={5000} data-name="Sphere 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-5">Key Competitors</strong></h1>
                                    <textarea id="competitors-2" name="competitors-2" maxLength={5000} data-name="Competitors 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-16">Competitive Edge</strong></h1>
                                    <textarea id="stand-out-2" name="stand-out-2" maxLength={5000} data-name="Stand Out 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">2/5 <strong className="bold-text-7">Core Business Activities</strong>:</h1>
                                    <h1 className="dot_field_label"><strong className="bold-text-8">Products/Services Offered</strong></h1>
                                    <textarea id="produces-2" name="produces-2" maxLength={5000} data-name="Produces 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-9">Target Audience Description</strong></h1>
                                    <textarea id="audience-2" name="audience-2" maxLength={5000} data-name="Audience 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-10">Primary Sales Channels</strong></h1>
                                    <textarea id="sales-channel-2" name="sales-channel-2" maxLength={5000} data-name="Sales Channel 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-11">Sales Regions</strong></h1>
                                    <textarea id="sales-geography-2" name="sales-geography-2" maxLength={5000} data-name="Sales Geography 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-12">Unique Selling Points</strong></h1>
                                    <textarea id="produce-benefits-2" name="produce-benefits-2" maxLength={5000} data-name="Produce Benefits 2" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-14">Main Source of Customers</strong></h1>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d423" className="radio-button-field-14 w-radio">
                                      <input id="search" type="radio" name="getting-clients" data-name="getting clients" className="w-form-formradioinput radio-button-13 w-radio-input" value="search" />
                                      <span htmlFor="search" className="radio-button-label w-form-label">Search Engine Advertising</span>
                                    </label>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d427" className="radio-button-field-12 w-radio">
                                      <input id="social" type="radio" name="getting-clients" data-name="getting clients" className="w-form-formradioinput radio-button-14 w-radio-input" value="social" />
                                      <span htmlFor="social" className="radio-button-label w-form-label">Social Media</span>
                                    </label>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d42b" className="radio-button-field-13 w-radio">
                                      <input id="other-3" type="radio" name="getting-clients" data-name="getting clients" className="w-form-formradioinput radio-button-15 w-radio-input" value="other" />
                                      <span htmlFor="other-3" className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="getting-clients-other-text-2" data-name="Getting Clients Other Text 2" placeholder="Provide details" type="text" id="getting-clients-other-text-2" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">3/5 Preferences:</h1>
                                    
                                    <h1 className="dot_field_label">Brand Maturity</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="brand-maturity" className="w-form-formradioinput radio-button w-radio-input" value="Startup" />
                                      <span className="radio-button-label w-form-label">Startup</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="brand-maturity" className="w-form-formradioinput radio-button w-radio-input" value="Rebrand" />
                                      <span className="radio-button-label w-form-label">Rebrand</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="brand-maturity" className="w-form-formradioinput radio-button w-radio-input" value="Established evolution" />
                                      <span className="radio-button-label w-form-label">Established evolution</span>
                                    </label>
                                    
                                    <h1 className="dot_field_label">Usage Timeline</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="usage-timeline" className="w-form-formradioinput radio-button w-radio-input" value="Immediate launch" />
                                      <span className="radio-button-label w-form-label">Immediate launch</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="usage-timeline" className="w-form-formradioinput radio-button w-radio-input" value="Gradual rollout" />
                                      <span className="radio-button-label w-form-label">Gradual rollout</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="usage-timeline" className="w-form-formradioinput radio-button w-radio-input" value="Future planning" />
                                      <span className="radio-button-label w-form-label">Future planning</span>
                                    </label>
                                    
                                    <h1 className="dot_field_label">Internal Resources</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="internal-resources" className="w-form-formradioinput radio-button w-radio-input" value="No design team" />
                                      <span className="radio-button-label w-form-label">No design team</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="internal-resources" className="w-form-formradioinput radio-button w-radio-input" value="Some capability" />
                                      <span className="radio-button-label w-form-label">Some capability</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="internal-resources" className="w-form-formradioinput radio-button w-radio-input" value="Full team" />
                                      <span className="radio-button-label w-form-label">Full team</span>
                                    </label>

                                    <h1 className="dot_field_label">Type of Design Service Required:</h1>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d436" className="radio-button-field-8 w-radio">
                                      <input id="Logo-Design" type="radio" name="Services-Required" data-name="Services Required" className="w-form-formradioinput radio-button-3 w-radio-input" value="Logo Design" />
                                      <span htmlFor="Logo-Design" className="radio-button-label graphic w-form-label"><strong>Logo Design</strong>: This is ideal if you&apos;re starting a new business or venture and require a logo. We will focus solely on creating a unique, impactful logo that represents your brand.</span>
                                    </label>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d43a" className="radio-button-field-9 w-radio">
                                      <input id="Logo-Remake" type="radio" name="Services-Required" data-name="Services Required" className="w-form-formradioinput radio-button-4 w-radio-input" value="Logo Remake" />
                                      <span htmlFor="Logo-Remake" className="radio-button-label graphic w-form-label"><strong>Logo Remake</strong>: Choose this if you already have an existing logo that needs improvement. This could mean updating the font, colors, or even the entire concept while retaining core elements.</span>
                                    </label>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d43e" className="radio-button-field-10 w-radio">
                                      <input id="Identity-System" type="radio" name="Services-Required" data-name="Services Required" className="w-form-formradioinput radio-button-5 w-radio-input" value="Identity System" />
                                      <span htmlFor="Identity-System" className="radio-button-label graphic w-form-label"><strong className="bold-text-17">Brand Identity System</strong>: This is a comprehensive service that not only includes a logo design but extends to the entire visual language of your brand. It encompasses the creation of brand colors, typography, and the systems needed for their implementation across various mediums. These mediums include business cards, letterheads, social media assets, and style guidelines, among other essential brand elements.</span>
                                    </label>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d442" className="radio-button-field-11 w-radio">
                                      <input id="other " type="radio" name="Services-Required" data-name="Services Required" className="w-form-formradioinput radio-button-6 w-radio-input" value="other " />
                                      <span htmlFor="other " className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="site-type-other-text-2" data-name="Site Type Other Text 2" placeholder="Provide Details" type="text" id="site-type-other-text-2" />
                                    
                                    <h1 className="dot_field_label">What adjectives would you use to describe the desired style? (e.g., modern, traditional, playful, elegant)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Desired-Style" data-name="Desired Style" placeholder="" type="text" id="Desired-Style" />
                                    
                                    <h1 className="dot_field_label">Are there any specific color schemes you&apos;re interested in?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Preferred-Colors" data-name="Preferred Colors" placeholder="" type="text" id="Preferred-Colors" />
                                    
                                    <h1 className="dot_field_label">Do you have existing brand guidelines that the design needs to adhere to?</h1>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d451" className="radio-button-field-4 w-radio">
                                      <input id="Yes-2" type="radio" name="Exciting-Guidelines" data-name="Exciting Guidelines" className="w-form-formradioinput radio-button-7 w-radio-input" value="Yes" />
                                      <span htmlFor="Yes-2" className="radio-button-label w-form-label">Yes</span>
                                    </label>
                                    <label data-w-id="0d26b044-80d0-a38f-eccd-c3ce5a46d455" className="radio-button-field-7 w-radio">
                                      <input id="No-2" type="radio" name="Exciting-Guidelines" data-name="Exciting Guidelines" className="w-form-formradioinput radio-button-8 w-radio-input" value="No" />
                                      <span htmlFor="No-2" className="radio-button-label w-form-label">No</span>
                                    </label>
                                    
                                    <h1 className="dot_field_label">What is the primary message you want the design to convey?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Audience-Message" data-name="Audience Message" placeholder="" type="text" id="Audience-Message" />
                                    
                                    <h1 className="dot_field_label">Do you have preferred fonts or typography?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Preferred-fonts" data-name="Preferred fonts" placeholder="" type="text" id="Preferred-fonts" required />
                                    
                                    <h1 className="dot_field_label">Do you have examples of designs you love? What do you love about them?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Design-Examples" data-name="Design Examples" placeholder="" type="text" id="Design-Examples" />
                                    
                                    <h1 className="dot_field_label">Are there designs you dislike? What elements are unappealing to you?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Dislike-examples" data-name="Dislike examples" placeholder="" type="text" id="Dislike-examples" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">4/5 Contents</h1>
                                    <h1 className="dot_field_label">Are there any specific elements that must be included? (e.g., QR code, social media icons)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Special-elements" data-name="Special elements" placeholder="" type="text" id="Special-elements" required />
                                    
                                    <h1 className="dot_field_label">What is the call-to-action, if applicable?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Call-to-Action" data-name="Call to Action" placeholder="" type="text" id="Call-to-Action" required />
                                    
                                    <h1 className="dot_field_label">What file formats do you require? (e.g., JPEG, PNG, SVG)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="File-Formats" data-name="File Formats" placeholder="" type="text" id="File-Formats" required />
                                    
                                    <h1 className="dot_field_label">What are the dimensions or layout restrictions? (e.g., print size, digital dimensions)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="Layout-Considerations" data-name="Layout Considerations" placeholder="" type="text" id="Layout-Considerations" required />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">5/5 General information about the project:</h1>
                                    <h1 className="dot_field_label">What is your targeted completion date for the graphic design project?</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="deadline-date-2" data-name="Deadline Date 2" placeholder="" type="text" id="deadline-date-2" required />
                                    
                                    <h1 className="dot_field_label">Approximate Budget</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="project-budjet-2" data-name="Project Budjet 2" placeholder="" type="text" id="project-budjet-2" required />
                                    
                                    <div className="w-layout-blockcontainer form-container-web w-container">
                                      <button type="button" className="button-submit" onClick={async (e) => {
                                        e.preventDefault();
                                        const form = e.currentTarget.closest('form');
                                        if (form) {
                                          const formData = new FormData(form);
                                          const briefData: GraphicBriefData = {} as GraphicBriefData;
                                          for (const [key, value] of formData.entries()) {
                                            briefData[key] = value;
                                          }
                                          const leadData = {
                                            name: formData.get('name-2') as string,
                                            email: formData.get('email-2') as string
                                          };
                                          
                                          // Submit to API first and get briefId
                                          let briefId = null;
                                          try {
                                            const response = await fetch('/api/brief-submission', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                formType: 'graphic',
                                                name: leadData.name,
                                                email: leadData.email,
                                                company: briefData['sphere-2'] || '',
                                                briefData
                                              })
                                            });
                                            if (response.ok) {
                                              const result = await response.json();
                                              briefId = result.briefId;
                                            }
                                          } catch (error) {
                                            console.error('Failed to submit to API:', error);
                                          }
                                          
                                          // Add briefId to briefData
                                          briefData.briefId = briefId;
                                          
                                          handleBriefSubmission('graphic', leadData, briefData);
                                        }
                                      }}>Submit Brief</button>
                                    </div>
                                  </div>
                                </div>
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'Tab 3 - Photo' && (
                  <div className="services-tab-content">
                    <div className="tabs_content-wrapper-service">
                      <div className="max-width-full">
                        <div className="w-layout-grid tabs-layout_component">
                          <div className="tabs-layout_content">
                            <div className="tabs-layout_component w-form">
                              <form id="wf-form-Photo-Form" name="wf-form-Photo-Form" data-name="Photo Form" redirect="/" data-redirect="/" method="get" className="photo-form" data-wf-page-id="650e3ca06cf62f0b69c35e31" data-wf-element-id="0d26b044-80d0-a38f-eccd-c3ce5a46d3e2">
                                <div className="w-layout-blockcontainer form-container-web-section w-container">
                                  <h1 className="brief-title">Photo & Video Brief</h1>
                                  
                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">Your Contacts:</h1>
                                    <label htmlFor="name-4" className="dot_field_label">Name:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="name-3" data-name="Name 3" placeholder="" type="text" id="name-4" required />
                                    <label htmlFor="email-4" className="dot_field_label">Email:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="email-3" data-name="Email 3" placeholder="" type="email" id="email-4" required />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">Lead Qualification:</h1>
                                    
                                    <h1 className="dot_field_label"><strong>Company Size</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="Solo" />
                                      <span className="radio-button-label w-form-label">Solo</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="2-10" />
                                      <span className="radio-button-label w-form-label">2-10 employees</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="11-50" />
                                      <span className="radio-button-label w-form-label">11-50 employees</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="company-size" className="w-form-formradioinput radio-button w-radio-input" value="50+" />
                                      <span className="radio-button-label w-form-label">50+ employees</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>Decision Maker Level</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="I make decisions" />
                                      <span className="radio-button-label w-form-label">I make decisions</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="I recommend" />
                                      <span className="radio-button-label w-form-label">I recommend</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="decision-level" className="w-form-formradioinput radio-button w-radio-input" value="Team decision" />
                                      <span className="radio-button-label w-form-label">Team decision</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>Project Urgency</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="ASAP" />
                                      <span className="radio-button-label w-form-label">ASAP</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="1-3 months" />
                                      <span className="radio-button-label w-form-label">1-3 months</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="3-6 months" />
                                      <span className="radio-button-label w-form-label">3-6 months</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="project-urgency" className="w-form-formradioinput radio-button w-radio-input" value="Planning ahead" />
                                      <span className="radio-button-label w-form-label">Planning ahead</span>
                                    </label>

                                    <h1 className="dot_field_label"><strong>How Did You Hear About Us?</strong></h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Google" />
                                      <span className="radio-button-label w-form-label">Google</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Referral" />
                                      <span className="radio-button-label w-form-label">Referral</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Social Media" />
                                      <span className="radio-button-label w-form-label">Social Media</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="how-did-you-hear" className="w-form-formradioinput radio-button w-radio-input" value="Other" />
                                      <span className="radio-button-label w-form-label">Other</span>
                                    </label>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">1/6 Company&apos;s Info:</h1>
                                    <h1 className="dot_field_label"><strong className="bold-text-6">Business Sector</strong></h1>
                                    <textarea id="sphere-4" name="sphere-3" maxLength={5000} data-name="Sphere 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-5">Key Competitors</strong></h1>
                                    <textarea id="competitors-4" name="competitors-3" maxLength={5000} data-name="Competitors 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-16">Competitive Edge</strong></h1>
                                    <textarea id="stand-out-4" name="stand-out-3" maxLength={5000} data-name="Stand Out 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h1 className="dot_forms_title sites">2/6 <strong className="bold-text-7">Core Business Activities</strong>:</h1>
                                    <h1 className="dot_field_label"><strong className="bold-text-8">Products/Services Offered</strong></h1>
                                    <textarea id="produces-4" name="produces-3" maxLength={5000} data-name="Produces 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-9">Target Audience Description</strong></h1>
                                    <textarea id="audience-4" name="audience-3" maxLength={5000} data-name="Audience 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-10">Primary Sales Channels</strong></h1>
                                    <textarea id="sales-channel-4" name="sales-channel-3" maxLength={5000} data-name="Sales Channel 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-11">Sales Regions</strong></h1>
                                    <textarea id="sales-geography-4" name="sales-geography-3" maxLength={5000} data-name="Sales Geography 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-12">Unique Selling Points</strong></h1>
                                    <textarea id="produce-benefits-4" name="produce-benefits-3" maxLength={5000} data-name="Produce Benefits 3" placeholder="" className="text-filed-3 w-input"></textarea>
                                    <h1 className="dot_field_label"><strong className="bold-text-14">Main Source of Customers</strong></h1>
                                    <label className="radio-button-field-14 w-radio">
                                      <input id="search-photo" type="radio" name="getting-clients-photo" data-name="getting clients photo" className="w-form-formradioinput radio-button-13 w-radio-input" value="search" />
                                      <span htmlFor="search-photo" className="radio-button-label w-form-label">Search Engine Advertising</span>
                                    </label>
                                    <label className="radio-button-field-12 w-radio">
                                      <input id="social-photo" type="radio" name="getting-clients-photo" data-name="getting clients photo" className="w-form-formradioinput radio-button-14 w-radio-input" value="social" />
                                      <span htmlFor="social-photo" className="radio-button-label w-form-label">Social Media</span>
                                    </label>
                                    <label className="radio-button-field-13 w-radio">
                                      <input id="other-photo" type="radio" name="getting-clients-photo" data-name="getting clients photo" className="w-form-formradioinput radio-button-15 w-radio-input" value="other" />
                                      <span htmlFor="other-photo" className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="getting-clients-other-text-photo" data-name="Getting Clients Other Text Photo" placeholder="Provide details" type="text" id="getting-clients-other-text-photo" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">3/6 Project Preferences:</h1>
                                    
                                    <h1 className="dot_field_label">Content Library Needs</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="content-library" className="w-form-formradioinput radio-button w-radio-input" value="One-time" />
                                      <span className="radio-button-label w-form-label">One-time</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="content-library" className="w-form-formradioinput radio-button w-radio-input" value="Ongoing content" />
                                      <span className="radio-button-label w-form-label">Ongoing content</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="content-library" className="w-form-formradioinput radio-button w-radio-input" value="Seasonal campaigns" />
                                      <span className="radio-button-label w-form-label">Seasonal campaigns</span>
                                    </label>
                                    
                                    <h1 className="dot_field_label">Distribution Channels</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="distribution-channels" className="w-form-formradioinput radio-button w-radio-input" value="Website only" />
                                      <span className="radio-button-label w-form-label">Website only</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="distribution-channels" className="w-form-formradioinput radio-button w-radio-input" value="Social media" />
                                      <span className="radio-button-label w-form-label">Social media</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="distribution-channels" className="w-form-formradioinput radio-button w-radio-input" value="Advertising" />
                                      <span className="radio-button-label w-form-label">Advertising</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="distribution-channels" className="w-form-formradioinput radio-button w-radio-input" value="Print" />
                                      <span className="radio-button-label w-form-label">Print</span>
                                    </label>
                                    
                                    <h1 className="dot_field_label">Production Scale</h1>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="production-scale" className="w-form-formradioinput radio-button w-radio-input" value="Small/intimate" />
                                      <span className="radio-button-label w-form-label">Small/intimate</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="production-scale" className="w-form-formradioinput radio-button w-radio-input" value="Medium production" />
                                      <span className="radio-button-label w-form-label">Medium production</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="production-scale" className="w-form-formradioinput radio-button w-radio-input" value="Large/commercial" />
                                      <span className="radio-button-label w-form-label">Large/commercial</span>
                                    </label>

                                    <h1 className="dot_field_label">Type of Photo/Video Service Required:</h1>
                                    <label className="radio-button-field-8 w-radio">
                                      <input id="corporate-headshots" type="radio" name="photo-service-type" data-name="photo service type" className="w-form-formradioinput radio-button-3 w-radio-input" value="corporate-headshots" />
                                      <span htmlFor="corporate-headshots" className="radio-button-label w-form-label">Corporate Headshots</span>
                                    </label>
                                    <label className="radio-button-field-9 w-radio">
                                      <input id="product-photography" type="radio" name="photo-service-type" data-name="photo service type" className="w-form-formradioinput radio-button-4 w-radio-input" value="product-photography" />
                                      <span htmlFor="product-photography" className="radio-button-label w-form-label">Product Photography</span>
                                    </label>
                                    <label className="radio-button-field-10 w-radio">
                                      <input id="commercial-video" type="radio" name="photo-service-type" data-name="photo service type" className="w-form-formradioinput radio-button-5 w-radio-input" value="commercial-video" />
                                      <span htmlFor="commercial-video" className="radio-button-label w-form-label">Commercial Video Production</span>
                                    </label>
                                    <label className="radio-button-field-11 w-radio">
                                      <input id="social-media-content" type="radio" name="photo-service-type" data-name="photo service type" className="w-form-formradioinput radio-button-6 w-radio-input" value="social-media-content" />
                                      <span htmlFor="social-media-content" className="radio-button-label w-form-label">Social Media Content</span>
                                    </label>
                                    <label className="radio-button-field-11 w-radio">
                                      <input id="event-coverage" type="radio" name="photo-service-type" data-name="photo service type" className="w-form-formradioinput radio-button-6 w-radio-input" value="event-coverage" />
                                      <span htmlFor="event-coverage" className="radio-button-label w-form-label">Event Coverage</span>
                                    </label>
                                    <label className="radio-button-field-11 w-radio">
                                      <input id="other-photo-service" type="radio" name="photo-service-type" data-name="photo service type" className="w-form-formradioinput radio-button-6 w-radio-input" value="other" />
                                      <span htmlFor="other-photo-service" className="radio-button-label w-form-label">Other</span>
                                    </label>
                                    <input className="text-filed-3 w-input" maxLength={256} name="photo-service-other-text" data-name="Photo Service Other Text" placeholder="Provide Details" type="text" id="photo-service-other-text" />
                                    
                                    <h1 className="dot_field_label">What is the primary purpose of this photo/video content?</h1>
                                    <textarea className="text-filed-3 w-input" maxLength={5000} name="project-purpose" data-name="Project Purpose" placeholder="" id="project-purpose"></textarea>
                                    
                                    <h1 className="dot_field_label">Where will the shooting take place? (studio, on-location, specific venue)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="shooting-location" data-name="Shooting Location" placeholder="" type="text" id="shooting-location" />
                                    
                                    <h1 className="dot_field_label">Estimated duration of the shoot/final video length</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="duration" data-name="Duration" placeholder="" type="text" id="duration" />
                                    
                                    <h1 className="dot_field_label">How many people will be involved in the shoot? (talent, staff, etc.)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="number-of-people" data-name="Number of People" placeholder="" type="text" id="number-of-people" />
                                    
                                    <h1 className="dot_field_label">Any special equipment or setup requirements?</h1>
                                    <textarea className="text-filed-3 w-input" maxLength={5000} name="equipment-needs" data-name="Equipment Needs" placeholder="" id="equipment-needs"></textarea>
                                    
                                    <h1 className="dot_field_label">Style preferences (e.g., candid, formal, creative, documentary)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="style-preferences" data-name="Style Preferences" placeholder="" type="text" id="style-preferences" />
                                    
                                    <h1 className="dot_field_label">Reference examples of photo/video styles you love</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="reference-examples" data-name="Reference Examples" placeholder="" type="text" id="reference-examples" />
                                    
                                    <h1 className="dot_field_label">Examples of styles you want to avoid</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="dislike-examples-photo" data-name="Dislike Examples Photo" placeholder="" type="text" id="dislike-examples-photo" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">4/6 Technical Requirements:</h1>
                                    <h1 className="dot_field_label">For video: required resolution and frame rate (e.g., 4K, 1080p, 60fps)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="video-resolution" data-name="Video Resolution" placeholder="" type="text" id="video-resolution" />
                                    
                                    <h1 className="dot_field_label">Audio requirements (voiceover, background music, ambient sound)</h1>
                                    <textarea className="text-filed-3 w-input" maxLength={5000} name="audio-requirements" data-name="Audio Requirements" placeholder="" id="audio-requirements"></textarea>
                                    
                                    <h1 className="dot_field_label">Editing style preferences (fast-paced, smooth transitions, minimal editing)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="editing-style" data-name="Editing Style" placeholder="" type="text" id="editing-style" />
                                    
                                    <h1 className="dot_field_label">Music/soundtrack preferences</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="music-preferences" data-name="Music Preferences" placeholder="" type="text" id="music-preferences" />
                                    
                                    <h1 className="dot_field_label">Branding elements to include (logo placement, colors, graphics)</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="branding-elements" data-name="Branding Elements" placeholder="" type="text" id="branding-elements" />
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">5/6 Logistics:</h1>
                                    <h1 className="dot_field_label">Preferred shooting dates or time constraints</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="preferred-dates" data-name="Preferred Dates" placeholder="" type="text" id="preferred-dates" />
                                    
                                    <h1 className="dot_field_label">Timeline for final delivery</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="timeline" data-name="Timeline" placeholder="" type="text" id="timeline" />
                                    
                                    <h1 className="dot_field_label">Any special requirements or considerations</h1>
                                    <textarea className="text-filed-3 w-input" maxLength={5000} name="special-requirements" data-name="Special Requirements" placeholder="" id="special-requirements"></textarea>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container-web w-container">
                                    <h1 className="dot_forms_title sites">6/6 General information about the project:</h1>
                                    <h1 className="dot_field_label">Project completion deadline</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="deadline-date-photo" data-name="Deadline Date Photo" placeholder="" type="text" id="deadline-date-photo" required />
                                    
                                    <h1 className="dot_field_label">Approximate Budget</h1>
                                    <input className="text-filed-3 w-input" maxLength={256} name="project-budjet-photo" data-name="Project Budjet Photo" placeholder="" type="text" id="project-budjet-photo" required />
                                    
                                    <div className="w-layout-blockcontainer form-container-web w-container">
                                      <button type="button" className="button-submit" onClick={async (e) => {
                                        e.preventDefault();
                                        const form = e.currentTarget.closest('form');
                                        if (form) {
                                          const formData = new FormData(form);
                                          const briefData: PhotoBriefData = {} as PhotoBriefData;
                                          for (const [key, value] of formData.entries()) {
                                            briefData[key] = value;
                                          }
                                          const leadData = {
                                            name: formData.get('name-3') as string,
                                            email: formData.get('email-3') as string
                                          };
                                          
                                          // Submit to API first and get briefId
                                          let briefId = null;
                                          try {
                                            const response = await fetch('/api/brief-submission', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                formType: 'photo',
                                                name: leadData.name,
                                                email: leadData.email,
                                                company: briefData['sphere-3'] || '',
                                                briefData
                                              })
                                            });
                                            if (response.ok) {
                                              const result = await response.json();
                                              briefId = result.briefId;
                                            }
                                          } catch (error) {
                                            console.error('Failed to submit to API:', error);
                                          }
                                          
                                          // Add briefId to briefData
                                          briefData.briefId = briefId;
                                          
                                          handleBriefSubmission('photo', leadData, briefData);
                                        }
                                      }}>Submit Brief</button>
                                    </div>
                                  </div>
                                </div>
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
              </div>
            </div>
            <div className="div-block-4"></div>
          </div>
        </div>
      </div>

      {/* Contact Link Section */}
      <section className="services-link-section">
        <div className="services-link-container">
          <Link href="/contact" className="dot-bottom-link hero animate-on-scroll">
            questions?<br />
            <span className="small-bottom-link-text-eng">we are here for you</span>
          </Link>
        </div>
      </section>

      <div className="global-styles-2 w-embed">
        <style dangerouslySetInnerHTML={{__html: `
          /* Form Field Styling - Based on Webflow CSS */
          .dot_field_label {
            color: #35332f;
            margin-top: 24px;
            margin-bottom: 12px;
            padding-left: 0;
            padding-right: 0;
            font-family: ff-real-text-pro-2, sans-serif;
            font-size: 1.1rem;
            font-weight: 500;
            line-height: 1.4;
            display: block;
            letter-spacing: 0.5px;
            text-align: left;
          }
          
          .text-field-3 {
            color: #35332f;
            width: 100%;
            max-width: 400px;
            height: 50px;
            margin-top: 8px;
            margin-bottom: 24px;
            padding: 14px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
            line-height: 1.4;
            border: 1px solid #ccc;
            border-radius: 0;
            background-color: #fff;
            transition: all 0.3s ease;
          }
          
          .text-field-3:focus {
            outline: none;
            border-color: var(--highlight-color);
            box-shadow: 0 0 0 3px rgba(218, 255, 0, 0.1);
            transform: translateY(-1px);
          }
          
          .text-filed-3 {
            color: #35332f;
            width: 100%;
            max-width: 500px;
            min-height: 50px;
            margin-top: 8px;
            margin-bottom: 24px;
            padding: 14px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 300;
            border: 1px solid #ccc;
            border-radius: 0;
            background-color: #fff;
            resize: vertical;
            transition: all 0.3s ease;
          }
          
          .text-filed-3:focus {
            outline: none;
            border-color: var(--highlight-color);
            box-shadow: 0 0 0 3px rgba(218, 255, 0, 0.1);
            transform: translateY(-1px);
          }
          
          .dot_forms_title.sites {
            color: #35332f;
            margin-top: 3rem;
            margin-bottom: 2rem;
            padding: 1rem 0;
            font-family: futura-pt, sans-serif;
            font-size: 1.6rem;
            font-weight: 500;
            line-height: 1.3;
            border-bottom: 2px solid var(--highlight-color);
            position: relative;
          }
          
          .dot_forms_title.sites::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 60px;
            height: 2px;
            background-color: var(--foreground);
          }
          
          .text-area-field-4 {
            color: #35332f;
            width: 100%;
            min-height: 120px;
            margin-top: 8px;
            margin-bottom: 32px;
            padding: 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
            line-height: 1.5;
            border: 1px solid #ccc;
            border-radius: 0;
            background-color: #fff;
            resize: vertical;
            transition: all 0.3s ease;
          }
          
          .text-area-field-4:focus {
            outline: none;
            border-color: var(--highlight-color);
            box-shadow: 0 0 0 3px rgba(218, 255, 0, 0.1);
            transform: translateY(-1px);
          }
          
          [class*="radio-button"]:not([class*="radio-button-label"]) {
            color: #35332f;
            margin-bottom: 20px;
            padding: 12px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
            line-height: 1.4;
            border: 1px solid #ccc;
            border-radius: 0;
            background-color: #fafafa;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: flex-start;
          }
          
          [class*="radio-button"]:not([class*="radio-button-label"]):hover {
            border-color: var(--highlight-color);
            background-color: #f5f5f5;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          
          [class*="radio-button"]:not([class*="radio-button-label"]) input[type="radio"] {
            margin-right: 12px;
            width: 18px;
            height: 18px;
            accent-color: var(--highlight-color);
            border: 1px solid #ccc;
            margin-top: 0;
            margin-bottom: 0;
            flex-shrink: 0;
          }
          
          /* Style .w-radio fields that don&apos;t have radio-button in their name */
          .w-radio {
            color: #35332f;
            margin-bottom: 20px;
            padding: 12px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
            line-height: 1.4;
            border: 1px solid #ccc;
            border-radius: 0;
            background-color: #fafafa;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: flex-start;
          }
          
          .w-radio:hover {
            border-color: var(--highlight-color);
            background-color: #f5f5f5;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          
          .w-radio input[type="radio"] {
            margin-right: 12px;
            width: 18px;
            height: 18px;
            accent-color: var(--highlight-color);
            border: 1px solid #ccc;
            margin-top: 0;
            margin-bottom: 0;
            flex-shrink: 0;
          }
          
          .radio-button-label,
          .checkbox-label {
            flex: 1;
            cursor: pointer;
            font-weight: 300;
          }
          
          .checkbox-field,
          [class*="checkbox"]:not([class*="checkbox-label"]) {
            color: #35332f;
            margin-bottom: 16px;
            padding: 12px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
            line-height: 1.4;
            border: 1px solid #ccc;
            border-radius: 0;
            background-color: #fafafa;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: flex-start;
          }
          
          .checkbox-field:hover,
          [class*="checkbox"]:not([class*="checkbox-label"]):hover {
            border-color: var(--highlight-color);
            background-color: #f5f5f5;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          
          .checkbox-field input[type="checkbox"],
          [class*="checkbox"]:not([class*="checkbox-label"]) input[type="checkbox"] {
            margin-right: 12px;
            width: 18px;
            height: 18px;
            accent-color: var(--highlight-color);
            border: 1px solid #ccc;
            margin-top: 0;
            margin-bottom: 0;
            flex-shrink: 0;
          }
          
          .w-button {
            display: inline-block;
            padding: 9px 15px;
            background-color: #3898EC;
            color: white;
            border: 0;
            line-height: inherit;
            text-decoration: none;
            cursor: pointer;
            border-radius: 0;
          }
          
          .button-submit {
            border: 1px solid #ccc;
            background-color: var(--background);
            box-shadow: 0 2px 5px 0 var(--highlight-color);
            color: var(--foreground);
            text-align: center;
            letter-spacing: 2px;
            text-transform: uppercase;
            border-radius: 0;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            padding: 1rem 4rem;
            margin-top: 4rem;
            margin-bottom: 6rem;
            font-family: futura-pt, sans-serif;
            font-size: 1.2rem;
            font-weight: 400;
            line-height: 18px;
            transition: all .4s cubic-bezier(.23, 1, .32, 1);
            display: inline-block;
            cursor: pointer;
          }
          
          .button-submit:hover {
            background-color: var(--foreground);
            box-shadow: 2px 9px 20px 2px var(--highlight-color);
            color: var(--background);
            -webkit-text-stroke-color: var(--foreground);
            transform: scale(.9);
          }
          
          .button-submit:active {
            color: var(--foreground);
          }
          
          .w-form-done {
            background-color: #daff00;
            color: var(--foreground);
            padding: 20px;
            margin-top: 20px;
            border-radius: 4px;
            font-family: futura-pt, sans-serif;
            font-size: 1.2rem;
            text-align: center;
          }
          
          .w-form-fail {
            background-color: #ff6b6b;
            color: white;
            padding: 20px;
            margin-top: 20px;
            border-radius: 4px;
            font-family: futura-pt, sans-serif;
            font-size: 1.2rem;
            text-align: center;
          }
          
          /* Form Container Styling */
          .form-container {
            padding: 2rem;
            margin-bottom: 2rem;
          }
          
          .form-container-web {
            padding: 2rem 2rem 2rem 0;
            margin-top: 1rem;
          }
          
          /* Responsive Design */
          @media (min-width: 769px) and (max-width: 1024px) {
            .text-filed-3,
            .text-filed-3.w-input {
              min-height: 50px;
            }
          }
          
          @media (max-width: 768px) {
            .text-field-3 {
              width: 100%;
              max-width: none;
              font-size: 1rem;
            }
            
            .text-filed-3 {
              width: 100%;
              max-width: none;
              font-size: 1rem;
              min-height: 40px;
              font-weight: 300;
            }
            
            .text-area-field-4 {
              font-size: 1rem;
            }
            
            .dot_field_label {
              font-size: 1rem;
            }
            
            .dot_forms_title.sites {
              font-size: 1.4rem;
              text-align: left;
            }
            
            .radio-button-label,
            .checkbox-label {
              text-align: left;
            }
            
            .form-container,
            .form-container-web {
              padding: 1.5rem;
              margin-bottom: 1.5rem;
            }
            
            .radio-button-field,
            .checkbox-field,
            [class*="radio-button"]:not([class*="radio-button-label"]),
            [class*="checkbox"]:not([class*="checkbox-label"]),
            .w-radio {
              padding: 10px 12px;
              font-size: 1rem;
            }
            
            .button-submit {
              font-size: 1rem;
              padding: 0.8rem 2rem;
              margin-top: 2rem;
              margin-bottom: 4rem;
              display: block;
              width: 100%;
            }
          }
          
          /* Lead Capture Modal Styles */
          .lead-capture-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .lead-capture-modal {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            max-width: 600px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
          }
          
          .lead-capture-close {
            position: absolute;
            top: 15px;
            right: 20px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
          }
          
          .lead-capture-close:hover {
            color: #000;
          }
          
          .lead-capture-title {
            margin: 0 0 20px 0;
            color: #35332f;
            font-family: futura-pt, sans-serif;
            font-size: 1.8rem;
            font-weight: 400;
          }
          
          .lead-capture-subtitle {
            margin: 0 0 30px 0;
            color: #666;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 300;
            line-height: 1.4;
          }
          
          .lead-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          
          .lead-form-group {
            display: flex;
            flex-direction: column;
          }
          
          .lead-form-label {
            margin-bottom: 8px;
            color: #35332f;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
          }
          
          .lead-form-input {
            padding: 12px 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: futura-pt, sans-serif;
            font-size: 1rem;
            transition: border-color 0.3s ease;
          }
          
          .lead-form-input:focus {
            outline: none;
            border-color: #daff00;
          }
          
          .lead-form-button {
            padding: 15px 30px;
            background-color: #35332f;
            color: white;
            border: none;
            border-radius: 4px;
            font-family: futura-pt, sans-serif;
            font-size: 1.1rem;
            font-weight: 400;
            cursor: pointer;
            transition: background-color 0.3s ease;
          }
          
          .lead-form-button:hover {
            background-color: #daff00;
            color: #35332f;
          }
          
          .lead-form-button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
          }
          
          /* Mobile Responsive */
          @media (max-width: 768px) {
            .lead-capture-modal {
              padding: 30px 20px;
              width: 95%;
            }
            
            .lead-form-modal {
              padding: 20px;
              width: 95%;
            }
          }
        `}} />
      </div>

      {/* Footer */}
      <Footer />
    </div>

    </>
  );
}