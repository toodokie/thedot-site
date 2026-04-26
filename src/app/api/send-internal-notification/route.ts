import { NextRequest, NextResponse } from 'next/server';
import { transporter } from '../../../lib/email';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

// This endpoint is only called server-to-server from save-calculator-lead.
// It is protected by a shared secret to prevent direct external invocation.
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export async function POST(request: NextRequest) {
  try {
    // Require a shared secret unless explicitly disabled (e.g. local dev with no env set).
    if (INTERNAL_SECRET) {
      const provided = request.headers.get('x-internal-secret');
      if (provided !== INTERNAL_SECRET) {
        console.warn('send-internal-notification: missing/invalid internal secret');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Rate limit even with secret as a defense-in-depth measure.
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 30, window: 10 * 60 * 1000, key: 'internal-notify' });
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for internal notification, IP:', clientIP);
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { leadData, estimateData, leadScore, notionPageId } = await request.json();

    if (!leadData || !estimateData || !leadScore) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const serviceType = estimateData.formType === 'website' ? 'Website Development' :
                       estimateData.formType === 'design' ? 'Graphic Design' :
                       'Photo & Video Production';

    const actionText = leadData.action === 'pdf_download' ? 'downloaded a PDF estimate' :
                      leadData.action === 'email_sent' ? 'requested an email estimate' :
                      'requested a consultation';

    // Helper: minimal HTML escaping for values we don't fully control.
    const esc = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #35332f; color: #daff00; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">New Calculator Lead</h1>
        </div>

        <div style="padding: 20px; background: #faf9f6;">
          <h2 style="color: #35332f; margin-top: 0;">Lead Information</h2>

          <div style="background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #daff00;">
            <p><strong>Name:</strong> ${esc(leadData.name)}</p>
            <p><strong>Email:</strong> ${esc(leadData.email)}</p>
            <p><strong>Company:</strong> ${esc(leadData.company || 'Not provided')}</p>
            <p><strong>Phone:</strong> ${esc(leadData.phone || 'Not provided')}</p>
          </div>

          <h3 style="color: #35332f;">Project Details</h3>
          <div style="background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #daff00;">
            <p><strong>Service Type:</strong> ${esc(serviceType)}</p>
            <p><strong>Estimate Amount:</strong> CAD $${Number(estimateData.total || 0).toLocaleString()}</p>
            <p><strong>Action Taken:</strong> ${esc(actionText)}</p>
            <p><strong>Lead Score:</strong> ${esc(leadScore.score)}/5 (${esc(leadScore.temperature)})</p>
          </div>

          ${leadData.message ? `
            <h3 style="color: #35332f;">Message</h3>
            <div style="background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #daff00;">
              <p>${esc(leadData.message)}</p>
            </div>
          ` : ''}

          <div style="margin-top: 30px; padding: 15px; background: #e8f4f8; border-radius: 5px;">
            <p style="margin: 0;"><strong>Notion Page:</strong> ${esc(notionPageId)}</p>
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
