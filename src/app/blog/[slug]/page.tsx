import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogPostPage from '@/components/BlogPostPage';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  date: string;
  readTime: number;
  featuredImage: string;
  metaTitle: string;
  metaDescription: string;
  socialImage: string;
  wordCount: number;
}

interface BlogPostProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getBlogPost(slug: string): Promise<BlogPost | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                   (process.env.NODE_ENV === 'production' 
                     ? 'https://thedotcreative.co' 
                     : 'http://localhost:3000');
    
    const response = await fetch(`${baseUrl}/api/blog/${slug}`, {
      next: { revalidate: 300 } // Revalidate every 5 minutes
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.post;
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return null;
  }
}

export async function generateMetadata({ params }: BlogPostProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  
  if (!post) {
    return {
      title: 'Blog Post Not Found | The Dot Creative Agency',
      description: 'The requested blog post could not be found.'
    };
  }

  const metaTitle = post.metaTitle || `${post.title} | The Dot Creative Blog`;
  const metaDescription = post.metaDescription || post.excerpt;
  const socialImage = post.socialImage || post.featuredImage || '/images/og-image.jpg';

  return {
    title: metaTitle,
    description: metaDescription,
    keywords: post.tags.join(', '),
    
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: `https://thedotcreative.co/blog/${post.slug}`,
      siteName: 'The Dot Creative Agency',
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: post.title
        }
      ],
      locale: 'en_CA',
      type: 'article',
      publishedTime: post.date,
      section: post.category,
      tags: post.tags
    },
    
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDescription,
      images: [socialImage]
    },
    
    robots: {
      index: true,
      follow: true
    }
  };
}

export default async function BlogPost({ params }: BlogPostProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  
  if (!post) {
    notFound();
  }
  
  return <BlogPostPage post={post} />;
}