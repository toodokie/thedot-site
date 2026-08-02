import type { MetadataRoute } from 'next';
import { getPublishedBlogSlugs } from '@/lib/notion';
import { getProjectSlugs } from '@/lib/projects';

// Re-generate hourly so newly published blog posts appear without a redeploy.
export const revalidate = 3600;

const baseUrl = 'https://www.thedotcreative.co';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // NOTE: static/project pages intentionally omit `lastModified`. We don't track a
  // real per-page content-modified date for them, and stamping `new Date()` (which
  // changes every revalidate) is a misleading freshness signal. Blog posts below
  // carry their real Notion last-edited date.
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${baseUrl}/services`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/services/web-design-business-systems`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/workflow-automation`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/aoda-web-accessibility`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/managed-website-growth`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/ai-visibility-audit`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/contacts`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/brief`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/estimate`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/blog`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/tools/ai-visibility`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // Project pages — real slugs from the portfolio data (no placeholder fallback).
  let projectPages: MetadataRoute.Sitemap = [];
  try {
    const slugs = await getProjectSlugs();
    projectPages = slugs.map((slug) => ({
      url: `${baseUrl}/projects/${slug}`,
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
