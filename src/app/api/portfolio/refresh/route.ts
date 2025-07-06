import { NextRequest, NextResponse } from 'next/server';
import { getProjects } from '@/lib/notion';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Refreshing portfolio data from Notion...');
    
    // Get fresh data from Notion
    const projects = await getProjects();
    
    if (projects.length === 0) {
      return NextResponse.json({ error: 'No projects found in Notion' }, { status: 404 });
    }

    // Create portfolio directory if it doesn't exist
    const portfolioDir = path.join(process.cwd(), 'src', 'data', 'portfolio');
    if (!fs.existsSync(portfolioDir)) {
      fs.mkdirSync(portfolioDir, { recursive: true });
    }

    // Save each project to JSON file
    const savedProjects = [];
    for (const project of projects) {
      const filePath = path.join(portfolioDir, `${project.slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(project, null, 2));
      savedProjects.push(project.slug);
      console.log(`📄 Saved ${project.slug}.json`);
    }

    console.log(`✅ Successfully refreshed ${savedProjects.length} projects`);

    return NextResponse.json({ 
      success: true, 
      message: `Refreshed ${savedProjects.length} projects`,
      projects: savedProjects,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error refreshing portfolio:', error);
    return NextResponse.json(
      { error: 'Failed to refresh portfolio data' },
      { status: 500 }
    );
  }
}