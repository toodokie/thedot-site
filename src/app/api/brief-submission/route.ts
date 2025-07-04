import { NextRequest, NextResponse } from 'next/server';
import { saveBriefToNotion, BriefData } from '@/lib/notion';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, validateName, isBot } from '../../../lib/input-sanitization';

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