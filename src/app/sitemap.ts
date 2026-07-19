import type { MetadataRoute } from 'next';
import { getPublishedBlogSlugs } from '@/lib/notion';
import { getProjectSlugs } from '@/lib/projects';

// Re-generate hourly so newly published blog posts appear without a redeploy.
export const revalidate = 3600;

const baseUrl = 'https://www.thedotcreative.co';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${baseUrl}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/contacts`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/brief`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/estimate`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/tools/ai-visibility`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // Project pages — real slugs from the portfolio data (no placeholder fallback).
  let projectPages: MetadataRoute.Sitemap = [];
  try {
    const slugs = await getProjectSlugs();
    projectPages = slugs.map((slug) => ({
      url: `${baseUrl}/projects/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch {
    projectPages = [];
  }

  // Blog posts — real published posts straight from Notion.
  // (Never emit hardcoded placeholder slugs; a broken source yields [] instead of 404s.)
  const posts = await getPublishedBlogSlugs();
  const blogPages: MetadataRoute.Sitemap = posts.map(({ slug, lastModified }) => ({
    url: `${baseUrl}/blog/${slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...projectPages, ...blogPages];
}
