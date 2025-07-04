import { NextRequest, NextResponse } from 'next/server';
import { sendClientEmail, generateAgencyEmailTemplate, transporter } from '@/lib/email';
import { updateBriefAction, BriefData, saveBriefToNotion } from '@/lib/notion';

export async function POST(request: NextRequest) {
  console.log('=== DISCUSSION REQUEST API STARTED ===');
  try {
    const body = await request.json();
    console.log('Discussion request API received:', body);
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

    // Skip PDF generation for now to test email
    console.log('Skipping PDF generation for testing...');
    
    // Send professional agency email with proper formatting
    try {
      console.log('Sending agency email with proper formatting...');
      const htmlContent = generateAgencyEmailTemplate(briefDataObj);
      
      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: process.env.AGENCY_EMAIL,
        subject: `🚨 NEW PROJECT BRIEF: ${briefDataObj.formType.toUpperCase()} - ${briefDataObj.name} (Discussion Requested)`,
        html: htmlContent,
      });
      console.log('Agency email sent successfully');
    } catch (agencyEmailError) {
      console.error('Agency email failed:', agencyEmailError);
      throw new Error('Failed to send agency notification email');
    }

    // Send confirmation email to client
    try {
      console.log('Sending client confirmation email...');
      await sendClientEmail(briefDataObj);
      console.log('Client confirmation email sent successfully');
    } catch (clientEmailError) {
      console.error('Client email failed:', clientEmailError);
      throw new Error('Failed to send client confirmation email');
    }

    // Update Notion with discussion request action and highest lead score
    let notionBriefId = briefId;
    try {
      if (!notionBriefId) {
        // If no briefId provided, create new entry
        console.log('Creating new Notion entry for discussion request...');
        console.log('Notion database ID:', process.env.NOTION_PROJECT_BRIEFS_DB_ID);
        console.log('Data being sent to Notion:', {
          formType: briefDataObj.formType,
          name: briefDataObj.name,
          email: briefDataObj.email,
          company: briefDataObj.company,
          briefDataKeys: Object.keys(briefDataObj.briefData)
        });
        notionBriefId = await saveBriefToNotion(briefDataObj, 'discussion_request');
        console.log('Notion save completed with ID:', notionBriefId);
      } else {
        // Update existing entry
        console.log('Updating existing Notion entry for discussion request...');
        await updateBriefAction(notionBriefId, 'discussion_request');
      }
      console.log('Notion update successful, briefId:', notionBriefId);
    } catch (notionError) {
      console.error('=== NOTION ERROR DETAILS ===');
      console.error('Notion update failed (but emails were sent):', notionError);
      if (notionError instanceof Error) {
        console.error('Error message:', notionError.message);
        console.error('Error stack:', notionError.stack);
      }
      console.error('=== END NOTION ERROR ===');
      // Don't fail the whole request if Notion fails
    }

    return NextResponse.json({
      success: true,
      message: 'Discussion request sent successfully. We will contact you within 24 hours.',
      briefId: notionBriefId
    });

  } catch (error) {
    console.error('=== DISCUSSION REQUEST API ERROR ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Full error object:', error);
    
    // Check if it's an email-specific error
    if (error instanceof Error) {
      if (error.message.includes('Invalid email') || error.message.includes('SMTP')) {
        console.error('SMTP/Email error detected');
        return NextResponse.json(
          { error: 'Failed to send discussion request. Please check the email address and try again.' },
          { status: 400 }
        );
      }
      
      if (error.message.includes('PDF') || error.message.includes('generate')) {
        console.error('PDF generation error detected');
        return NextResponse.json(
          { error: 'Failed to generate project brief. Please try again.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to send discussion request. Please try again.' },
      { status: 500 }
    );
  }
}