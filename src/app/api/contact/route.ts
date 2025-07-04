import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { transporter } from '../../../lib/email';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, validateName, validateMessage, isBot } from '../../../lib/input-sanitization';

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

interface ContactFormData {
  name: string;
  email: string;
  message: string;
  website?: string; // Honeypot field
}

export async function POST(request: NextRequest) {
  console.log('=== CONTACT FORM API STARTED ===');
  
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 3, window: 15 * 60 * 1000 }); // 3 requests per 15 minutes
    
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for IP:', clientIP);
      return NextResponse.json(
        { 
          error: 'Too many requests. Please try again later.',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    const body: ContactFormData = await request.json();
    console.log('Contact form data received:', { name: body.name, email: body.email, messageLength: body.message?.length });
    
    const { name, email, message, website } = body;

    // Check honeypot field (bot detection)
    if (isBot(website)) {
      console.warn('Bot detected via honeypot field for IP:', clientIP);
      return NextResponse.json(
        { error: 'Invalid submission' },
        { status: 400 }
      );
    }

    // Validate and sanitize inputs
    const nameValidation = validateName(name);
    const emailValidation = validateEmail(email);
    const messageValidation = validateMessage(message);

    const errors: string[] = [
      ...nameValidation.errors,
      ...emailValidation.errors,
      ...messageValidation.errors
    ];

    if (errors.length > 0) {
      console.error('Validation errors:', errors);
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    // Use sanitized values
    const sanitizedName = nameValidation.sanitized;
    const sanitizedEmail = emailValidation.sanitized;
    const sanitizedMessage = messageValidation.sanitized;

    // Save to Notion Contact Form database
    try {
      console.log('Saving to Notion contact form database...');
      const notionResponse = await notion.pages.create({
        parent: {
          database_id: process.env.NOTION_CONTACT_FORM_DB_ID!,
        },
        properties: {
          'Name': {
            title: [
              {
                text: {
                  content: sanitizedName,
                },
              },
            ],
          },
          'Email': {
            email: sanitizedEmail,
          },
          'Message': {
            rich_text: [
              {
                text: {
                  content: sanitizedMessage.substring(0, 2000), // Notion has a limit
                },
              },
            ],
          },
          'Source': {
            select: {
              name: 'Contact Form',
            },
          },
          'Status': {
            select: {
              name: 'New',
            },
          },
          'Date Submitted': {
            date: {
              start: new Date().toISOString().split('T')[0],
            },
          },
        },
      });
      console.log('Notion contact entry created:', notionResponse.id);
    } catch (notionError) {
      console.error('Notion save failed:', notionError);
      // Continue even if Notion fails
    }

    // Send email to agency
    try {
      console.log('Sending agency notification email...');
      const agencyEmailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>New Contact Form Submission</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #35332f; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .alert { background: #daff00; color: #35332f; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-weight: bold; }
            .content { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; }
            .message-box { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 6px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📧 New Contact Form Submission</h1>
            <p>Someone has sent a message through the website contact form</p>
          </div>

          <div class="alert">
            ⚡ CONTACT REQUEST - Please respond within 24 hours
          </div>

          <div class="content">
            <h2>Contact Information</h2>
            <p><strong>Name:</strong> ${sanitizedName}</p>
            <p><strong>Email:</strong> <a href="mailto:${sanitizedEmail}">${sanitizedEmail}</a></p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
            
            <div class="message-box">
              <h3>Message:</h3>
              <p>${sanitizedMessage}</p>
            </div>
          </div>

          <div style="background: #35332f; color: white; padding: 15px; border-radius: 6px; text-align: center;">
            <p><strong>⚡ Quick Reply:</strong> <a href="mailto:${sanitizedEmail}" style="color: #daff00;">${sanitizedEmail}</a></p>
          </div>
        </body>
        </html>
      `;

      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: process.env.AGENCY_EMAIL,
        subject: `🔔 New Contact Form: ${sanitizedName}`,
        html: agencyEmailContent,
      });
      console.log('Agency notification email sent successfully');
    } catch (emailError) {
      console.error('Agency email failed:', emailError);
      // Continue even if email fails
    }

    // Send confirmation email to client
    try {
      console.log('Sending client confirmation email...');
      const clientEmailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Thank You for Contacting The Dot Creative Agency</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #35332f; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #daff00 0%, #faf9f6 100%); padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
            .content { background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .section { margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
            .section:last-child { border-bottom: none; }
            h1 { color: #35332f; font-size: 28px; margin: 0; }
            h2 { color: #35332f; font-size: 22px; margin-bottom: 15px; }
            .next-steps { background: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #daff00; }
            .contact-info { background: #35332f; color: white; padding: 20px; text-align: center; border-radius: 6px; margin-top: 30px; }
            .contact-info a { color: #daff00; text-decoration: none; }
            .button { display: inline-block; background: #35332f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Thank You, ${sanitizedName}!</h1>
            <p>Your message has been successfully received.</p>
          </div>

          <div class="content">
            <div class="section">
              <h2>📋 Message Received</h2>
              <p>We've received your message and truly appreciate you taking the time to reach out to us. Your inquiry is important to us, and we're excited about the possibility of working together.</p>
              
              <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 15px;">
                <strong>Your message:</strong><br>
                "${sanitizedMessage.substring(0, 200)}${sanitizedMessage.length > 200 ? '...' : ''}"
              </div>
            </div>

            <div class="section">
              <h2>🎯 What Happens Next?</h2>
              <div class="next-steps">
                <h3>Our Response Process:</h3>
                <ol>
                  <li><strong>Immediate Acknowledgment</strong> - You're receiving this confirmation (complete!)</li>
                  <li><strong>Team Review</strong> - Our team will carefully review your message (within 2-4 hours)</li>
                  <li><strong>Personal Response</strong> - You'll receive a detailed, personalized response (within 24 hours)</li>
                  <li><strong>Next Steps Discussion</strong> - We'll outline how we can help bring your vision to life</li>
                </ol>
              </div>
            </div>

            <div class="section">
              <h2>💡 Why Choose The Dot?</h2>
              <ul>
                <li>✨ <strong>Creative Excellence</strong> - Award-winning design that stands out</li>
                <li>🎯 <strong>Strategic Approach</strong> - Every solution serves your business goals</li>
                <li>⚡ <strong>Fast Response</strong> - We value your time and respond quickly</li>
                <li>🤝 <strong>Collaborative Process</strong> - You're involved every step of the way</li>
              </ul>
            </div>

            <div class="section">
              <h2>📞 Need to Chat Sooner?</h2>
              <p>Have an urgent question or want to discuss your project right away? We're here to help!</p>
              <a href="tel:+16474024420" class="button">📞 Call Us: +1 (647) 402-4420</a>
              <a href="https://wa.me/16474024420" class="button">💬 WhatsApp Us</a>
            </div>
          </div>

          <div class="contact-info">
            <h3>The Dot Creative Agency</h3>
            <p>
              📞 +1 (647) 402-4420<br>
              ✉️ <a href="mailto:hello@thedotcreative.co">hello@thedotcreative.co</a><br>
              🌐 <a href="https://www.thedotcreative.co">www.thedotcreative.co</a>
            </p>
            <p><em>Creating impactful design solutions that drive results.</em></p>
          </div>
        </body>
        </html>
      `;

      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: sanitizedEmail,
        subject: 'Thank you for contacting The Dot Creative Agency',
        html: clientEmailContent,
      });
      console.log('Client confirmation email sent successfully');
    } catch (clientEmailError) {
      console.error('Client email failed:', clientEmailError);
      // Continue even if confirmation email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for your message! We\'ll get back to you within 24 hours.',
    });

  } catch (error) {
    console.error('=== CONTACT FORM API ERROR ===');
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    
    return NextResponse.json(
      { error: 'Failed to process contact form. Please try again or contact us directly.' },
      { status: 500 }
    );
  }
}