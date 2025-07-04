import { NextRequest, NextResponse } from 'next/server';
import { transporter } from '../../../lib/email';

export async function POST(request: NextRequest) {
  try {
    const { leadData, estimateData, leadScore, notionPageId } = await request.json();
    
    const serviceType = estimateData.formType === 'website' ? 'Website Development' :
                       estimateData.formType === 'design' ? 'Graphic Design' :
                       'Photo & Video Production';

    const actionText = leadData.action === 'pdf_download' ? 'downloaded a PDF estimate' :
                      leadData.action === 'email_sent' ? 'requested an email estimate' :
                      'requested a consultation';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #35332f; color: #daff00; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">New Calculator Lead</h1>
        </div>
        
        <div style="padding: 20px; background: #faf9f6;">
          <h2 style="color: #35332f; margin-top: 0;">Lead Information</h2>
          
          <div style="background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #daff00;">
            <p><strong>Name:</strong> ${leadData.name}</p>
            <p><strong>Email:</strong> ${leadData.email}</p>
            <p><strong>Company:</strong> ${leadData.company || 'Not provided'}</p>
            <p><strong>Phone:</strong> ${leadData.phone || 'Not provided'}</p>
          </div>
          
          <h3 style="color: #35332f;">Project Details</h3>
          <div style="background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #daff00;">
            <p><strong>Service Type:</strong> ${serviceType}</p>
            <p><strong>Estimate Amount:</strong> CAD $${Number(estimateData.total || 0).toLocaleString()}</p>
            <p><strong>Action Taken:</strong> ${actionText}</p>
            <p><strong>Lead Score:</strong> ${leadScore.score}/5 (${leadScore.temperature})</p>
          </div>
          
          ${leadData.message ? `
            <h3 style="color: #35332f;">Message</h3>
            <div style="background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #daff00;">
              <p>${leadData.message}</p>
            </div>
          ` : ''}
          
          <div style="margin-top: 30px; padding: 15px; background: #e8f4f8; border-radius: 5px;">
            <p style="margin: 0;"><strong>Notion Page:</strong> ${notionPageId}</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">
              View this lead in your Notion Calculator Leads database
            </p>
          </div>
        </div>
        
        <div style="background: #35332f; color: #888; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">The Dot Creative - Lead Notification System</p>
        </div>
      </div>
    `;

    // Use the imported transporter
    
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: process.env.AGENCY_EMAIL,
      subject: `🎯 New ${leadScore.temperature} Lead: ${leadData.name} - ${serviceType}`,
      html: emailHtml,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Internal notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send internal notification' },
      { status: 500 }
    );
  }
}