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
    
    const properties = Object.entries(database.properties).map(([name, prop]) => ({
      name,
      type: (prop as { type: string }).type,
      id: (prop as { id: string }).id
    }));
    
    return NextResponse.json({
      databaseTitle: database.title[0]?.plain_text || 'Untitled',
      properties,
      totalProperties: properties.length
    });

  } catch (error) {
    console.error('Database check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check database' },
      { status: 500 }
    );
  }
}