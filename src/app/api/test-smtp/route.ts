import { NextResponse } from 'next/server';
import { transporter } from '../../../lib/email';

export async function GET() {
  try {
    console.log('Testing SMTP connection...');

    // Test the connection
    await transporter.verify();
    console.log('SMTP connection successful');

    // Send a test email
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.AGENCY_EMAIL,
      subject: 'SMTP Test - Calculator Lead System',
      text: 'This is a test email to verify SMTP configuration is working.',
    });

    console.log('Test email sent:', info.messageId);

    return NextResponse.json({
      success: true,
      message: 'SMTP connection and email sending successful',
      messageId: info.messageId,
      config: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        from: process.env.FROM_EMAIL,
        to: process.env.AGENCY_EMAIL
      }
    });

  } catch (error) {
    console.error('SMTP test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      config: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        hasPassword: !!process.env.SMTP_PASS,
        passwordLength: process.env.SMTP_PASS?.length
      }
    }, { status: 500 });
  }
}