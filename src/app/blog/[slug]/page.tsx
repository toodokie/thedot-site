import BlogPostPage from '@/components/BlogPostPage';

interface BlogPostProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: BlogPostProps) {
  const { slug } = await params;
  
  // SEO metadata for specific posts
  if (slug === 'website-design-trends-europe-canadian-businesses') {
    return {
      title: 'Website Design Trends from Europe That Canadian Businesses Should Adopt',
      description: 'Research reveals Canadian sites trail European standards by 28% in loading speed and 33% in accessibility. Learn international best practices that increase conversions.',
      keywords: 'professional website design trends Canada, European design trends, Canadian business websites, international website standards, website design best practices',
      openGraph: {
        title: 'Website Design Trends from Europe That Canadian Businesses Should Adopt',
        description: 'Research reveals Canadian sites trail European standards by 28% in loading speed and 33% in accessibility. Learn international best practices that increase conversions.',
        type: 'article',
        publishedTime: '2025-01-01T00:00:00.000Z',
        authors: ['The Dot Creative Agency'],
        tags: ['Professional Website Design', 'Canada', 'European Design Trends', 'Conversion Optimization', 'International Standards'],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Website Design Trends from Europe That Canadian Businesses Should Adopt',
        description: 'Research reveals Canadian sites trail European standards by 28% in loading speed and 33% in accessibility. Learn international best practices that increase conversions.',
      }
    };
  }
  
  if (slug === 'gta-small-business-website-mistakes') {
    return {
      title: '5 Website Mistakes Costing GTA Small Businesses Customers (And How to Fix Them)',
      description: 'Research shows 94% of negative website feedback is design-related. Discover the critical mistakes costing GTA small businesses customers and proven solutions.',
      keywords: 'GTA small business website mistakes, Toronto website design, small business web development, website optimization GTA, business website errors',
      openGraph: {
        title: '5 Website Mistakes Costing GTA Small Businesses Customers (And How to Fix Them)',
        description: 'Research shows 94% of negative website feedback is design-related. Discover the critical mistakes costing GTA small businesses customers and proven solutions.',
        type: 'article',
        publishedTime: '2025-01-12T00:00:00.000Z',
        authors: ['The Dot Creative Agency'],
        tags: ['Small Business', 'GTA', 'Website Design', 'User Experience', 'Conversion Optimization'],
      },
      twitter: {
        card: 'summary_large_image',
        title: '5 Website Mistakes Costing GTA Small Businesses Customers (And How to Fix Them)',
        description: 'Research shows 94% of negative website feedback is design-related. Discover the critical mistakes costing GTA small businesses customers and proven solutions.',
      }
    };
  }
  
  // Default metadata for other posts
  return {
    title: `Blog Post - The Dot Creative Agency`,
    description: 'Creative insights and strategies from The Dot Creative Agency.',
  };
}

export default async function BlogPost({ params }: BlogPostProps) {
  const { slug } = await params;
  return <BlogPostPage slug={slug} />;
}