import { NextRequest, NextResponse } from 'next/server';
import { saveBriefToNotion, BriefData } from '@/lib/notion';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, validateName, isBot } from '../../../lib/input-sanitization';
import { transporter } from '../../../lib/email';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 2, window: 10 * 60 * 1000 }); // 2 requests per 10 minutes
    
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for brief submission, IP:', clientIP);
      return NextResponse.json(
        { 
          error: 'Too many submissions. Please try again later.',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { formType, name, email, company, briefData, website } = body;

    // Check honeypot field (bot detection)
    if (isBot(website)) {
      console.warn('Bot detected via honeypot field for brief submission, IP:', clientIP);
      return NextResponse.json(
        { error: 'Invalid submission' },
        { status: 400 }
      );
    }

    // Validate and sanitize inputs
    const nameValidation = validateName(name);
    const emailValidation = validateEmail(email);

    const errors: string[] = [
      ...nameValidation.errors,
      ...emailValidation.errors
    ];

    if (!formType || !briefData) {
      errors.push('Form type and brief data are required');
    }

    if (errors.length > 0) {
      console.error('Brief submission validation errors:', errors);
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    // Use sanitized values
    const sanitizedName = nameValidation.sanitized;
    const sanitizedEmail = emailValidation.sanitized;

    // Validate form type
    if (!['website', 'graphic', 'photo'].includes(formType)) {
      return NextResponse.json(
        { error: 'Invalid form type. Must be: website, graphic, or photo' },
        { status: 400 }
      );
    }

    // Prepare data for Notion
    const notionData: BriefData = {
      formType,
      name: sanitizedName,
      email: sanitizedEmail,
      company: company || '',
      briefData
    };

    // Save to Notion with initial action as "pdf_download"
    const briefId = await saveBriefToNotion(notionData, 'submission');

    // Send internal notification email to agency
    try {
      console.log('Sending agency notification for brief submission...');

      const serviceType = formType === 'website' ? 'Website Development' :
                         formType === 'graphic' ? 'Graphic Design' :
                         'Photo & Video Production';

      const agencyEmailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>New Project Brief - ${sanitizedName}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background: #35332f; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .alert { background: #daff00; color: #35332f; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-weight: 600; }
            .client-info { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; }
            .project-details { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚨 New Project Brief Submitted</h1>
            <p>A new ${serviceType} project brief has been submitted</p>
          </div>

          <div class="alert">
            ⚡ NEW BRIEF SUBMISSION - Review within 2 hours
          </div>

          <div class="client-info">
            <h2>👤 Client Information</h2>
            <p><strong>Name:</strong> ${sanitizedName}</p>
            <p><strong>Email:</strong> <a href="mailto:${sanitizedEmail}">${sanitizedEmail}</a></p>
            <p><strong>Company:</strong> ${company || 'Not provided'}</p>
            <p><strong>Service Type:</strong> ${serviceType}</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div class="project-details">
            <h2>📋 Brief Details</h2>
            <p>The client has submitted a detailed project brief. Please review the full brief in your Notion database.</p>
            <p><strong>Notion Entry ID:</strong> ${briefId}</p>

            <h3>🎯 Next Steps:</h3>
            <ol>
              <li>Review the complete brief in Notion</li>
              <li>Contact client within 2 hours to discuss project</li>
              <li>Schedule consultation call to clarify requirements</li>
              <li>Prepare proposal based on brief details</li>
            </ol>
          </div>

          <div style="background: #35332f; color: white; padding: 15px; border-radius: 6px; margin-top: 20px; text-align: center;">
            <p><strong>⚡ Quick Reply:</strong> <a href="mailto:${sanitizedEmail}" style="color: #daff00;">${sanitizedEmail}</a></p>
          </div>
        </body>
        </html>
      `;

      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: process.env.AGENCY_EMAIL,
        subject: `🚨 NEW ${serviceType.toUpperCase()} BRIEF: ${sanitizedName}`,
        html: agencyEmailContent,
      });

      console.log('Agency notification email sent successfully');
    } catch (emailError) {
      console.error('Failed to send agency notification:', emailError);
      // Don't fail the whole request if email fails
    }

    return NextResponse.json({
      success: true,
      briefId,
      message: 'Brief submitted successfully'
    });

  } catch (error) {
    console.error('Brief submission error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to submit brief. Please try again.' },
      { status: 500 }
    );
  }
}