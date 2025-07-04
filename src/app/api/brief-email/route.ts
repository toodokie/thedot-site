import { NextRequest, NextResponse } from 'next/server';
import { sendClientEmail } from '@/lib/email';
import { updateBriefAction, BriefData, saveBriefToNotion } from '@/lib/notion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Brief email API received:', body);
    const { formType, name, email, company, briefData, briefId } = body;

    // Validate required fields
    if (!formType || !name || !email || !briefData) {
      console.error('Missing required fields:', { formType, name, email, briefData: !!briefData });
      return NextResponse.json(
        { error: 'Missing required fields: formType, name, email, briefData' },
        { status: 400 }
      );
    }

    // Validate form type
    if (!['website', 'graphic', 'photo'].includes(formType)) {
      return NextResponse.json(
        { error: 'Invalid form type. Must be: website, graphic, or photo' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Prepare data
    const briefDataObj: BriefData = {
      formType,
      name,
      email,
      company: company || '',
      briefData
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
      briefId: notionBriefId
    });

  } catch (error) {
    console.error('Email sending error:', error);
    
    // Check if it's an email-specific error
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