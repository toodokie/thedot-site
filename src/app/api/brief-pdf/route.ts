import { NextRequest, NextResponse } from 'next/server';
import { generateBriefPDF, generateSimpleBriefHTML } from '@/lib/pdf';
import { updateBriefAction, BriefData } from '@/lib/notion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formType, name, email, company, briefData, briefId, format = 'pdf' } = body;

    // Validate required fields
    if (!formType || !name || !email || !briefData) {
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

    // Prepare data
    const briefDataObj: BriefData = {
      formType,
      name,
      email,
      company: company || '',
      briefData
    };

    if (format === 'html') {
      // Generate HTML version for simple display
      const htmlContent = generateSimpleBriefHTML(briefDataObj);
      
      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    } else {
      // Generate PDF
      const pdfBuffer = generateBriefPDF(briefDataObj);

      // Update Notion if briefId is provided
      if (briefId) {
        try {
          await updateBriefAction(briefId, 'pdf_download');
        } catch (error) {
          console.error('Failed to update Notion:', error);
          // Don't fail the PDF generation if Notion update fails
        }
      }

      const filename = `brief-${formType}-${name.replace(/\s+/g, '-')}-${Date.now()}.pdf`;

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