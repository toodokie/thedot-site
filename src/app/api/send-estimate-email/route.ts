import { NextRequest, NextResponse } from 'next/server';
import { transporter } from '../../../lib/email';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, isBot } from '../../../lib/input-sanitization';

interface EstimateEmailData {
  estimateData: {
    formType: string;
    total?: number;
  };
  leadData: {
    name: string;
    email: string;
    company?: string;
    action: string;
    timestamp: string;
    phone?: string;
    message?: string;
  };
}

// Email templates
const generateClientEmailHTML = (data: EstimateEmailData) => {
  const serviceType = data.estimateData.formType === 'website' ? 'Website Development' :
                     data.estimateData.formType === 'design' ? 'Graphic Design' :
                     'Photo & Video Production';

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: 'Helvetica', Arial, sans-serif; color: #35332f; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #daff00; padding: 20px; text-align: center; }
            .logo { font-size: 24px; font-weight: bold; color: #35332f; margin: 0; }
            .content { background: #fff; padding: 30px; }
            .estimate-box { background: #faf9f6; border: 2px solid #daff00; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .price { font-size: 28px; font-weight: bold; color: #35332f; text-align: center; }
            .section { margin: 20px 0; }
            .section-title { font-size: 18px; font-weight: bold; color: #35332f; margin-bottom: 10px; }
            .feature-list { list-style: none; padding: 0; }
            .feature-list li { padding: 5px 0; border-bottom: 1px solid #e5e5e5; }
            .cta { background: #35332f; color: #daff00; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; font-weight: bold; }
            .footer { background: #35332f; color: #daff00; padding: 20px; text-align: center; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">The Dot Creative</h1>
                <p>Your ${serviceType} Estimate</p>
            </div>
            
            <div class="content">
                <h2>Hi ${data.leadData.name},</h2>
                
                <p>Thank you for your interest in our ${serviceType.toLowerCase()} services! Below is your detailed project estimate:</p>
                
                <div class="estimate-box">
                    <div class="price">CAD $${data.estimateData.total?.toLocaleString() || '0'}</div>
                    <p style="text-align: center; margin: 10px 0 0 0; color: #888;">Total Project Investment</p>
                </div>
                
                <div class="section">
                    <div class="section-title">What's Included:</div>
                    <ul class="feature-list">
                        ${getIncludedFeatures(data.estimateData).map(feature => `<li>✓ ${feature}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="section">
                    <div class="section-title">Next Steps:</div>
                    <p>This estimate is valid for 30 days. To get started or discuss any questions:</p>
                    <ul>
                        <li>Reply to this email with any questions</li>
                        <li>Call us at +1 (647) 402-4420</li>
                        <li>Schedule a consultation online</li>
                    </ul>
                </div>
                
                <a href="mailto:info@thedotcreative.co?subject=Project%20Discussion%20-%20${serviceType}" class="cta">
                    Let's Discuss Your Project
                </a>
                
                <p><strong>Project Details:</strong></p>
                <ul>
                    <li><strong>Service Type:</strong> ${serviceType}</li>
                    <li><strong>Estimate Date:</strong> ${new Date().toLocaleDateString()}</li>
                    <li><strong>Valid Until:</strong> ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</li>
                    ${data.leadData.company ? `<li><strong>Company:</strong> ${data.leadData.company}</li>` : ''}
                </ul>
            </div>
            
            <div class="footer">
                <p><strong>The Dot Creative Agency</strong></p>
                <p>Ontario, Canada | +1 (647) 402-4420 | info@thedotcreative.co</p>
                <p>www.thedotcreative.co</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

const generateInternalNotificationHTML = (data: EstimateEmailData) => {
  const serviceType = data.estimateData.formType === 'website' ? 'Website Development' :
                     data.estimateData.formType === 'design' ? 'Graphic Design' :
                     'Photo & Video Production';

  const leadScore = data.leadData.action === 'pdf' ? 'Cold' :
                    data.leadData.action === 'email' ? 'Warm' : 'Hot';

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .lead-info { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 15px 0; }
            .score { font-weight: bold; color: ${leadScore === 'Hot' ? '#e74c3c' : leadScore === 'Warm' ? '#f39c12' : '#3498db'}; }
            .estimate-details { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="alert">
                <h2>🎯 New Lead Alert - ${serviceType}</h2>
                <p><strong>Lead Score:</strong> <span class="score">${leadScore}</span> | <strong>Action:</strong> ${data.leadData.action.toUpperCase()}</p>
            </div>
            
            <div class="lead-info">
                <h3>Contact Information:</h3>
                <ul>
                    <li><strong>Name:</strong> ${data.leadData.name}</li>
                    <li><strong>Email:</strong> ${data.leadData.email}</li>
                    ${data.leadData.company ? `<li><strong>Company:</strong> ${data.leadData.company}</li>` : ''}
                    ${data.leadData.phone ? `<li><strong>Phone:</strong> ${data.leadData.phone}</li>` : ''}
                    <li><strong>Timestamp:</strong> ${new Date(data.leadData.timestamp).toLocaleString()}</li>
                </ul>
                
                ${data.leadData.message ? `
                    <h4>Message:</h4>
                    <p>${data.leadData.message}</p>
                ` : ''}
            </div>
            
            <div class="estimate-details">
                <h3>Estimate Details:</h3>
                <ul>
                    <li><strong>Service Type:</strong> ${serviceType}</li>
                    <li><strong>Total Amount:</strong> CAD $${data.estimateData.total?.toLocaleString() || '0'}</li>
                    <li><strong>Selections:</strong> ${JSON.stringify(data.estimateData.selections, null, 2)}</li>
                </ul>
            </div>
            
            <div style="margin-top: 30px; padding: 20px; background: #f1f1f1; border-radius: 5px;">
                <h3>Recommended Actions:</h3>
                ${leadScore === 'Hot' ? `
                    <p>🔥 <strong>Priority Follow-up Required!</strong></p>
                    <ul>
                        <li>Call within 1 hour if possible</li>
                        <li>Send personalized follow-up email</li>
                        <li>Prepare detailed project proposal</li>
                    </ul>
                ` : leadScore === 'Warm' ? `
                    <p>📧 <strong>Email Follow-up Recommended</strong></p>
                    <ul>
                        <li>Send follow-up email within 24 hours</li>
                        <li>Offer consultation call</li>
                        <li>Share relevant case studies</li>
                    </ul>
                ` : `
                    <p>📄 <strong>Lead Captured</strong></p>
                    <ul>
                        <li>Add to newsletter if not already subscribed</li>
                        <li>Send follow-up email in 2-3 days</li>
                        <li>Track engagement for nurturing</li>
                    </ul>
                `}
            </div>
        </div>
    </body>
    </html>
  `;
};

interface EstimateDataWithForm {
  formType: string;
}

function getIncludedFeatures(estimateData: EstimateDataWithForm) {
  // Return features based on service type and selections
  const baseFeatures = {
    website: [
      'Professional custom design across all pages',
      'Mobile-responsive development and testing',
      'Basic SEO optimization',
      'Google Analytics setup',
      'Contact form integration',
      '30-day post-launch support'
    ],
    design: [
      'Initial consultation and creative brief',
      'Two rounds of revisions included',
      'High-resolution files for print and digital',
      'Source files provided',
      '14-day post-delivery support'
    ],
    photo: [
      'On-location professional equipment setup',
      'Professional lighting and backdrop systems',
      'High-resolution digital file delivery',
      'Basic color correction and editing',
      '48-hour turnaround for edited files'
    ]
  };

  return baseFeatures[estimateData.formType as keyof typeof baseFeatures] || [];
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 3, window: 10 * 60 * 1000 }); // 3 requests per 10 minutes
    
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for estimate email, IP:', clientIP);
      return NextResponse.json(
        { 
          error: 'Too many email requests. Please try again later.',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    console.log('Email API called');
    const data = await request.json();
    console.log('Request data:', { hasEstimateData: !!data.estimateData, hasLeadData: !!data.leadData });
    
    // Check honeypot and validate email
    if (isBot(data.website)) {
      console.warn('Bot detected via honeypot field for estimate email, IP:', clientIP);
      return NextResponse.json(
        { error: 'Invalid submission' },
        { status: 400 }
      );
    }

    const emailValidation = validateEmail(data.leadData?.email);
    if (!emailValidation.isValid) {
      console.error('Invalid email for estimate:', emailValidation.errors);
      return NextResponse.json(
        { error: 'Invalid email address', details: emailValidation.errors },
        { status: 400 }
      );
    }

    console.log('Transporter will use secure settings');

    // Send email to client
    const sanitizedEmail = emailValidation.sanitized;
    console.log('Sending email to client:', sanitizedEmail);
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: sanitizedEmail,
      subject: `Your ${data.estimateData.formType === 'website' ? 'Website Development' : 
                      data.estimateData.formType === 'design' ? 'Graphic Design' : 
                      'Photo & Video Production'} Estimate`,
      html: generateClientEmailHTML(data),
    });
    console.log('Client email sent successfully');

    // Send internal notification
    console.log('Sending internal notification to:', process.env.AGENCY_EMAIL);
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.AGENCY_EMAIL,
      subject: `🎯 New ${data.leadData.action.toUpperCase()} Lead - ${data.leadData.name} (${data.estimateData.formType})`,
      html: generateInternalNotificationHTML(data),
    });
    console.log('Internal notification sent successfully');

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Email sending error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
      smtpConfig: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        hasPassword: !!process.env.SMTP_PASS
      }
    });
    return NextResponse.json(
      { 
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}