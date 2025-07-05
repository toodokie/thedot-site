'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import Footer from './Footer';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: number;
  tags: string[];
  featuredImage: string;
  metaTitle: string;
  metaDescription: string;
  socialImage: string;
  wordCount: number;
}

interface BlogPostPageProps {
  post: BlogPost;
}

export default function BlogPostPage({ post }: BlogPostPageProps) {
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [nextPost, setNextPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRelatedAndNextPosts = async () => {
      try {
        // Fetch all posts to find next article
        const allPostsResponse = await fetch('/api/blog');
        if (allPostsResponse.ok) {
          const allData = await allPostsResponse.json();
          const allPosts = allData.posts;
          
          // Find current post index
          const currentIndex = allPosts.findIndex((p: BlogPost) => p.id === post.id);
          
          // Get next post (next in chronological order)
          if (currentIndex > 0) {
            setNextPost(allPosts[currentIndex - 1]);
          } else if (allPosts.length > 1) {
            // If this is the latest post, suggest the second latest
            setNextPost(allPosts[1]);
          }
        }

        // Fetch related posts by category
        const response = await fetch(`/api/blog?category=${post.category}`);
        if (response.ok) {
          const data = await response.json();
          // Filter out current post and limit to 3 related posts
          const related = data.posts.filter((p: BlogPost) => p.id !== post.id).slice(0, 3);
          setRelatedPosts(related);
        }
      } catch (error) {
        console.error('Error fetching related posts:', error);
        setRelatedPosts([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRelatedAndNextPosts();
  }, [post.category, post.id]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="error-container">
        <h1>Post not found</h1>
        <Link href="/blog">← Back to Blog</Link>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .post-container {
          background-color: var(--raw-white);
          min-height: 100vh;
          font-family: ff-real-text-pro-2, sans-serif;
        }
        
        
        .breadcrumb {
          max-width: 1200px;
          margin: 0 auto;
          padding: 120px 20px 20px;
        }
        
        .breadcrumb a {
          color: #666;
          text-decoration: none;
          font-size: 0.9rem;
        }
        
        .breadcrumb a:hover {
          color: var(--black);
        }
        
        .post-header {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px 60px;
          text-align: left;
        }
        
        .post-category {
          background: var(--yellow);
          color: var(--black);
          padding: 6px 16px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: inline-block;
          margin-bottom: 20px;
        }
        
        .post-title {
          font-family: futura-pt, sans-serif;
          font-size: 3.5rem;
          font-weight: 400;
          color: var(--black);
          line-height: 1.2;
          margin-bottom: 20px;
        }
        
        .post-meta {
          display: flex;
          justify-content: flex-start;
          gap: 20px;
          font-size: 0.95rem;
          color: #666;
          margin-bottom: 30px;
        }
        
        .post-excerpt {
          font-size: 1.2rem;
          color: #555;
          line-height: 1.6;
          font-style: italic;
          border-left: 4px solid var(--yellow);
          padding-left: 20px;
          margin: 0;
          text-align: left;
        }
        
        .post-featured-image {
          max-width: 1200px;
          margin: 40px auto;
          padding: 0 20px;
        }
        
        .post-featured-image img {
          width: 100%;
          height: auto;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        
        .post-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          line-height: 1.8;
          font-size: 1.1rem;
          color: #333;
          text-align: left;
        }
        
        .post-content h2 {
          font-family: futura-pt, sans-serif;
          font-size: 2rem;
          font-weight: 400;
          color: var(--black);
          margin: 50px 0 25px;
          line-height: 1.3;
        }
        
        .post-content h3 {
          font-family: futura-pt, sans-serif;
          font-size: 1.5rem;
          font-weight: 400;
          color: var(--black);
          margin: 40px 0 20px;
        }
        
        .post-content p {
          margin-bottom: 25px;
        }
        
        .post-content blockquote {
          background: #f8f9fa;
          border-left: 4px solid var(--yellow);
          padding: 25px 30px;
          margin: 40px 0;
          font-style: italic;
          font-size: 1.15rem;
          text-align: center;
        }
        
        .post-content ul, .post-content ol {
          padding-left: 30px;
          margin-bottom: 25px;
        }
        
        .post-content li {
          margin-bottom: 10px;
        }
        
        .post-content strong {
          font-weight: 600;
          color: var(--black);
        }
        
        .post-content em {
          font-style: italic;
        }
        
        .post-content u {
          text-decoration: underline;
        }
        
        .post-content del {
          text-decoration: line-through;
        }
        
        .post-content code {
          background: #f4f4f4;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
          color: #d73502;
        }
        
        .post-content pre {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 30px 0;
          border-left: 4px solid var(--yellow);
        }
        
        .post-content pre code {
          background: none;
          padding: 0;
          color: #333;
          font-size: 0.9rem;
        }
        
        .post-content a {
          color: var(--black);
          text-decoration: underline;
          transition: color 0.3s ease;
        }
        
        .post-content a:hover {
          color: #666;
        }
        
        .post-content hr {
          border: none;
          height: 2px;
          background: #e0e0e0;
          margin: 40px 0;
        }
        
        .post-tags {
          max-width: 1200px;
          margin: 60px auto 0;
          padding: 0 20px;
        }
        
        .tags-title {
          font-weight: 600;
          margin-bottom: 15px;
          color: var(--black);
        }
        
        .tags-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        
        .tag {
          background: #f0f0f0;
          color: #666;
          padding: 8px 15px;
          font-size: 0.85rem;
          text-decoration: none;
          transition: all 0.3s ease;
        }
        
        .tag:hover {
          background: var(--yellow);
          color: var(--black);
        }
        
        .author-section {
          max-width: 700px;
          margin: 80px auto 0;
          padding: 40px 20px;
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
        }
        
        .author-content {
          display: flex;
          gap: 20px;
          align-items: center;
        }
        
        .author-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: var(--yellow);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1.5rem;
          color: var(--black);
        }
        
        .author-info h4 {
          font-family: futura-pt, sans-serif;
          font-size: 1.3rem;
          font-weight: 400;
          color: var(--black);
          margin-bottom: 5px;
        }
        
        .author-bio {
          color: #666;
          line-height: 1.5;
        }
        
        .related-posts {
          max-width: 1200px;
          margin: 100px auto 0;
          padding: 0 20px;
        }
        
        .related-title {
          font-family: futura-pt, sans-serif;
          font-size: 2.5rem;
          font-weight: 400;
          color: var(--black);
          text-align: center;
          margin-bottom: 50px;
        }
        
        .related-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 40px;
          margin-bottom: 80px;
        }
        
        .related-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 30px;
          text-decoration: none;
          color: inherit;
          transition: all 0.3s ease;
        }
        
        .related-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          border-color: var(--yellow);
        }
        
        .related-card h3 {
          font-family: futura-pt, sans-serif;
          font-size: 1.3rem;
          font-weight: 400;
          color: var(--black);
          margin-bottom: 10px;
          line-height: 1.3;
        }
        
        .related-meta {
          color: #666;
          font-size: 0.85rem;
          margin-bottom: 15px;
        }
        
        .related-excerpt {
          color: #555;
          line-height: 1.5;
          font-size: 0.95rem;
        }
        
        .next-article {
          max-width: 1200px;
          margin: 80px auto 0;
          padding: 0 20px;
          border-top: 2px solid #e0e0e0;
          padding-top: 60px;
        }
        
        .next-article-title {
          font-size: 1.1rem;
          color: #666;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 600;
        }
        
        .next-article-card {
          display: flex;
          gap: 30px;
          padding: 30px;
          background: #f8f9fa;
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          transition: all 0.3s ease;
          border: 2px solid transparent;
        }
        
        .next-article-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 48px rgba(0,0,0,0.1);
          border-color: var(--yellow);
          text-decoration: none;
          color: inherit;
        }
        
        .next-article-image {
          width: 200px;
          height: 120px;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
        }
        
        .next-article-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .next-article-content {
          flex: 1;
        }
        
        .next-article-category {
          background: var(--yellow);
          color: var(--black);
          padding: 4px 12px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: inline-block;
          margin-bottom: 15px;
          border-radius: 4px;
        }
        
        .next-article-post-title {
          font-family: futura-pt, sans-serif;
          font-size: 1.8rem;
          font-weight: 400;
          color: var(--black);
          line-height: 1.3;
          margin-bottom: 12px;
        }
        
        .next-article-excerpt {
          color: #666;
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 15px;
        }
        
        .next-article-meta {
          display: flex;
          gap: 15px;
          font-size: 0.9rem;
          color: #888;
        }
        
        .back-to-blog {
          text-align: center;
          margin: 60px 0;
        }
        
        .back-link {
          background: var(--black);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
          display: inline-block;
        }
        
        .back-link:hover {
          background: var(--yellow);
          color: var(--black);
          transform: translateY(-2px);
        }
        
        @media (max-width: 768px) {
          .post-title {
            font-size: 2.5rem;
          }
          
          .post-meta {
            flex-direction: column;
            gap: 10px;
          }
          
          .author-content {
            flex-direction: column;
            text-align: center;
          }
          
          .related-grid {
            grid-template-columns: 1fr;
          }
          
          .post-content {
            font-size: 1rem;
          }
        }
        
        :root {
          --white-smoke: #f8f8f8;
          --black: #35332f;
          --dim-grey: #47453f;
          --white-smoke-nav: #faf9f6b3;
          --white: #fafafa;
          --white-2: white;
          --raw-white: #faf9f6;
          --yellow: #daff00;
          --grey-2: #7a776f;
          --coral-nontr: #ff7432;
          --medium-aquamarine: #78c8af;
          --white-3: #fffefc;
          --grey: #8f7165;
          --dark-slate-grey: #1e4145;
          --rosy-brown: #c19d8f;
          --white-transp: #fafafac9;
          --white-smoke-2: #ebebe7;
          --beige: #ebead7;
          --antique-white: #dac9bb;
        }
      `}</style>

      <div className="post-container">
        {/* Breadcrumb */}
        <nav className="breadcrumb">
          <Link href="/blog">← Back to Blog</Link>
        </nav>

        {/* Post Header */}
        <header className="post-header">
          <div className="post-category">{post.category}</div>
          <h1 className="post-title">{post.title}</h1>
          <div className="post-meta">
            <span>{post.date}</span>
            <span>•</span>
            <span>{post.readTime} min read</span>
          </div>
          <div className="post-excerpt">{post.excerpt}</div>
        </header>

        {/* Featured Image */}
        {post.featuredImage && (
          <div className="post-featured-image">
            <img 
              src={post.featuredImage} 
              alt={post.title}
            />
          </div>
        )}

        {/* Post Content */}
        <article className="post-content" dangerouslySetInnerHTML={{ __html: post.content }} />

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="post-tags">
            <div className="tags-title">Tags:</div>
            <div className="tags-list">
              {post.tags.map(tag => (
                <Link key={tag} href={`/blog/tag/${tag.toLowerCase()}`} className="tag">
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Next Article */}
        {nextPost && (
          <section className="next-article">
            <div className="next-article-title">Next Article</div>
            <Link href={`/blog/${nextPost.slug}`} className="next-article-card">
              {nextPost.featuredImage && (
                <div className="next-article-image">
                  <img 
                    src={nextPost.featuredImage} 
                    alt={nextPost.title}
                  />
                </div>
              )}
              <div className="next-article-content">
                <div className="next-article-category">{nextPost.category}</div>
                <h3 className="next-article-post-title">{nextPost.title}</h3>
                <p className="next-article-excerpt">{nextPost.excerpt}</p>
                <div className="next-article-meta">
                  <span>{nextPost.date}</span>
                  <span>•</span>
                  <span>{nextPost.readTime} min read</span>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="related-posts">
            <h2 className="related-title">Related Articles</h2>
            <div className="related-grid">
              {relatedPosts.map(relatedPost => (
                <Link key={relatedPost.slug} href={`/blog/${relatedPost.slug}`} className="related-card">
                  <h3>{relatedPost.title}</h3>
                  <div className="related-meta">{relatedPost.date} • {relatedPost.readTime} min read</div>
                  <p className="related-excerpt">{relatedPost.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Back to Blog */}
        <div className="back-to-blog">
          <Link href="/blog" className="back-link">
            View All Articles
          </Link>
        </div>

        <Footer />
      </div>
    </>
  );
}

// Sample post content for demo
function getSamplePost(slug: string): BlogPost {
  const posts: { [key: string]: BlogPost } = {
    'the-power-of-visual-storytelling': {
      slug: 'the-power-of-visual-storytelling',
      title: 'The Power of Visual Storytelling in Brand Design',
      excerpt: 'Discover how compelling visual narratives can transform your brand identity and create deeper connections with your audience.',
      date: 'March 15, 2024',
      category: 'Design',
      readTime: '5 min read',
      tags: ['Branding', 'Visual Design', 'Storytelling', 'Strategy'],
      content: `
        <p>In today's saturated marketplace, brands need more than just great products or services to stand out. They need to tell compelling stories that resonate with their audience on an emotional level. Visual storytelling has emerged as one of the most powerful tools in a brand's arsenal, capable of conveying complex messages instantly and memorably.</p>

        <h2>What is Visual Storytelling?</h2>
        <p>Visual storytelling combines imagery, typography, color, and design elements to narrate a brand's story without relying heavily on words. It's about creating a visual language that speaks directly to your audience's emotions and values.</p>

        <blockquote>"A picture is worth a thousand words, but a well-designed brand story is worth a thousand customers."</blockquote>

        <h2>The Psychology Behind Visual Communication</h2>
        <p>Our brains process visual information 60,000 times faster than text. This evolutionary advantage means that well-crafted visuals can communicate your brand's essence in milliseconds. When done correctly, visual storytelling:</p>

        <ul>
          <li><strong>Creates emotional connections</strong> that drive brand loyalty</li>
          <li><strong>Simplifies complex messages</strong> into digestible visual cues</li>
          <li><strong>Enhances memory retention</strong> through visual association</li>
          <li><strong>Builds brand recognition</strong> across all touchpoints</li>
        </ul>

        <h2>Key Elements of Effective Visual Storytelling</h2>

        <h3>1. Consistent Visual Language</h3>
        <p>Develop a cohesive system of colors, typography, imagery styles, and graphic elements that work together to reinforce your brand's personality and values.</p>

        <h3>2. Authentic Imagery</h3>
        <p>Move beyond stock photos to create or curate images that genuinely represent your brand's world and resonate with your target audience.</p>

        <h3>3. Strategic Color Psychology</h3>
        <p>Colors evoke specific emotions and associations. Choose a palette that aligns with your brand's personality and the feelings you want to inspire in your audience.</p>

        <h2>Implementing Visual Storytelling in Your Brand</h2>
        <p>Start by defining your brand's core story and values. Then, translate these abstract concepts into concrete visual elements. Consider how every design choice—from your logo to your website layout—contributes to your overall narrative.</p>

        <p>Remember, effective visual storytelling isn't just about making things look pretty. It's about creating a purposeful, strategic visual language that serves your business goals while connecting authentically with your audience.</p>

        <p>Ready to transform your brand through the power of visual storytelling? The journey begins with understanding your story and finding the right visual voice to tell it.</p>
      `
    }
  };

  return posts[slug] || posts['the-power-of-visual-storytelling'];
}

function getSampleRelatedPosts(): BlogPost[] {
  return [
    {
      slug: 'color-psychology-in-branding',
      title: 'Color Psychology: How Colors Influence Brand Perception',
      excerpt: 'Explore the psychological impact of color choices and how to leverage them for stronger brand communication.',
      date: 'March 5, 2024',
      category: 'Strategy',
      readTime: '6 min read',
      tags: [],
      content: ''
    },
    {
      slug: 'responsive-design-best-practices',
      title: 'Responsive Design Best Practices for 2024',
      excerpt: 'Learn the essential principles and techniques for creating websites that work seamlessly across all devices.',
      date: 'March 10, 2024',
      category: 'Development',
      readTime: '7 min read',
      tags: [],
      content: ''
    }
  ];
}