import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function GET() {
  try {
    
    return NextResponse.json({
      nodemailerType: typeof nodemailer,
      nodemailerKeys: Object.keys(nodemailer),
      hasCreateTransporter: 'createTransporter' in nodemailer,
      createTransporterType: typeof nodemailer.createTransporter,
      nodemailerString: nodemailer.toString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null
    }, { status: 500 });
  }
}