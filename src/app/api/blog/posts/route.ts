import { NextRequest, NextResponse } from 'next/server';

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: string;
  featured?: boolean;
}

// Sample blog posts data
// In a real implementation, this would come from a CMS, database, or markdown files
const samplePosts: BlogPost[] = [
  {
    slug: 'website-design-trends-europe-canadian-businesses',
    title: 'Website Design Trends from Europe That Canadian Businesses Should Adopt',
    excerpt: 'Research reveals Canadian sites trail European standards by 28% in loading speed and 33% in accessibility. Learn international best practices that increase conversions.',
    date: 'January 1, 2025',
    category: 'Strategy',
    readTime: '12 min read',
    featured: true
  },
  {
    slug: 'gta-small-business-website-mistakes',
    title: '5 Website Mistakes Costing GTA Small Businesses Customers (And How to Fix Them)',
    excerpt: 'Research shows 94% of negative website feedback is design-related. Discover the critical mistakes costing GTA small businesses customers and proven solutions.',
    date: 'January 12, 2025',
    category: 'Strategy',
    readTime: '8 min read'
  },
  {
    slug: 'the-power-of-visual-storytelling',
    title: 'The Power of Visual Storytelling in Brand Design',
    excerpt: 'Discover how compelling visual narratives can transform your brand identity and create deeper connections with your audience.',
    date: 'March 15, 2024',
    category: 'Design',
    readTime: '5 min read'
  },
  {
    slug: 'responsive-design-best-practices',
    title: 'Responsive Design Best Practices for 2024',
    excerpt: 'Learn the essential principles and techniques for creating websites that work seamlessly across all devices.',
    date: 'March 10, 2024',
    category: 'Development',
    readTime: '7 min read'
  },
  {
    slug: 'color-psychology-in-branding',
    title: 'Color Psychology: How Colors Influence Brand Perception',
    excerpt: 'Explore the psychological impact of color choices and how to leverage them for stronger brand communication.',
    date: 'March 5, 2024',
    category: 'Strategy',
    readTime: '6 min read'
  },
  {
    slug: 'future-of-web-design',
    title: 'The Future of Web Design: Trends to Watch',
    excerpt: 'A comprehensive look at emerging design trends that will shape the digital landscape in the coming years.',
    date: 'February 28, 2024',
    category: 'Industry Insights',
    readTime: '8 min read'
  },
  {
    slug: 'effective-logo-design-principles',
    title: 'Effective Logo Design: Principles That Work',
    excerpt: 'Master the fundamental principles of logo design that create memorable and impactful brand identities.',
    date: 'February 20, 2024',
    category: 'Design',
    readTime: '4 min read'
  },
  {
    slug: 'user-experience-optimization',
    title: 'User Experience Optimization for Higher Conversions',
    excerpt: 'Learn how strategic UX improvements can significantly boost your website\'s conversion rates and user satisfaction.',
    date: 'February 15, 2024',
    category: 'Development',
    readTime: '6 min read'
  }
];

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    let filteredPosts = samplePosts;
    
    // Filter by category if specified
    if (category && category !== 'All') {
      filteredPosts = samplePosts.filter(post => post.category === category);
    }
    
    // Limit results
    filteredPosts = filteredPosts.slice(0, limit);
    
    return NextResponse.json({
      success: true,
      posts: filteredPosts,
      total: filteredPosts.length
    });
    
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blog posts' },
      { status: 500 }
    );
  }
}