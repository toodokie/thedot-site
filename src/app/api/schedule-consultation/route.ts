import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'info@thedotcreative.co',
      pass: process.env.GMAIL_APP_PASSWORD || '', // App-specific password
    },
  });
};

interface ConsultationData {
  estimateData: {
    formType: string;
    total?: number;
  };
  leadData: {
    name: string;
    email: string;
    company?: string;
  };
}

const generateClientConsultationHTML = (data: ConsultationData) => {
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
            .consultation-box { background: #faf9f6; border: 2px solid #35332f; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
            .section { margin: 20px 0; }
            .section-title { font-size: 18px; font-weight: bold; color: #35332f; margin-bottom: 10px; }
            .info-box { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .cta { background: #35332f; color: #daff00; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; font-weight: bold; }
            .footer { background: #35332f; color: #daff00; padding: 20px; text-align: center; font-size: 14px; }
            .estimate-summary { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="logo">The Dot Creative</h1>
                <p>Consultation Request Received</p>
            </div>
            
            <div class="content">
                <h2>Hi ${data.leadData.name},</h2>
                
                <p>Thank you for requesting a consultation for your ${serviceType.toLowerCase()} project! We're excited to discuss your vision and help bring it to life.</p>
                
                <div class="consultation-box">
                    <h3>🎯 What Happens Next?</h3>
                    <p>Our team will contact you within <strong>24 hours</strong> to schedule your consultation call.</p>
                </div>
                
                <div class="section">
                    <div class="section-title">Your Project Estimate Summary:</div>
                    <div class="estimate-summary">
                        <p><strong>Service Type:</strong> ${serviceType}</p>
                        <p><strong>Estimated Investment:</strong> CAD $${data.estimateData.total?.toLocaleString() || '0'}</p>
                        ${data.leadData.company ? `<p><strong>Company:</strong> ${data.leadData.company}</p>` : ''}
                        ${data.leadData.message ? `<p><strong>Your Message:</strong> "${data.leadData.message}"</p>` : ''}
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">To Prepare for Your Consultation:</div>
                    <div class="info-box">
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Gather any inspiration or reference materials</li>
                            <li>Think about your project timeline and key deadlines</li>
                            <li>Consider your target audience and goals</li>
                            <li>Prepare any specific questions about the process</li>
                            ${data.estimateData.formType === 'website' ? '<li>List any specific features or functionality needs</li>' : ''}
                            ${data.estimateData.formType === 'design' ? '<li>Consider your brand personality and values</li>' : ''}
                            ${data.estimateData.formType === 'photo' ? '<li>Think about locations and visual style preferences</li>' : ''}
                        </ul>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">Contact Information:</div>
                    <p>If you have any immediate questions or need to reach us sooner:</p>
                    <ul>
                        <li><strong>Email:</strong> info@thedotcreative.co</li>
                        <li><strong>Phone:</strong> +1 (647) 402-4420</li>
                        <li><strong>Office Hours:</strong> Monday-Friday, 9 AM - 6 PM EST</li>
                    </ul>
                </div>
                
                <a href="mailto:info@thedotcreative.co?subject=Consultation%20Follow-up%20-%20${data.leadData.name}" class="cta">
                    Email Us Directly
                </a>
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

const generateInternalConsultationHTML = (data: ConsultationData) => {
  const serviceType = data.estimateData.formType === 'website' ? 'Website Development' :
                     data.estimateData.formType === 'design' ? 'Graphic Design' :
                     'Photo & Video Production';

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .urgent { background: #ffe6e6; border: 2px solid #ff6b6b; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .lead-info { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 15px 0; }
            .estimate-details { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .action-items { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .hot-lead { color: #e74c3c; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="urgent">
                <h2>🔥 URGENT: Hot Lead - Consultation Request</h2>
                <p class="hot-lead">HIGH PRIORITY: Client requested consultation for ${serviceType}</p>
                <p><strong>Action Required:</strong> Contact within 24 hours (preferably within 4 hours)</p>
            </div>
            
            <div class="lead-info">
                <h3>Client Information:</h3>
                <ul>
                    <li><strong>Name:</strong> ${data.leadData.name}</li>
                    <li><strong>Email:</strong> ${data.leadData.email}</li>
                    ${data.leadData.company ? `<li><strong>Company:</strong> ${data.leadData.company}</li>` : ''}
                    ${data.leadData.phone ? `<li><strong>Phone:</strong> ${data.leadData.phone}</li>` : ''}
                    <li><strong>Request Time:</strong> ${new Date(data.leadData.timestamp).toLocaleString()}</li>
                </ul>
                
                ${data.leadData.message ? `
                    <h4>Client Message:</h4>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; font-style: italic;">
                        "${data.leadData.message}"
                    </div>
                ` : ''}
            </div>
            
            <div class="estimate-details">
                <h3>Project Estimate Details:</h3>
                <ul>
                    <li><strong>Service Type:</strong> ${serviceType}</li>
                    <li><strong>Estimated Value:</strong> CAD $${data.estimateData.total?.toLocaleString() || '0'}</li>
                    <li><strong>Project Scope:</strong> ${JSON.stringify(data.estimateData.selections, null, 2)}</li>
                </ul>
            </div>
            
            <div class="action-items">
                <h3>📋 Action Items for Consultation:</h3>
                <ol>
                    <li><strong>Immediate (within 4 hours):</strong>
                        <ul>
                            <li>Call ${data.leadData.phone ? data.leadData.phone : 'client (no phone provided)'}</li>
                            <li>If no answer, send personalized follow-up email</li>
                        </ul>
                    </li>
                    <li><strong>Prepare for consultation:</strong>
                        <ul>
                            <li>Review ${serviceType.toLowerCase()} portfolio pieces</li>
                            <li>Prepare questions about project timeline</li>
                            <li>Review estimate details and be ready to discuss scope</li>
                            ${data.estimateData.formType === 'website' ? '<li>Prepare hosting and domain questions</li>' : ''}
                            ${data.estimateData.formType === 'design' ? '<li>Prepare brand discovery questions</li>' : ''}
                            ${data.estimateData.formType === 'photo' ? '<li>Discuss location and scheduling options</li>' : ''}
                        </ul>
                    </li>
                    <li><strong>During consultation:</strong>
                        <ul>
                            <li>Qualify budget and decision-making process</li>
                            <li>Understand timeline and urgency</li>
                            <li>Identify any additional requirements</li>
                            <li>Schedule follow-up and next steps</li>
                        </ul>
                    </li>
                </ol>
            </div>
            
            <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4>🎯 Lead Conversion Tips:</h4>
                <ul>
                    <li>This is a HOT lead - they're ready to discuss investment</li>
                    <li>Consultation requests have 3x higher conversion rate</li>
                    <li>Be prepared to close or get commitment during the call</li>
                    <li>Have contract and next steps ready to discuss</li>
                </ul>
            </div>
        </div>
    </body>
    </html>
  `;
};

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const transporter = createTransporter();

    // Send confirmation email to client
    await transporter.sendMail({
      from: '"The Dot Creative" <info@thedotcreative.co>',
      to: data.leadData.email,
      subject: `Consultation Request Confirmed - ${data.estimateData.formType === 'website' ? 'Website Development' : 
                                                   data.estimateData.formType === 'design' ? 'Graphic Design' : 
                                                   'Photo & Video Production'}`,
      html: generateClientConsultationHTML(data),
    });

    // Send urgent internal notification
    await transporter.sendMail({
      from: '"URGENT Lead Alert" <info@thedotcreative.co>',
      to: 'info@thedotcreative.co',
      subject: `🔥 URGENT: Consultation Request - ${data.leadData.name} (${data.estimateData.formType}) - CAD $${data.estimateData.total?.toLocaleString()}`,
      html: generateInternalConsultationHTML(data),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Consultation scheduling error:', error);
    return NextResponse.json(
      { error: 'Failed to schedule consultation' },
      { status: 500 }
    );
  }
}