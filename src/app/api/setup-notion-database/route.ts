import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export async function GET() {
  try {
    const databaseId = process.env.NOTION_CALCULATOR_LEADS_DB_ID;
    
    if (!databaseId) {
      return NextResponse.json({ error: 'Database ID not configured' }, { status: 400 });
    }

    // Get current database structure
    const database = await notion.databases.retrieve({ database_id: databaseId });
    
    const currentProperties = Object.keys(database.properties);
    
    const requiredProperties = [
      'Name', 'Email', 'Company', 'Phone', 'Service Type', 
      'Action', 'Lead Score', 'Temperature', 'Estimate Amount',
      'Date Created', 'Status', 'Project Selections', 'Message', 'Source'
    ];
    
    const missingProperties = requiredProperties.filter(prop => !currentProperties.includes(prop));
    
    return NextResponse.json({
      currentProperties,
      requiredProperties,
      missingProperties,
      databaseUrl: `https://notion.so/${databaseId.replace(/-/g, '')}`,
      instructions: {
        message: 'Your Notion database is missing required properties. Please add these columns:',
        steps: [
          '1. Open your Notion database',
          '2. Click the "+" button to add new properties (columns)',
          '3. Add each missing property with the correct type:',
          '',
          'Missing Properties to Add:',
          ...missingProperties.map(prop => {
            const type = getPropertyType(prop);
            return `- ${prop} (${type})`;
          }),
          '',
          '4. After adding all properties, test the calculator again'
        ]
      }
    });

  } catch (error) {
    console.error('Database setup error:', error);
    return NextResponse.json(
      { error: 'Failed to check database structure' },
      { status: 500 }
    );
  }
}

function getPropertyType(propertyName: string): string {
  const types: { [key: string]: string } = {
    'Name': 'Title',
    'Email': 'Email',
    'Company': 'Text',
    'Phone': 'Phone',
    'Service Type': 'Select (with options: Website Development, Graphic Design, Photo & Video Production)',
    'Action': 'Select (with options: PDF Download, Email Request, Contact Request)',
    'Lead Score': 'Number',
    'Temperature': 'Select (with options: Cold, Warm, Hot)',
    'Estimate Amount': 'Number (Currency - CAD)',
    'Date Created': 'Date',
    'Status': 'Select (with options: New, Contacted, Qualified, Proposal Sent, Won, Lost)',
    'Project Selections': 'Text',
    'Message': 'Text',
    'Source': 'Select (with options: Calculator, Contact Form, Direct Inquiry)'
  };
  
  return types[propertyName] || 'Text';
}