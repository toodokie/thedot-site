import { NextRequest, NextResponse } from 'next/server';
import { sendClientEmail } from '@/lib/email';
import { updateBriefAction, BriefData, saveBriefToNotion } from '@/lib/notion';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { validateEmail, validateName, isBot } from '@/lib/input-sanitization';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 3, window: 10 * 60 * 1000, key: 'brief-email' });
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for brief-email, IP:', clientIP);
      return NextResponse.json(
        { error: 'Too many email requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    console.log('Brief email API received from IP:', clientIP);
    const { formType, name, email, company, briefData, briefId, website } = body;

    if (isBot(website)) {
      console.warn('Bot detected via honeypot for brief-email, IP:', clientIP);
      return NextResponse.json({ error: 'Invalid submission' }, { status: 400 });
    }

    // Validate required fields
    if (!formType || !briefData) {
      return NextResponse.json(
        { error: 'Missing required fields: formType, briefData' },
        { status: 400 }
      );
    }

    if (!['website', 'graphic', 'photo'].includes(formType)) {
      return NextResponse.json(
        { error: 'Invalid form type. Must be: website, graphic, or photo' },
        { status: 400 }
      );
    }

    const nameValidation = validateName(name);
    const emailValidation = validateEmail(email);

    if (!nameValidation.isValid || !emailValidation.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', details: [...nameValidation.errors, ...emailValidation.errors] },
        { status: 400 }
      );
    }

    const briefDataObj: BriefData = {
      formType,
      name: nameValidation.sanitized,
      email: emailValidation.sanitized,
      company: company || '',
      briefData,
    };

    // Send email to client
    console.log('Attempting to send client email...');
    await sendClientEmail(briefDataObj);
    console.log('Client email sent successfully');

    // Update Notion with email action and increased lead score
    let notionBriefId = briefId;
    try {
      if (!notionBriefId) {
        // If no briefId provided, create new entry
        console.log('Creating new Notion entry for email action...');
        notionBriefId = await saveBriefToNotion(briefDataObj, 'email_sent');
      } else {
        // Update existing entry
        console.log('Updating existing Notion entry for email action...');
        await updateBriefAction(notionBriefId, 'email_sent');
      }
      console.log('Notion update successful, briefId:', notionBriefId);
    } catch (notionError) {
      console.error('Notion update failed (but email was sent):', notionError);
      // Don't fail the whole request if Notion fails
    }

    return NextResponse.json({
      success: true,
      message: 'Brief email sent successfully',
      briefId: notionBriefId,
    });

  } catch (error) {
    console.error('Email sending error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Invalid email') || error.message.includes('SMTP')) {
        return NextResponse.json(
          { error: 'Failed to send email. Please check the email address and try again.' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to send brief email. Please try again.' },
      { status: 500 }
    );
  }
}
