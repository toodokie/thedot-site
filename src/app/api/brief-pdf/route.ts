import { NextRequest, NextResponse } from 'next/server';
import { generateBriefPDF, generateSimpleBriefHTML } from '@/lib/pdf';
import { updateBriefAction, BriefData } from '@/lib/notion';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { validateEmail, validateName, isBot } from '@/lib/input-sanitization';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 5, window: 10 * 60 * 1000, key: 'brief-pdf' });
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for brief-pdf, IP:', clientIP);
      return NextResponse.json(
        { error: 'Too many PDF requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { formType, name, email, company, briefData, briefId, format = 'pdf', website } = body;

    if (isBot(website)) {
      console.warn('Bot detected via honeypot for brief-pdf, IP:', clientIP);
      return NextResponse.json({ error: 'Invalid submission' }, { status: 400 });
    }

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

    if (format === 'html') {
      const htmlContent = generateSimpleBriefHTML(briefDataObj);

      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    } else {
      const pdfBuffer = generateBriefPDF(briefDataObj);

      if (briefId) {
        try {
          await updateBriefAction(briefId, 'pdf_download');
        } catch (error) {
          console.error('Failed to update Notion:', error);
        }
      }

      const safeName = briefDataObj.name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 50);
      const filename = `brief-${formType}-${safeName}-${Date.now()}.pdf`;

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': pdfBuffer.length.toString(),
        },
      });
    }

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF. Please try again.' },
      { status: 500 }
    );
  }
}
