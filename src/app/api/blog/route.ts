import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_BLOG_TOKEN,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const featured = searchParams.get('featured');
    const slug = searchParams.get('slug');
    const includeContent = searchParams.get('includeContent') === 'true';

    // Base query filter for published posts
    const filter: any = {
      and: [
        {
          property: 'Status',
          select: {
            equals: 'Published'
          }
        }
      ]
    };

    // Add category filter if specified
    if (category && category !== 'All') {
      filter.and.push({
        property: 'Category',
        select: {
          equals: category
        }
      });
    }

    // Add featured filter if specified
    if (featured === 'true') {
      filter.and.push({
        property: 'Featured',
        checkbox: {
          equals: true
        }
      });
    }

    // Add slug filter if specified (for single post)
    if (slug) {
      filter.and.push({
        property: 'Slug',
        rich_text: {
          equals: slug
        }
      });
    }

    const response = await notion.databases.query({
      database_id: process.env.NOTION_BLOG_DATABASE_ID!,
      filter,
      sorts: [
        {
          property: 'Date',
          direction: 'descending'
        }
      ]
    });

    const posts = response.results.map((page: any) => {
      const properties = page.properties;
      
      // Always include essential fields
      const post: any = {
        id: page.id,
        title: properties.Title?.title?.[0]?.plain_text || '',
        slug: properties.Slug?.rich_text?.[0]?.plain_text || '',
        excerpt: properties.Excerpt?.rich_text?.[0]?.plain_text || '',
        category: properties.Category?.select?.name || '',
        date: properties.Date?.date?.start || '',
        featured: properties.Featured?.checkbox || false,
        readTime: properties['Read Time']?.number || 0,
        featuredImage: properties['Featured Image']?.files?.[0]?.file?.url || 
                      properties['Featured Image']?.files?.[0]?.external?.url || '',
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time
      };

      // Conditionally include heavy fields only when requested
      if (includeContent) {
        post.content = properties.Content?.rich_text?.map((text: any) => text.plain_text).join('') || '';
        post.tags = properties.Tags?.multi_select?.map((tag: any) => tag.name) || [];
        post.status = properties.Status?.select?.name || '';
        post.metaTitle = properties['Meta Title']?.rich_text?.[0]?.plain_text || '';
        post.metaDescription = properties['Meta Description']?.rich_text?.[0]?.plain_text || '';
        post.socialImage = properties['Social Image']?.files?.[0]?.file?.url || 
                          properties['Social Image']?.files?.[0]?.external?.url || '';
        post.wordCount = properties['Word Count']?.number || 0;
      }

      return post;
    });

    return NextResponse.json({ posts }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, s-maxage=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        'Content-Type': 'application/json; charset=utf-8',
        'Vary': 'Accept-Encoding'
      }
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blog posts' },
      { status: 500 }
    );
  }
}