// Featured-post cover images come from Notion as signed S3 URLs that EXPIRE.
// For known featured posts we substitute locally-hosted covers under
// /public/images/blog/<slug>/. Shared by the server blog page (SSR) and the
// client BlogPage component so both render the same, stable image.
//
// NOTE: no 'use client' — this must be importable by a Server Component.

export interface BlogPostLike {
  slug: string;
  title: string;
  featured?: boolean;
  featuredImage?: string;
}

export function normalizeFeaturedImages<T extends BlogPostLike>(posts: T[]): T[] {
  return posts.map((post) => {
    if (!post.featured) return post;

    const slug = post.slug || '';
    const title = (post.title || '').toLowerCase();

    if (slug.includes('emotional-brand') || title.includes('emotional brand')) {
      return { ...post, featuredImage: '/images/blog/emotional-brand-strategy-306-percent-lifetime-value-ontario-business/emotional-brand-800x600 px.webp' };
    }
    if (slug.includes('software-subscription') || title.includes('software subscription')) {
      return { ...post, featuredImage: '/images/blog/software-subscription-trap-ontario-business/software-subscription-trap-ontario-business 800.webp' };
    }
    if (slug.includes('website-design-trends') || title.includes('website design trends')) {
      return { ...post, featuredImage: '/images/blog/website-design-trends-europe/Website Design Trends.webp' };
    }
    if (slug.includes('website-mistakes') || title.includes('gta small business')) {
      return { ...post, featuredImage: '/images/blog/website-mistakes-gta-businesses/hero-hourglass.gif' };
    }
    if (slug.includes('true-cost-of-free') || title.includes('true cost of free') || title.includes('manual work')) {
      return { ...post, featuredImage: '/images/blog/the-true-cost-of-free-manual-work/the-true-cost-of-free-manual-work.webp' };
    }

    // Fallback: replace an expiring S3 URL with a safe local image.
    return {
      ...post,
      featuredImage:
        post.featuredImage && post.featuredImage.includes('prod-files-secure.s3.us-west-2.amazonaws.com')
          ? '/images/blog/emotional-brand-strategy-306-percent-lifetime-value-ontario-business/emotional-brand-800x600 px.webp'
          : post.featuredImage,
    };
  });
}
