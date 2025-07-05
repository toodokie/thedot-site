import { NextRequest, NextResponse } from 'next/server';
import { transporter } from '../../../lib/email';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, isBot } from '../../../lib/input-sanitization';

interface Selections {
  pageCount?: string;
  websiteType?: string;
  timeline?: string;
  features?: string[];
  services?: string[];
  service?: string;
  additional?: string[];
}

// Generate selections summary for email
function getSelectionsSummary(selections: Selections, formType: string): string {
  if (!selections) return 'No specific selections recorded';

  try {
    if (formType === 'website') {
      const parts = [];
      if (selections.websiteType) parts.push(`Website Type: ${selections.websiteType}`);
      if (selections.timeline) parts.push(`Timeline: ${selections.timeline}`);
      if (selections.features?.length) parts.push(`Additional Features: ${selections.features.join(', ')}`);
      return parts.join('\n');
    } else if (formType === 'design') {
      const parts = [];
      if (selections.services?.length) parts.push(`Design Services: ${selections.services.join(', ')}`);
      if (selections.timeline) parts.push(`Timeline: ${selections.timeline}`);
      return parts.join('\n');
    } else if (formType === 'photo') {
      const parts = [];
      if (selections.service) parts.push(`Service Type: ${selections.service}`);
      if (selections.timeline) parts.push(`Timeline: ${selections.timeline}`);
      if (selections.additional?.length) parts.push(`Additional Services: ${selections.additional.join(', ')}`);
      return parts.join('\n');
    }
    
    return 'Project details available in calculator data';
  } catch {
    return 'Error parsing project selections';
  }
}

interface ConsultationRequestData {
  estimateData: {
    formType: string;
    total?: number;
    selections?: Selections;
  };
  leadData: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    message?: string;
    timestamp: string;
  };
}

// Email template for consultation request
const generateConsultationEmailHTML = (data: ConsultationRequestData) => {
  const serviceType = data.estimateData.formType === 'website' ? 'Website Development' :
                     data.estimateData.formType === 'design' ? 'Graphic Design' :
                     'Photo & Video Production';

  const selectionsSummary = getSelectionsSummary(data.estimateData.selections, data.estimateData.formType);

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: 'Helvetica', Arial, sans-serif; color: #35332f; line-height: 1.6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #35332f; color: #daff00; padding: 20px; text-align: center; }
            .content { background: #fff; padding: 30px; }
            .estimate-box { background: #faf9f6; border: 2px solid #daff00; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .price { font-size: 28px; font-weight: bold; color: #35332f; text-align: center; margin: 15px 0; }
            .section { margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #daff00; }
            .section-title { font-size: 16px; font-weight: bold; color: #35332f; margin-bottom: 10px; }
            .contact-info { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { background: #35332f; color: #daff00; padding: 20px; text-align: center; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎯 HOT LEAD: Consultation Request</h1>
                <p>${serviceType} Project</p>
            </div>
            
            <div class="content">
                <div class="contact-info">
                    <h2>Client Information</h2>
                    <p><strong>Name:</strong> ${data.leadData.name}</p>
                    <p><strong>Email:</strong> ${data.leadData.email}</p>
                    <p><strong>Company:</strong> ${data.leadData.company || 'Not provided'}</p>
                    <p><strong>Phone:</strong> ${data.leadData.phone || 'Not provided'}</p>
                    <p><strong>Submitted:</strong> ${new Date(data.leadData.timestamp).toLocaleString()}</p>
                </div>

                <div class="estimate-box">
                    <h3 style="text-align: center; margin-top: 0;">Calculator Estimate</h3>
                    <div class="price">CAD $${Number(data.estimateData.total || 0).toLocaleString()}</div>
                    <p style="text-align: center; color: #666; font-size: 14px;">
                        Estimated for ${serviceType}
                    </p>
                </div>

                <div class="section">
                    <div class="section-title">Project Requirements</div>
                    <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${selectionsSummary}</pre>
                </div>

                ${data.leadData.message ? `
                    <div class="section">
                        <div class="section-title">Client Message</div>
                        <p style="margin: 0;">${data.leadData.message}</p>
                    </div>
                ` : ''}

                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="color: #856404; margin-top: 0;">🔥 Action Required</h3>
                    <p style="color: #856404; margin-bottom: 0;">
                        This is a <strong>HOT LEAD</strong> - the client has completed the calculator and specifically requested a consultation. 
                        Recommended response time: <strong>Within 2 hours</strong> for best conversion rates.
                    </p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="mailto:${data.leadData.email}" style="background: #35332f; color: #daff00; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                        Reply to ${data.leadData.name}
                    </a>
                </div>
            </div>
            
            <div class="footer">
                <p style="margin: 0;">The Dot Creative - Lead Management System</p>
                <p style="margin: 5px 0 0 0; font-size: 12px;">This lead has been saved to your Notion Calculator Leads database</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

export async function POST(request: NextRequest) {
  try {
    // Check if email configuration is available
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.AGENCY_EMAIL) {
      console.error('Email configuration missing:', {
        hasHost: !!process.env.SMTP_HOST,
        hasUser: !!process.env.SMTP_USER,
        hasPass: !!process.env.SMTP_PASS,
        hasAgencyEmail: !!process.env.AGENCY_EMAIL
      });
      return NextResponse.json(
        { 
          error: 'Email service not configured. Please contact us directly.',
          fallback: 'Please email us at info@thedotcreative.co or call +1 (647) 402-4420'
        },
        { status: 503 }
      );
    }

    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 2, window: 10 * 60 * 1000 }); // 2 requests per 10 minutes
    
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for consultation request, IP:', clientIP);
      return NextResponse.json(
        { 
          error: 'Too many consultation requests. Please try again later.',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    const data = await request.json();

    // Check honeypot field (bot detection)
    if (isBot(data.website)) {
      console.warn('Bot detected via honeypot field for consultation request, IP:', clientIP);
      return NextResponse.json(
        { error: 'Invalid submission' },
        { status: 400 }
      );
    }

    // Validate email
    const emailValidation = validateEmail(data.leadData?.email);
    if (!emailValidation.isValid) {
      console.error('Invalid email for consultation request:', emailValidation.errors);
      return NextResponse.json(
        { error: 'Invalid email address', details: emailValidation.errors },
        { status: 400 }
      );
    }

    const serviceType = data.estimateData.formType === 'website' ? 'Website Development' :
                       data.estimateData.formType === 'design' ? 'Graphic Design' :
                       'Photo & Video Production';

    // Send consultation request to agency email
    try {
      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: process.env.AGENCY_EMAIL,
        subject: `🔥 HOT LEAD: Consultation Request - ${data.leadData.name} (${serviceType} - $${Number(data.estimateData.total || 0).toLocaleString()})`,
        html: generateConsultationEmailHTML(data),
        replyTo: emailValidation.sanitized, // Enable direct reply to client
      });

      console.log('Consultation request email sent successfully');
      return NextResponse.json({ success: true });
    } catch (emailError) {
      console.error('Failed to send consultation email:', emailError);
      
      // Log the lead data for manual follow-up
      console.log('URGENT: Manual follow-up required for consultation request:', {
        name: data.leadData.name,
        email: data.leadData.email,
        company: data.leadData.company,
        serviceType,
        total: data.estimateData.total,
        timestamp: new Date().toISOString()
      });
      
      // Return success to user but indicate email issue
      return NextResponse.json({ 
        success: true, 
        warning: 'Request received but email delivery delayed. We will contact you directly within 2 hours.'
      });
    }

  } catch (error) {
    console.error('Consultation request error:', error);
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
        error: 'Failed to send consultation request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}