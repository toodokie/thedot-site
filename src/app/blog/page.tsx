import BlogPage from '@/components/BlogPage';
import { normalizeFeaturedImages } from '@/lib/blog-images';

export const metadata = {
  title: 'Creative Insights - The Dot Creative Agency Blog',
  description: 'Discover the latest trends, strategies, and stories from the world of creative design. Expert insights on branding, web design, and digital strategy.',
  keywords: 'design blog, creative insights, branding tips, web design trends, digital strategy, creative agency blog',
  alternates: {
    canonical: '/blog',
  },
};

// Re-fetch on the server every 5 minutes so newly published posts appear
// (and the list is in the server-rendered HTML for crawlers) without a redeploy.
export const revalidate = 300;

async function getInitialPosts() {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://www.thedotcreative.co'
        : 'http://localhost:3000');
    const res = await fetch(`${baseUrl}/api/blog`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    return normalizeFeaturedImages(data.posts || []);
  } catch {
    return [];
  }
}

export default async function Blog() {
  const initialPosts = await getInitialPosts();
  return <BlogPage initialPosts={initialPosts} />;
}
