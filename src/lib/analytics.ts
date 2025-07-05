// Google Analytics 4 Event Tracking Utilities
// This file provides type-safe event tracking for GA4

declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js',
      targetId: string | Date,
      config?: Record<string, any>
    ) => void;
  }
}

// Check if gtag is available
const isGtagAvailable = (): boolean => {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
};

// Generic event tracking function
export const trackEvent = (
  eventName: string,
  parameters?: Record<string, any>
) => {
  if (!isGtagAvailable()) {
    console.warn('Google Analytics not loaded');
    return;
  }

  try {
    window.gtag('event', eventName, {
      send_to: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      ...parameters,
    });
    
    // Log in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('GA Event:', eventName, parameters);
    }
  } catch (error) {
    console.error('Error tracking event:', error);
  }
};

// Lead Generation Events
export const trackLeadGeneration = {
  // Calculator Events
  calculatorStart: (formType: string) => {
    trackEvent('calculator_start', {
      event_category: 'Lead Generation',
      event_label: formType,
      form_type: formType,
    });
  },

  calculatorStep: (formType: string, step: number, stepName: string) => {
    trackEvent('calculator_step', {
      event_category: 'Lead Generation',
      event_label: `${formType} - Step ${step}`,
      form_type: formType,
      step_number: step,
      step_name: stepName,
    });
  },

  calculatorComplete: (formType: string, estimatedValue: number) => {
    trackEvent('calculator_complete', {
      event_category: 'Lead Generation',
      event_label: formType,
      form_type: formType,
      estimated_value: estimatedValue,
      value: estimatedValue, // For GA4 enhanced ecommerce
    });
  },

  // Lead Capture Events
  leadCapture: (
    action: 'pdf_download' | 'email_sent' | 'contact_request',
    formType: string,
    estimatedValue?: number
  ) => {
    trackEvent('generate_lead', {
      event_category: 'Lead Generation',
      event_label: `${action} - ${formType}`,
      action_type: action,
      form_type: formType,
      value: estimatedValue || 0,
    });
  },

  // Brief Submission
  briefSubmission: (formType: string, actionType: string) => {
    trackEvent('brief_submission', {
      event_category: 'Lead Generation',
      event_label: `${formType} - ${actionType}`,
      form_type: formType,
      action_type: actionType,
    });
  },

  // Contact Form
  contactFormSubmit: (source: string) => {
    trackEvent('contact_form_submit', {
      event_category: 'Lead Generation',
      event_label: source,
      form_source: source,
    });
  },
};

// Portfolio & Project Events
export const trackPortfolio = {
  // Project Views
  projectView: (projectSlug: string, projectTitle: string) => {
    trackEvent('project_view', {
      event_category: 'Portfolio',
      event_label: projectTitle,
      project_slug: projectSlug,
      project_title: projectTitle,
    });
  },

  // Project Navigation
  projectNavigation: (fromProject: string, toProject: string) => {
    trackEvent('project_navigation', {
      event_category: 'Portfolio',
      event_label: `${fromProject} -> ${toProject}`,
      from_project: fromProject,
      to_project: toProject,
    });
  },

  // Portfolio Grid Interactions
  portfolioFilter: (category: string) => {
    trackEvent('portfolio_filter', {
      event_category: 'Portfolio',
      event_label: category,
      filter_category: category,
    });
  },
};

// Blog & Content Events
export const trackContent = {
  // Blog Post Views
  blogPostView: (postSlug: string, postTitle: string, category: string) => {
    trackEvent('blog_post_view', {
      event_category: 'Content',
      event_label: postTitle,
      post_slug: postSlug,
      post_title: postTitle,
      post_category: category,
    });
  },

  // Blog Engagement
  blogReadTime: (postSlug: string, timeSpent: number) => {
    trackEvent('blog_engagement', {
      event_category: 'Content',
      event_label: postSlug,
      post_slug: postSlug,
      time_spent: timeSpent,
    });
  },

  // Blog Category Filter
  blogCategoryFilter: (category: string) => {
    trackEvent('blog_category_filter', {
      event_category: 'Content',
      event_label: category,
      blog_category: category,
    });
  },
};

// Navigation & CTA Events
export const trackNavigation = {
  // CTA Clicks
  ctaClick: (ctaText: string, location: string, destination: string) => {
    trackEvent('cta_click', {
      event_category: 'Navigation',
      event_label: `${ctaText} - ${location}`,
      cta_text: ctaText,
      cta_location: location,
      destination: destination,
    });
  },

  // Menu Navigation
  menuClick: (menuItem: string, destination: string) => {
    trackEvent('menu_click', {
      event_category: 'Navigation',
      event_label: menuItem,
      menu_item: menuItem,
      destination: destination,
    });
  },

  // External Link Clicks
  externalLinkClick: (url: string, linkText: string) => {
    trackEvent('external_link_click', {
      event_category: 'Navigation',
      event_label: linkText,
      external_url: url,
      link_text: linkText,
    });
  },
};

// Service & Business Events
export const trackBusiness = {
  // Service Page Views
  serviceView: (serviceName: string) => {
    trackEvent('service_view', {
      event_category: 'Services',
      event_label: serviceName,
      service_name: serviceName,
    });
  },

  // Quote Requests
  quoteRequest: (service: string, source: string) => {
    trackEvent('quote_request', {
      event_category: 'Services',
      event_label: `${service} - ${source}`,
      service_type: service,
      request_source: source,
    });
  },

  // Calendar/Consultation Booking
  consultationRequest: (service: string, method: string) => {
    trackEvent('consultation_request', {
      event_category: 'Services',
      event_label: `${service} - ${method}`,
      service_type: service,
      booking_method: method,
    });
  },
};

// Conversion Events (GA4 Enhanced Ecommerce)
export const trackConversions = {
  // Lead Scored (when lead reaches certain score threshold)
  leadQualified: (leadScore: number, formType: string) => {
    trackEvent('lead_qualified', {
      event_category: 'Conversions',
      event_label: formType,
      lead_score: leadScore,
      form_type: formType,
      value: leadScore * 10, // Assign value based on lead score
    });
  },

  // High-Value Lead (budget > $15k)
  highValueLead: (budget: string, formType: string) => {
    trackEvent('high_value_lead', {
      event_category: 'Conversions',
      event_label: `${formType} - ${budget}`,
      budget_range: budget,
      form_type: formType,
      value: 100, // High value for these leads
    });
  },
};

// Utility Functions
export const trackPageView = (pagePath: string, pageTitle: string) => {
  if (!isGtagAvailable()) return;

  window.gtag('config', process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!, {
    page_path: pagePath,
    page_title: pageTitle,
  });
};

// Scroll Tracking
export const trackScrollDepth = (depth: number, page: string) => {
  trackEvent('scroll_depth', {
    event_category: 'User Engagement',
    event_label: `${page} - ${depth}%`,
    page: page,
    scroll_depth: depth,
  });
};