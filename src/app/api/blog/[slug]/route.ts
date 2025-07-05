import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_BLOG_TOKEN,
});

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

    const post = {
      id: page.id,
      title: properties.Title?.title?.[0]?.plain_text || '',
      slug: properties.Slug?.rich_text?.[0]?.plain_text || '',
      excerpt: properties.Excerpt?.rich_text?.[0]?.plain_text || '',
      content: properties.Content?.rich_text?.map((text: any) => text.plain_text).join('') || '',
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