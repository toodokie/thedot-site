'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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


export default function EfficiencyBrief() {
  const [connectionScore, setConnectionScore] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

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
    
    const resultUrl = `/brief/results?data=${briefDataEncoded}`;
    
    // Try to open in new tab/window
    const newWindow = window.open(resultUrl, '_blank');
    
    if (newWindow) {
      newWindow.focus();
    } else {
      // If popup was blocked (common on Safari mobile), navigate to the page
      console.warn('Popup blocked, navigating to results page');
      window.location.href = resultUrl;
    }
  };


  return (
    <>
      <div className="dot_body">
      <style jsx>{`
        .efficiency-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background-color: #f8f9fa;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .hero-with-header-margin {
          margin-top: 15rem;
        }
        .dot_h1_pages {
          line-height: 1.1 !important;
        }
        @media (width <= 768px) {
          .dot_h1_pages {
            color: var(--foreground);
            text-transform: none;
            text-align: center;
            font-size: 3rem;
          }
        }
        .section-main._14vw {
          background: var(--background);
          padding: 4rem 0;
        }
        .slider-wrapper {
          display: flex;
          align-items: center;
          gap: 20px;
          margin: 15px 0;
        }
        .connection-slider {
          flex: 1;
          height: 8px;
          -webkit-appearance: none;
          background: #fff;
          border: 1px solid var(--foreground);
          border-radius: 100px;
          outline: none;
        }
        .connection-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px;
          height: 24px;
          background: var(--foreground);
          border-radius: 50%;
          cursor: pointer;
        }
        .connection-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          background: var(--foreground);
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
        .slider-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--foreground);
          min-width: 40px;
          text-align: center;
        }
        .slider-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 0.875rem;
          color: #718096;
        }
        .submit-button-wrapper {
          margin: 4rem 0;
          text-align: left;
        }
        .services-header {
          padding-bottom: 4rem;
        }
        .section-description + .section-description {
          margin-top: 1.5rem !important;
        }
        @media (max-width: 1200px) {
          .services-header {
            padding-bottom: 1.2rem;
          }
        }
      `}</style>
      <header className="efficiency-header">
        <Link href="/" className="logo-link">
          <Image
            src="/images/logo.png"
            alt="The Dot Creative Agency"
            width={90}
            height={56}
            className="logo-image"
            priority
          />
        </Link>
        <Link href="/" className="services-cta-button">
          Visit Our Website
        </Link>
      </header>
      <a id="back_link" href="#" className="back-link w-inline-block"></a>
      <section className="hero-title-copy-services estimate hero-with-header-margin">
        <div className="div-block-184">
          <div className="div-block-183">
            <div className="div-block-178-services">
              <div className="w-layout-blockcontainer graphic-title-wrap-copy-services w-container">
                <div className="graphic-copy-services">
                  <h1 className="dot_h1_pages">Get Your Free Business &amp;&nbsp;Website Efficiency Assessment</h1>
                  <div className="hero-circle-video-copy-mobile">
                    <video 
                      className="background-video-copy"
                      autoPlay 
                      muted 
                      loop 
                      playsInline
                    >
                      <source src="/video/hero-video-min.mp4" type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
              </div>
              <div className="w-layout-blockcontainer graphic-copy-services-subheader w-container">
                <div className="graphic-copy-services-copy">
                  <h2 className="dot_h2_subheader">Stop guessing. This 10-minute brief is the first step to pinpointing the exact issues on your website and in your workflow that are costing you time and money.</h2>
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
                <source src="/video/hero-video-min.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      <div className="section-main _14vw">
        <div className="container about-title brief">
          <div className="max-width-xlarge align-center">
            <div className="services-header">
              <h2 className="services-features-title">The Efficiency Brief</h2>
              <p className="section-description">
                We know you're busy. That is why it is <strong>not a typical contact form!</strong> (The detailed questions below are designed to replace a 45-minute discovery call).
              </p>
              <p className="section-description">
                Based on your answers, we will create a personalized video audit with <strong>actionable recommendations, completely free.</strong> The more detail you provide, the more value you will receive.
              </p>
            </div>
            <div className="services-tabs">
              <div className="tab-content-decorative-lines">
                <div className="decorative-line-yellow"></div>
                <div className="decorative-line-black"></div>
              </div>
              <div className="services-tabs-content">
                  <div className="services-tab-content">
                    <div className="tabs_content-wrapper-service">
                      <div className="max-width-full">
                        <div className="w-layout-grid tabs-layout_component">
                          <div className="tabs-layout_content">
                            {isSubmitted ? (
                              <div style={{
                                background: 'var(--highlight-color)',
                                padding: '3rem 2rem',
                                textAlign: 'center',
                                borderRadius: '8px',
                                margin: '2rem 0'
                              }}>
                                <h2 style={{
                                  color: 'var(--foreground)',
                                  fontSize: '2.5rem',
                                  fontWeight: 300,
                                  marginBottom: '1rem',
                                  fontFamily: 'futura-pt, sans-serif'
                                }}>Thank You!</h2>
                                <p style={{
                                  color: 'var(--foreground)',
                                  fontSize: '1.2rem',
                                  fontWeight: 300,
                                  marginBottom: '1.5rem',
                                  fontFamily: 'futura-pt, sans-serif'
                                }}>
                                  Your efficiency assessment has been submitted successfully.
                                </p>
                                <p style={{
                                  color: 'var(--foreground)',
                                  fontSize: '1rem',
                                  fontWeight: 300,
                                  fontFamily: 'futura-pt, sans-serif'
                                }}>
                                  We'll review your submission and get back to you within 24-48 hours with your free personalized video audit.
                                </p>
                                <div style={{ marginTop: '2rem' }}>
                                  <a 
                                    href="/" 
                                    style={{
                                      display: 'inline-block',
                                      padding: '12px 24px',
                                      background: 'var(--foreground)',
                                      color: 'white',
                                      textDecoration: 'none',
                                      borderRadius: '4px',
                                      fontFamily: 'futura-pt, sans-serif',
                                      fontWeight: 400
                                    }}
                                  >
                                    Return to Homepage
                                  </a>
                                </div>
                              </div>
                            ) : (
                            <div className="tabs-layout_component w-form">
                              <form 
                                id="wf-form-Efficiency-Form" 
                                name="wf-form-Efficiency-Form" 
                                data-name="Efficiency Form" 
                                className="website-form" 
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  setIsSubmitting(true);
                                  
                                  const form = e.currentTarget;
                                  const formData = new FormData(form);
                                  
                                  const data = {
                                    companyName: formData.get('companyName'),
                                    contactName: formData.get('contactName'),
                                    contactEmail: formData.get('contactEmail'),
                                    role: formData.get('role'),
                                    websiteUrl: formData.get('websiteUrl'),
                                    industry: formData.get('industry'),
                                    servicesProducts: formData.get('servicesProducts'),
                                    websiteGoal: formData.get('websiteGoal'),
                                    biggestFrustration: formData.get('biggestFrustration'),
                                    aodaAware: formData.get('aodaAware'),
                                    softwareAudit: formData.get('softwareAudit'),
                                    connectionScore: formData.get('connectionScore'),
                                    leadFlow: formData.get('leadFlow'),
                                    competitors: formData.get('competitors'),
                                  };

                                  try {
                                    const response = await fetch('/api/efficiency-brief', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify(data)
                                    });

                                    if (response.ok) {
                                      setIsSubmitted(true);
                                      // Scroll to top to show success message
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    } else {
                                      alert('Something went wrong. Please try again.');
                                    }
                                  } catch (error) {
                                    console.error('Error submitting form:', error);
                                    alert('Something went wrong. Please try again.');
                                  } finally {
                                    setIsSubmitting(false);
                                  }
                                }}>
                                <div className="w-layout-blockcontainer form-container-web-section w-container">
                                  
                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h2 className="dot_forms_title sites">Section 1: About Your Business</h2>
                                    <label htmlFor="companyName" className="dot_field_label">Company Name:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="companyName" data-name="Company Name" placeholder="" type="text" id="companyName" required />
                                    <label htmlFor="contactName" className="dot_field_label">Your Name:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="contactName" data-name="Contact Name" placeholder="" type="text" id="contactName" required />
                                    <label htmlFor="contactEmail" className="dot_field_label">Your Email:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="contactEmail" data-name="Contact Email" placeholder="" type="email" id="contactEmail" required />
                                    <label htmlFor="role" className="dot_field_label">Your Role:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="role" data-name="Role" placeholder="" type="text" id="role" required />
                                    <label htmlFor="websiteUrl" className="dot_field_label">Website URL:</label>
                                    <input className="text-field-3 w-input" maxLength={256} name="websiteUrl" data-name="Website URL" placeholder="https://" type="url" id="websiteUrl" />
                                    <label htmlFor="industry" className="dot_field_label">Industry:</label>
                                    <select className="text-field-3 w-input" name="industry" id="industry" required>
                                      <option value="">Select an industry</option>
                                      <option value="Construction/Trades">Construction/Trades</option>
                                      <option value="Professional Services">Professional Services</option>
                                      <option value="E-commerce">E-commerce</option>
                                      <option value="Healthcare">Healthcare</option>
                                      <option value="Other">Other</option>
                                    </select>
                                    <label htmlFor="servicesProducts" className="dot_field_label">Briefly, what are the primary services or products you sell?</label>
                                    <textarea id="servicesProducts" name="servicesProducts" maxLength={5000} data-name="Services Products" placeholder="" className="text-filed-3 w-input" required></textarea>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h2 className="dot_forms_title sites">Section 2: Your Goals & Challenges (The "Why")</h2>
                                    
                                    <label htmlFor="websiteGoal" className="dot_field_label">What is the #1 goal you have for your website right now?</label>
                                    <select className="text-field-3 w-input" name="websiteGoal" id="websiteGoal" required>
                                      <option value="">Select a goal</option>
                                      <option value="Get More Leads/Clients">Get More Leads/Clients</option>
                                      <option value="Improve Brand Image">Improve Brand Image</option>
                                      <option value="Sell Products Online">Sell Products Online</option>
                                      <option value="Provide Information">Provide Information</option>
                                    </select>

                                    <label htmlFor="biggestFrustration" className="dot_field_label">What is your single biggest frustration with your business's day-to-day operations?</label>
                                    <textarea id="biggestFrustration" name="biggestFrustration" maxLength={5000} data-name="Biggest Frustration" placeholder="" className="text-filed-3 w-input" required></textarea>

                                    <div className="dot_field_label">Are you familiar with Ontario's AODA accessibility requirements for business websites?</div>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="aodaAware" className="w-form-formradioinput radio-button w-radio-input" value="Yes" required />
                                      <span className="radio-button-label w-form-label">Yes</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="aodaAware" className="w-form-formradioinput radio-button w-radio-input" value="No" />
                                      <span className="radio-button-label w-form-label">No</span>
                                    </label>
                                    <label className="radio-button-field w-radio">
                                      <input type="radio" name="aodaAware" className="w-form-formradioinput radio-button w-radio-input" value="Unsure" />
                                      <span className="radio-button-label w-form-label">Unsure</span>
                                    </label>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h2 className="dot_forms_title sites">Section 3: Your Business Systems (The "How")</h2>
                                    
                                    <label htmlFor="softwareAudit" className="dot_field_label">
                                      Software Audit: Please list all the business software you currently pay for 
                                      (e.g., QuickBooks for accounting, a CRM for clients, Mailchimp for newsletters, 
                                      Calendly for scheduling).
                                    </label>
                                    <textarea id="softwareAudit" name="softwareAudit" maxLength={5000} data-name="Software Audit" placeholder="" className="text-filed-3 w-input" required></textarea>

                                    <label htmlFor="connectionScore" className="dot_field_label">
                                      The "Connection" Problem: On a scale of 1-10 (where 1 is "they don't talk at all" 
                                      and 10 is "perfectly synced"), how well do these tools work together?
                                    </label>
                                    <div className="slider-wrapper">
                                      <input
                                        type="range"
                                        id="connectionScore"
                                        name="connectionScore"
                                        min="1"
                                        max="10"
                                        value={connectionScore}
                                        onChange={(e) => setConnectionScore(Number(e.target.value))}
                                        className="connection-slider"
                                      />
                                      <span className="slider-value">{connectionScore}</span>
                                    </div>
                                    <div className="slider-labels">
                                      <span>1 - Don't talk at all</span>
                                      <span>10 - Perfectly synced</span>
                                    </div>

                                    <label htmlFor="leadFlow" className="dot_field_label">
                                      Lead Flow: When a new lead fills out a form on your website, what is the exact 
                                      step-by-step process your team follows to handle it? Please be specific.
                                    </label>
                                    <textarea id="leadFlow" name="leadFlow" maxLength={5000} data-name="Lead Flow" placeholder="" className="text-filed-3 w-input" required></textarea>
                                  </div>

                                  <div className="w-layout-blockcontainer form-container w-container">
                                    <h2 className="dot_forms_title sites">Section 4: Your Competitors</h2>
                                    
                                    <label htmlFor="competitors" className="dot_field_label">
                                      Please list 1-2 of your main competitors. What do you admire or dislike about 
                                      their websites?
                                    </label>
                                    <textarea id="competitors" name="competitors" maxLength={5000} data-name="Competitors" placeholder="" className="text-filed-3 w-input" required></textarea>
                                  </div>

                                  <div className="submit-button-wrapper">
                                    <input 
                                      type="submit" 
                                      value={isSubmitting ? "SUBMITTING..." : "SUBMIT FOR YOUR FREE VIDEO AUDIT"} 
                                      data-wait="Please wait..." 
                                      className="services-cta-button"
                                      disabled={isSubmitting}
                                      style={{
                                        opacity: isSubmitting ? 0.7 : 1,
                                        cursor: isSubmitting ? 'not-allowed' : 'pointer'
                                      }}
                                    />
                                  </div>
                                </div>
                              </form>
                            </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
            <div className="div-block-4"></div>
          </div>
        </div>
      </div>

      <div className="global-styles-2 w-embed">
        <style dangerouslySetInnerHTML={{__html: `
          /* Form Field Styling - Based on Webflow CSS */
          .dot_field_label {
            color: var(--foreground);
            margin-top: 24px;
            margin-bottom: 12px;
            padding-left: 0;
            padding-right: 0;
            font-family: ff-real-text-pro, sans-serif;
            font-size: 1.2rem;
            font-weight: 200;
            line-height: 1.4;
            display: block;
            letter-spacing: 0.5px;
            text-align: left;
          }
          
          .text-field-3 {
            color: var(--foreground);
            width: 100%;
            max-width: 400px;
            height: 60px;
            margin-top: 8px;
            margin-bottom: 24px;
            padding: 14px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.4rem;
            font-weight: 300;
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
            color: var(--foreground);
            width: 100%;
            max-width: 500px;
            min-height: 50px;
            margin-top: 8px;
            margin-bottom: 24px;
            padding: 14px 16px;
            font-family: futura-pt, sans-serif;
            font-size: 1.4rem;
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
          
          /* Select dropdown styling */
          select.text-field-3 {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 16px center;
            background-size: 16px;
            padding-right: 48px;
            cursor: pointer;
          }
          
          select.text-field-3:focus {
            outline: none;
            border-color: var(--highlight-color);
            box-shadow: 0 0 0 3px rgba(218, 255, 0, 0.1);
            transform: translateY(-1px);
          }
          
          /* Form validation styling - replace orange with yellow */
          .text-field-3:invalid {
            border-color: var(--highlight-color) !important;
            box-shadow: 0 0 0 2px rgba(218, 255, 0, 0.3) !important;
          }
          
          .text-filed-3:invalid {
            border-color: var(--highlight-color) !important;
            box-shadow: 0 0 0 2px rgba(218, 255, 0, 0.3) !important;
          }
          
          select.text-field-3:invalid {
            border-color: var(--highlight-color) !important;
            box-shadow: 0 0 0 2px rgba(218, 255, 0, 0.3) !important;
          }
          
          /* Radio button styling - match brief page */
          .radio-button-field.w-radio {
            color: var(--foreground);
            margin-bottom: 15px;
            font-family: futura-pt, sans-serif;
            font-size: 1.125rem;
            font-weight: 300;
            line-height: 1.3;
            display: flex;
            align-items: center;
            cursor: pointer;
          }
          
          .radio-button-field.w-radio input[type="radio"] {
            margin-right: 10px;
            cursor: pointer;
          }
          
          .radio-button-label.w-form-label {
            color: var(--foreground);
            font-family: futura-pt, sans-serif;
            font-size: 1.125rem;
            font-weight: 300;
            line-height: 1.3;
            cursor: pointer;
            margin: 0;
          }
          
          @media (max-width: 768px) {
            /* Reduce excessive padding on mobile */
            .form-container.w-container,
            .form-container-web-section.w-container {
              padding-left: 10px !important;
              padding-right: 10px !important;
            }
            
            /* Ensure form fields fit properly */
            .text-field-3 {
              width: 100% !important;
              max-width: none !important;
              height: 50px !important;
              font-size: 1rem;
              box-sizing: border-box !important;
              margin-left: 0 !important;
              margin-right: 0 !important;
            }
            
            .text-filed-3 {
              width: 100% !important;
              max-width: none !important;
              font-size: 1rem;
              min-height: 40px;
              font-weight: 300;
              box-sizing: border-box !important;
              margin-left: 0 !important;
              margin-right: 0 !important;
            }
            
            /* Ensure all form containers don't overflow */
            .website-form,
            .tabs-layout_component,
            .tabs_content-wrapper-service,
            .max-width-full {
              width: 100% !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              overflow-x: hidden !important;
            }
            
            /* Fix slider on mobile */
            .slider-wrapper {
              flex-direction: column;
              gap: 10px;
              align-items: stretch;
            }
            
            .connection-slider {
              width: 100% !important;
            }
          }
        `}} />
      </div>

      <Footer />
      </div>
    </>
  );
}
