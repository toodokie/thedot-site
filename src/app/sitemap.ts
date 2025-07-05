import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://thedotcreative.co';
  
  // Static pages with priority and change frequency
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/contacts`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/services`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/brief`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/estimate`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }
  ];

  // Dynamic project pages - get from your projects lib
  let projectPages: any[] = [];
  try {
    // Import your projects function if available
    const { getProjectSlugs } = await import('@/lib/projects');
    const projectSlugs = await getProjectSlugs();
    
    projectPages = projectSlugs.map((slug: string) => ({
      url: `${baseUrl}/projects/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch (error) {
    // Fallback: add known project slugs manually if projects lib not ready
    const knownProjects = ['capital-3', 'giardino-flower-shop', 'lido', 'creative-design', 'test-project'];
    projectPages = knownProjects.map((slug: string) => ({
      url: `${baseUrl}/projects/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  }

  // Dynamic blog pages
  let blogPages: any[] = [];
  try {
    // Try to get blog posts from API or static data
    const response = await fetch(`${baseUrl}/api/blog/posts`);
    if (response.ok) {
      const data = await response.json();
      blogPages = data.posts.map((post: any) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.date || new Date()),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));
    }
  } catch (error) {
    // Fallback: add sample blog posts if API not ready
    const sampleBlogSlugs = [
      'gta-small-business-website-mistakes',
      'the-power-of-visual-storytelling', 
      'responsive-design-best-practices',
      'color-psychology-in-branding',
      'future-of-web-design'
    ];
    blogPages = sampleBlogSlugs.map((slug: string) => ({
      url: `${baseUrl}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  }

  return [...staticPages, ...projectPages, ...blogPages];
}