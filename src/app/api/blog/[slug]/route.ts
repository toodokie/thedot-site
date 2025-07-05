import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_BLOG_TOKEN,
});

// Helper function to extract full content from Notion page
async function getFullPageContent(pageId: string): Promise<string> {
  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
    });
    
    let content = '';
    for (const block of response.results) {
      const blockData = block as any;
      
      // Handle different block types
      if (blockData.type === 'paragraph' && blockData.paragraph?.rich_text) {
        const text = blockData.paragraph.rich_text.map((t: any) => t.plain_text).join('');
        content += text + '\n\n';
      } else if (blockData.type === 'heading_1' && blockData.heading_1?.rich_text) {
        const text = blockData.heading_1.rich_text.map((t: any) => t.plain_text).join('');
        content += `# ${text}\n\n`;
      } else if (blockData.type === 'heading_2' && blockData.heading_2?.rich_text) {
        const text = blockData.heading_2.rich_text.map((t: any) => t.plain_text).join('');
        content += `## ${text}\n\n`;
      } else if (blockData.type === 'heading_3' && blockData.heading_3?.rich_text) {
        const text = blockData.heading_3.rich_text.map((t: any) => t.plain_text).join('');
        content += `### ${text}\n\n`;
      } else if (blockData.type === 'bulleted_list_item' && blockData.bulleted_list_item?.rich_text) {
        const text = blockData.bulleted_list_item.rich_text.map((t: any) => t.plain_text).join('');
        content += `• ${text}\n`;
      } else if (blockData.type === 'numbered_list_item' && blockData.numbered_list_item?.rich_text) {
        const text = blockData.numbered_list_item.rich_text.map((t: any) => t.plain_text).join('');
        content += `1. ${text}\n`;
      }
    }
    
    return content.trim();
  } catch (error) {
    console.error('Error fetching page content:', error);
    return '';
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    const response = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DATABASE_ID!,
      filter: {
        and: [
          {
            property: 'Status',
            select: {
              equals: 'Published'
            }
          },
          {
            property: 'Slug',
            rich_text: {
              equals: slug
            }
          }
        ]
      }
    });

    if (response.results.length === 0) {
      return NextResponse.json(
        { error: 'Blog post not found' },
        { status: 404 }
      );
    }

    const page: any = response.results[0];
    const properties = page.properties;

    // Get full content from page blocks
    const fullContent = await getFullPageContent(page.id);
    const fallbackContent = properties.Content?.rich_text?.map((text: any) => text.plain_text).join('') || '';

    const post = {
      id: page.id,
      title: properties.Title?.title?.[0]?.plain_text || '',
      slug: properties.Slug?.rich_text?.[0]?.plain_text || '',
      excerpt: properties.Excerpt?.rich_text?.[0]?.plain_text || '',
      content: fullContent || fallbackContent,
      category: properties.Category?.select?.name || '',
      tags: properties.Tags?.multi_select?.map((tag: any) => tag.name) || [],
      date: properties.Date?.date?.start || '',
      status: properties.Status?.select?.name || '',
      featured: properties.Featured?.checkbox || false,
      readTime: properties['Read Time']?.number || 0,
      featuredImage: properties['Featured Image']?.files?.[0]?.file?.url || 
                    properties['Featured Image']?.files?.[0]?.external?.url || '',
      metaTitle: properties['Meta Title']?.rich_text?.[0]?.plain_text || '',
      metaDescription: properties['Meta Description']?.rich_text?.[0]?.plain_text || '',
      socialImage: properties['Social Image']?.files?.[0]?.file?.url || 
                  properties['Social Image']?.files?.[0]?.external?.url || '',
      wordCount: properties['Word Count']?.number || 0,
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time
    };

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blog post' },
      { status: 500 }
    );
  }
}