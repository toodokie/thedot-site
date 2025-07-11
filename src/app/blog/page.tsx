import BlogPage from '@/components/BlogPage';

export const metadata = {
  title: 'Creative Insights - The Dot Creative Agency Blog',
  description: 'Discover the latest trends, strategies, and stories from the world of creative design. Expert insights on branding, web design, and digital strategy.',
  keywords: 'design blog, creative insights, branding tips, web design trends, digital strategy, creative agency blog',
  alternates: {
    canonical: 'https://www.thedotcreative.co/blog',
  },
};

export default function Blog() {
  return <BlogPage />;
}