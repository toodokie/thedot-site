import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, isBot } from '../../../lib/input-sanitization';

export async function POST(request: NextRequest) {
  try {
    console.log('PDF generation request received');
    
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 5, window: 10 * 60 * 1000 }); // 5 requests per 10 minutes
    
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for PDF generation, IP:', clientIP);
      return NextResponse.json(
        { 
          error: 'Too many PDF requests. Please try again later.',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    console.log('Parsing request body...');
    const { estimateData, leadData, website } = await request.json();
    console.log('Request data parsed successfully', { estimateData, leadData, website });

    // Check honeypot field (bot detection)
    if (isBot(website)) {
      console.warn('Bot detected via honeypot field for PDF generation, IP:', clientIP);
      return NextResponse.json(
        { error: 'Invalid submission' },
        { status: 400 }
      );
    }

    // Validate email if provided
    if (leadData?.email) {
      const emailValidation = validateEmail(leadData.email);
      if (!emailValidation.isValid) {
        console.error('Invalid email for PDF generation:', emailValidation.errors);
        return NextResponse.json(
          { error: 'Invalid email address', details: emailValidation.errors },
          { status: 400 }
        );
      }
    }

    // Create a simple HTML template for PDF conversion
    const serviceType = estimateData.formType === 'website' ? 'Website Development' :
                       estimateData.formType === 'design' ? 'Graphic Design' :
                       'Photo & Video Production';

    // Get logo base64 first
    console.log('Getting logo base64...');
    const logoBase64 = await getLogoBase64();
    console.log('Logo base64 loaded, length:', logoBase64.length);

    console.log('Generating HTML content...');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Project Estimate - ${serviceType}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #35332f;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          
          .header {
            border-bottom: 1px solid #35332f;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .logo {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }
          
          .company-info {
            text-align: right;
            font-size: 14px;
            color: #666;
          }
          
          .title {
            font-size: 32px;
            text-align: center;
            margin: 30px 0;
            color: #35332f;
          }
          
          .project-details {
            background: #f9f9f9;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid #ddd;
          }
          
          .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
          }
          
          .detail-label {
            font-weight: bold;
            color: #35332f;
          }
          
          .price-section {
            background: #f9f9f9;
            color: #35332f;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 1px solid #35332f;
          }
          
          .total-amount {
            font-size: 36px;
            font-weight: bold;
            margin: 10px 0;
          }
          
          .section {
            margin: 30px 0;
          }
          
          .section-title {
            font-size: 20px;
            font-weight: bold;
            color: #35332f;
            margin-bottom: 15px;
            background: #daff00;
            padding: 10px;
          }
          
          .base-deliverables {
            background: #faf9f6;
            padding: 20px;
            margin: 15px 0;
          }
          
          .deliverable-item {
            margin: 8px 0;
            padding-left: 20px;
            position: relative;
          }
          
          .deliverable-item:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #daff00;
            font-weight: bold;
          }
          
          .footer {
            border-top: 1px solid #35332f;
            padding-top: 20px;
            text-align: center;
            margin-top: 50px;
            color: #666;
          }
          
          .contact-info {
            background: #faf9f6;
            padding: 20px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">
            <img src="data:image/png;base64,${logoBase64}" alt="The Dot Creative" style="height: 50px; width: auto;" />
          </div>
          <div class="company-info">
            <div>Ontario, Canada</div>
            <div>+1 (647) 402-4420</div>
            <div>info@thedotcreative.co</div>
          </div>
        </div>
        
        <div class="title">${serviceType} Project Estimate</div>
        
        <div class="project-details">
          <div class="detail-row">
            <span class="detail-label">Client Name:</span>
            <span>${leadData.name}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Company:</span>
            <span>${leadData.company || 'N/A'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email:</span>
            <span>${leadData.email}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Estimate Date:</span>
            <span>${new Date().toLocaleDateString()}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Valid Until:</span>
            <span>${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</span>
          </div>
        </div>
        
        ${getProjectSpecifications(estimateData)}
        
        <div class="price-section">
          <div>Total Project Investment</div>
          <div class="total-amount">CAD $${Number(estimateData.total || 0).toLocaleString('en-CA')}</div>
          <div>This estimate is valid for 30 days</div>
        </div>
        
        <div class="section">
          <div class="section-title">What's Included in Your Quote</div>
          <div class="base-deliverables">
            ${getBaseDeliverables(estimateData.formType).map(item => 
              `<div class="deliverable-item">${item}</div>`
            ).join('')}
          </div>
        </div>
        
        ${getSelectedFeatures(estimateData)}
        
        <div class="contact-info">
          <div class="section-title" style="background: none; padding: 0; margin-bottom: 10px;">Next Steps</div>
          <p>Ready to get started? Contact us to discuss your project timeline and requirements.</p>
          <p><strong>Email:</strong> info@thedotcreative.co | <strong>Phone:</strong> +1 (647) 402-4420</p>
          <p>This estimate includes all items listed above and is valid for 30 days.</p>
        </div>
        
        <div class="footer">
          <strong>The Dot Creative Agency</strong><br>
          Ontario, Canada | www.thedotcreative.co<br>
          Professional ${serviceType} Services
        </div>
      </body>
      </html>
    `;

    // Return HTML content that can be converted to PDF by the browser
    console.log('HTML content generated, returning response...');
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="estimate-${serviceType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.html"`,
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate estimate document' },
      { status: 500 }
    );
  }
}

interface EstimateData {
  formType: string;
  selections?: {
    pageCount?: string;
    websiteType?: string;
    services?: string[];
    service?: string;
  };
}

function getProjectSpecifications(estimateData: EstimateData): string {
  try {
    if (!estimateData.selections) return '';
    
    const { formType, selections } = estimateData;
  
  if (formType === 'website' && selections.pageCount) {
    return `
      <div class="section">
        <div class="section-title">Project Specifications</div>
        <div class="base-deliverables">
          <div class="deliverable-item"><strong>Website Scope: ${selections.pageCount}</strong></div>
          ${selections.websiteType === 'website-type-ecommerce' ? 
            '<div class="deliverable-item"><strong>E-Commerce functionality included</strong></div>' : ''}
        </div>
      </div>
    `;
  }
  
  if (formType === 'design' && selections.services?.length) {
    return `
      <div class="section">
        <div class="section-title">Project Specifications</div>
        <div class="base-deliverables">
          <div class="deliverable-item"><strong>Design Services: ${selections.services.length} service(s) selected</strong></div>
        </div>
      </div>
    `;
  }
  
  if (formType === 'photo' && selections.service) {
    return `
      <div class="section">
        <div class="section-title">Project Specifications</div>
        <div class="base-deliverables">
          <div class="deliverable-item"><strong>Service Type: ${selections.service.replace('photo-service-', '').replace('-', ' ')}</strong></div>
        </div>
      </div>
    `;
  }
  
  return '';
  } catch (error) {
    console.error('Error in getProjectSpecifications:', error);
    return '';
  }
}

function getSelectedFeatures(estimateData: EstimateData): string {
  if (!estimateData.selections) return '';
  
  const { formType, selections } = estimateData;
  let featuresHtml = '';
  
  if (formType === 'website' && selections.features?.length) {
    const featureDescriptions = getWebsiteFeatureDescriptions();
    const selectedFeatures = selections.features.map(feature => {
      const featureName = feature.replace('feature-', '');
      return featureDescriptions[featureName] || featureName.replace('-', ' ');
    });
    
    if (selectedFeatures.length > 0) {
      featuresHtml = `
        <div class="section">
          <div class="section-title">Additional Features Selected</div>
          <div class="base-deliverables">
            ${selectedFeatures.map(feature => 
              `<div class="deliverable-item">${feature}</div>`
            ).join('')}
          </div>
        </div>
      `;
    }
  }
  
  if (formType === 'design' && selections.services?.length) {
    const serviceDescriptions = getDesignServiceDescriptions();
    const selectedServices = selections.services.map(service => {
      const serviceName = service.replace('design-service-', '');
      return serviceDescriptions[serviceName] || serviceName.replace('-', ' ');
    });
    
    if (selectedServices.length > 0) {
      featuresHtml = `
        <div class="section">
          <div class="section-title">Design Services Selected</div>
          <div class="base-deliverables">
            ${selectedServices.map(service => 
              `<div class="deliverable-item">${service}</div>`
            ).join('')}
          </div>
        </div>
      `;
    }
  }
  
  if (formType === 'photo' && selections.additional?.length) {
    const additionalDescriptions = getPhotoAdditionalDescriptions();
    const selectedAdditional = selections.additional.map(addon => {
      const addonName = addon.replace('photo-additional-', '');
      return additionalDescriptions[addonName] || addonName.replace('-', ' ');
    });
    
    if (selectedAdditional.length > 0) {
      featuresHtml = `
        <div class="section">
          <div class="section-title">Additional Services Selected</div>
          <div class="base-deliverables">
            ${selectedAdditional.map(addon => 
              `<div class="deliverable-item">${addon}</div>`
            ).join('')}
          </div>
        </div>
      `;
    }
  }
  
  return featuresHtml;
}

function getWebsiteFeatureDescriptions() {
  return {
    'blog': 'Blog/News Section with Content Management',
    'ecommerce-basic': 'Basic E-Commerce (up to 10 products)',
    'booking-system': 'Appointment Booking System',
    'membership-area': 'Members-Only Area with Login',
    'advanced-seo': 'Advanced SEO Optimization',
    'social-media': 'Social Media Integration',
    'complex-integrations': 'Complex Third-Party Integrations'
  };
}

function getDesignServiceDescriptions() {
  return {
    'logo-design': 'Professional Logo Design',
    'brand-identity': 'Complete Brand Identity Package',
    'business-cards': 'Business Card Design',
    'instagram-templates': 'Instagram Post Templates',
    'social-ads': 'Social Media Advertisement Design',
    'social-brand-kit': 'Social Media Brand Kit',
    'website-graphics': 'Website Graphics Package',
    'custom-illustrations': 'Custom Illustrations'
  };
}

function getPhotoAdditionalDescriptions() {
  return {
    'extended-editing': 'Extended Editing/Motion Graphics',
    'rush-editing': 'Rush Same-Day Editing',
    'additional-talent': 'Additional Talent (per person)',
    'drone-footage': 'Drone Footage'
  };
}

function getBaseDeliverables(formType: string) {
  const deliverables = {
    website: [
      'Professional custom design across all pages',
      'Mobile-responsive development and testing',
      'Cross-browser compatibility testing',
      'Basic SEO optimization (titles, meta descriptions, keywords)',
      'Google Analytics setup and configuration',
      'Contact form integration with spam protection',
      'SSL certificate setup assistance',
      'Performance optimization',
      'Website hosting setup assistance',
      'Domain configuration support',
      'Two rounds of revisions included',
      'Launch support and testing',
      '30-day post-launch support',
      'Training session for your team'
    ],
    design: [
      'Initial consultation and creative brief development',
      'Two rounds of revisions included',
      'High-resolution files for print and digital use',
      'Source files provided (AI, PSD, or native format)',
      'Project completion within agreed timeline',
      '14-day post-delivery support',
      'Industry-standard file formats and specifications',
      'Color-accurate proofs and previews',
      'Print coordination assistance when applicable',
      'Usage rights and licensing documentation'
    ],
    photo: [
      'On-location professional equipment setup',
      'Professional lighting setup',
      'High-resolution digital file delivery',
      'Basic color correction and editing',
      'Online gallery for viewing and downloading',
      'Usage rights for business and marketing purposes',
      'Broadcast-quality equipment and techniques',
      'Multiple format delivery (web, print, social)',
      'Backup and redundancy during shoots',
      'Professional post-production workflow'
    ]
  };

  return deliverables[formType as keyof typeof deliverables] || [];
}

async function getLogoBase64(): Promise<string> {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
    const logoBuffer = fs.readFileSync(logoPath);
    const logoBase64 = logoBuffer.toString('base64');
    return logoBase64;
  } catch (error) {
    console.error('Error loading logo:', error);
    // Return empty string if logo can't be loaded
    return '';
  }
}