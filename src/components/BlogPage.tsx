'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import Footer from './Footer';
import { trackContent, trackNavigation } from '@/lib/analytics';

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: string;
  featured?: boolean;
  image?: string;
}

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    // Fetch blog posts from API
    fetchPosts();

    // Setup animation observer
    const observerOptions: IntersectionObserverInit = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/blog/posts');
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      // Fallback to sample data for demo
      setPosts(samplePosts);
    }
  };

  const categories = ['All', 'Design', 'Development', 'Strategy', 'Industry Insights'];
  
  const filteredPosts = selectedCategory === 'All' 
    ? posts 
    : posts.filter(post => post.category === selectedCategory);

  const featuredPost = posts.find(post => post.featured);

  return (
    <>
      <style jsx>{`
        .blog-container {
          background-color: var(--raw-white);
          min-height: 100vh;
          font-family: ff-real-text-pro-2, sans-serif;
        }
        
        
        .w-layout-blockcontainer {
          max-width: 940px;
          margin-left: auto;
          margin-right: auto;
          display: block;
        }
        
        @media screen and (max-width: 768px) {
          .w-layout-blockcontainer {
            text-align: center;
          }
        }
        
        .hero-title-copy-services {
          grid-column-gap: 0px;
          grid-row-gap: 0px;
          flex-direction: row;
          grid-template-rows: auto auto;
          grid-template-columns: 1fr 1fr;
          grid-auto-columns: 1fr;
          justify-content: space-between;
          align-self: stretch;
          align-items: center;
          width: auto;
          max-width: none;
          max-height: none;
          margin: 14rem 0 4em;
          display: flex;
        }
        
        .hero-title-copy-services.estimate {
          flex-direction: row;
          margin-top: 14rem;
          margin-left: 0;
          margin-right: 0;
          display: block;
          overflow: hidden;
        }
        
        .div-block-184 {
          width: 100%;
        }
        
        .div-block-183 {
          justify-content: space-between;
          width: 100%;
          display: flex;
        }
        
        .div-block-178-services {
          width: 70%;
        }
        
        .graphic-title-wrap-copy-services {
          grid-column-gap: 16px;
          grid-row-gap: 16px;
          flex-wrap: nowrap;
          flex: 0 auto;
          grid-template-rows: auto auto;
          grid-template-columns: 1fr 1fr;
          grid-auto-columns: 1fr;
          justify-content: flex-start;
          align-self: flex-start;
          align-items: center;
          width: auto;
          max-width: none;
          margin-left: 0;
          display: block;
        }
        
        
        .background-video-copy {
          width: 100%;
          min-width: 97%;
          height: 100%;
          min-height: 100%;
        }
        
        
        .graphic-copy-services-subheader {
          grid-column-gap: 0px;
          grid-row-gap: 0px;
          flex-direction: row;
          grid-template-rows: auto auto;
          grid-template-columns: 1fr 1fr;
          grid-auto-columns: 1fr;
          justify-content: flex-start;
          align-items: flex-start;
          width: 100%;
          margin: .5em 0 .25em;
          font-family: ff-real-text-pro-2, sans-serif;
          font-weight: 400;
          display: flex;
        }
        
        .graphic-copy-services-copy {
          grid-column-gap: 0px;
          grid-row-gap: 0px;
          flex-direction: row;
          grid-template-rows: auto auto;
          grid-template-columns: 1fr 1fr;
          grid-auto-columns: 1fr;
          justify-content: flex-start;
          align-items: flex-start;
          width: auto;
          margin: .5em 0 .25em;
          font-size: .8rem;
          display: flex;
        }
        
        .dot_h2_subheader {
          color: var(--black);
          text-align: left;
          text-transform: none;
          flex: 0 auto;
          justify-content: flex-start;
          align-self: center;
          max-width: none;
          margin-top: 0;
          margin-bottom: 0;
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: 2.2rem;
          font-weight: 300;
          line-height: 1.2em;
          display: block;
        }
        
        .hero-circle-video-copy-services {
          box-shadow: inset 0 0 0 1px var(--yellow);
          object-fit: fill;
          border: 2px solid #000;
          border-radius: 100%;
          flex-direction: row;
          flex: none;
          order: 0;
          justify-content: space-between;
          width: 160px;
          min-width: auto;
          max-width: none;
          height: 160px;
          min-height: auto;
          max-height: none;
          margin-top: 0;
          margin-left: 1em;
          margin-right: 1em;
          display: block;
          overflow: hidden;
        }
        
        .background-video-copy-services {
          width: 100%;
          min-width: 97%;
          height: 100%;
          min-height: 100%;
        }
        
        /* Responsive styles */
        @media screen and (max-width: 991px) {
          .hero-title-copy-services.estimate {
            margin-top: 18rem;
            margin-left: 0;
            margin-right: 0;
          }
          
          .div-block-178-services {
            width: 70%;
          }
          
          .dot_h1_pages {
            color: var(--black);
            text-transform: none;
            justify-content: flex-start;
            font-size: 6rem;
          }
          
          .dot_h2_subheader {
            color: var(--black);
            justify-content: flex-start;
            font-size: 3em;
          }
          
          .hero-circle-video-copy-services {
            width: 220px;
            height: 220px;
          }
        }
        
        @media screen and (max-width: 768px) {
          .hero-title-copy-services.estimate {
            flex-direction: row;
            margin-top: 8rem;
            margin-left: 0;
            margin-right: 0;
          }
          
          .div-block-183 {
            flex-direction: column;
            align-items: center;
          }
          
          .div-block-178-services {
            flex-direction: column;
            display: flex;
            width: 100%;
            text-align: center;
          }
          
          .graphic-title-wrap-copy-services {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            text-align: center;
          }
          
          .hero-circle-video-copy-services {
            display: none;
          }
        }
        
        
        .main-content {
          width: 100%;
          max-width: 120rem;
          margin: 0 auto;
          padding: 2rem 2.5rem;
        }
        
        .category-filters {
          display: flex;
          justify-content: center;
          gap: 30px;
          margin-bottom: 60px;
          flex-wrap: wrap;
        }
        
        .category-button {
          background: transparent;
          border: 2px solid var(--black);
          color: var(--black);
          padding: 12px 24px;
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          display: inline-block;
        }
        
        .category-button:hover,
        .category-button.active {
          background: var(--yellow);
          color: var(--black);
          transform: translateY(-2px);
        }
        
        .featured-section {
          margin-bottom: 80px;
        }
        
        .featured-post {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
          padding: 60px;
          background: #fff;
          border: 1px solid #e0e0e0;
        }
        
        .featured-content h2 {
          font-family: futura-pt, sans-serif;
          font-size: 2.5rem !important;
          font-weight: 400;
          color: var(--black);
          margin-bottom: 15px;
          line-height: 1.2;
          padding: 0 !important;
        }
        
        /* Override global media query for featured content */
        @media (width >= 1000px) and (width <= 1239px) {
          .featured-content h2 {
            font-size: 2.5rem !important;
            padding: 0 !important;
          }
        }
        
        @media (max-width: 999px) {
          .featured-content h2 {
            padding: 0 !important;
          }
          
          .featured-post {
            text-align: left !important;
          }
        }
        
        /* Tablet-specific styles */
        @media (width >= 769px) and (width <= 1024px) {
          .featured-post {
            text-align: left !important;
          }
        }
        
        .featured-meta {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          font-size: 0.9rem;
          color: #666;
        }
        
        .featured-excerpt {
          font-size: 1.1rem;
          line-height: 1.6;
          color: #555;
          margin-bottom: 30px;
        }
        
        .read-more-btn {
          background: var(--black);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
          display: inline-block;
        }
        
        .read-more-btn:hover {
          background: var(--yellow);
          color: var(--black);
          transform: translateY(-2px);
        }
        
        .featured-image {
          width: 100%;
          height: 300px;
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          font-style: italic;
        }
        
        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 40px;
          margin-bottom: 80px;
        }
        
        .post-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 40px;
          transition: all 0.3s ease;
          color: inherit;
        }
        
        .post-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          border-color: var(--yellow);
        }
        
        .post-card h3,
        .post-card .post-meta,
        .post-card .post-excerpt {
          text-decoration: none;
        }
        
        .post-card h3 {
          font-family: futura-pt, sans-serif;
          font-size: 1.4rem !important;
          font-weight: 400;
          color: var(--black);
          margin-bottom: 10px;
          line-height: 1.3;
          padding: 0 !important;
        }
        
        /* Override global media query for post card titles */
        @media (width >= 1000px) and (width <= 1239px) {
          .post-card h3 {
            font-size: 1.4rem !important;
            padding: 0 !important;
          }
        }
        
        @media (max-width: 999px) {
          .post-card h3 {
            font-size: 1.4rem !important;
            padding: 0 !important;
          }
        }
        
        .post-meta {
          display: flex;
          gap: 15px;
          margin-bottom: 15px;
          font-size: 0.85rem;
          color: #666;
        }
        
        .post-excerpt {
          color: #555;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        
        .post-category {
          background: var(--yellow);
          color: var(--black);
          padding: 4px 12px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .review-cta-section {
          background: var(--raw-white);
          padding: 0 0 80px 0;
          text-align: center;
          margin-bottom: 0;
        }
        
        .review-cta-content {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 2.5rem;
        }
        
        .dot_bottom_link.estimate {
          background-color: transparent;
          margin: 1em auto 2em;
          padding: 0.5em 0.5em 0.25em;
          font-family: futura-pt, sans-serif;
          font-size: clamp(3rem, 7vw, 7.5rem);
          font-weight: 300;
          color: var(--black);
          text-decoration: none;
          text-transform: none;
          text-align: center;
          display: block;
          transition: all 0.4s cubic-bezier(0.95, 0.05, 0.795, 0.035);
          overflow: hidden;
        }
        
        .dot_bottom_link.estimate:hover {
          border: 1px none var(--dim-grey);
          box-shadow: none;
          color: var(--black);
          text-shadow: none;
          background-color: transparent;
          letter-spacing: 15px;
        }
        
        .dot_bottom_link.estimate:hover .small-bottom-link-text-eng {
          transform: translateY(-15px);
        }
        
        .small-bottom-link-text-eng {
          letter-spacing: 0.1em;
          text-transform: none;
          font-family: ff-real-text-pro-2, sans-serif;
          font-size: 1.2rem;
          font-weight: 300;
          line-height: 1.3;
          transition: transform 0.3s ease;
          display: inline-block;
        }
        
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .animate-on-scroll.animate-in {
          opacity: 1;
          transform: translateY(0);
        }
        
        @media (max-width: 768px) {
          .blog-title {
            font-size: 3.5rem;
          }
          
          .featured-post {
            grid-template-columns: 1fr;
            padding: 40px 30px;
            text-align: left;
          }
          
          .featured-content h2 {
            font-size: 2rem !important;
            padding: 0 !important;
          }
          
          .posts-grid {
            grid-template-columns: 1fr;
            gap: 30px;
          }
          
          .post-card {
            padding: 30px 25px;
          }
          
          .category-filters {
            gap: 15px;
          }
          
          .newsletter-form {
            flex-direction: column;
          }
          
          .dot_bottom_link.estimate {
            margin-top: 0;
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
        
        /* Override font size for this page only */
        .dot-bottom-link.hero {
          font-size: 5vw !important;
          cursor: pointer !important;
        }
        
        /* Mobile styles */
        @media (max-width: 768px) {
          .small-bottom-link-text-eng {
            font-size: 1rem !important;
          }
        }
      `}</style>

      <div className="blog-container">
        <section className="hero-title-copy-services estimate">
          <div className="div-block-184">
            <div className="div-block-183">
              <div className="div-block-178-services">
                <div className="w-layout-blockcontainer graphic-title-wrap-copy-services w-container">
                  <div className="graphic-copy-services">
                    <h1 className="dot_h1_pages">Creative Insights</h1>
                    <div className="hero-circle-video-copy-mobile">
                      <video 
                        className="background-video-copy"
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                      >
                        <source src="/video/hero-video.mp4" type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                </div>
                <div className="w-layout-blockcontainer graphic-copy-services-subheader w-container">
                  <div className="graphic-copy-services-copy">
                    <h2 className="dot_h2_subheader">Discover the latest trends, strategies, and stories from the world of creative design</h2>
                  </div>
                </div>
              </div>
              <div className="hero-circle-video-copy-services">
                <video 
                  className="background-video-copy-services"
                  autoPlay 
                  muted 
                  loop 
                  playsInline
                >
                  <source src="/video/hero-video.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </div>
        </section>

        <div className="main-content">
          {/* Category Filters */}
          <div className="category-filters">
            {categories.map(category => (
              <button
                key={category}
                className={`category-button ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory(category);
                  trackContent.categoryFilter(category);
                }}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Featured Post */}
          {featuredPost && (
            <section className="featured-section">
              <article className="featured-post">
                <div className="featured-content">
                  <h2>{featuredPost.title}</h2>
                  <div className="featured-meta">
                    <span>{featuredPost.date}</span>
                    <span>•</span>
                    <span>{featuredPost.readTime}</span>
                  </div>
                  <p className="featured-excerpt">{featuredPost.excerpt}</p>
                  <Link 
                    href={`/blog/${featuredPost.slug}`} 
                    className="read-more-btn"
                    onClick={() => {
                      trackContent.blogPostView(featuredPost.slug, featuredPost.title, featuredPost.category);
                    }}
                  >
                    Read Full Article
                  </Link>
                </div>
                <div className="featured-image">
                  {featuredPost.image ? (
                    <img 
                      src={featuredPost.image} 
                      alt={featuredPost.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '8px'
                      }}
                    />
                  ) : (
                    <span>[Featured Article Image]</span>
                  )}
                </div>
              </article>
            </section>
          )}

          {/* Posts Grid */}
          <section className="posts-grid">
            {filteredPosts.filter(post => !post.featured).map(post => (
              <Link 
                href={`/blog/${post.slug}`}
                onClick={() => {
                  trackContent.blogPostView(post.slug, post.title, post.category);
                }}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <article key={post.slug} className="post-card">
                  <div className="post-category">{post.category}</div>
                  <h3>{post.title}</h3>
                  <div className="post-meta">
                    <span>{post.date}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>
                  <p className="post-excerpt">{post.excerpt}</p>
                  <div className="read-more-btn">
                    Read Full Article
                  </div>
                </article>
              </Link>
            ))}
          </section>
        </div>

        {/* Website Review CTA Section */}
        <section className="review-cta-section">
          <div className="review-cta-content">
            <Link 
              href="/contacts" 
              className="dot-bottom-link hero animate-on-scroll"
              onClick={() => trackNavigation.ctaClick('Website Performance Review', 'Blog Page', '/contacts')}
            >
              Request Website<br />Performance Review<br />
              <span className="small-bottom-link-text-eng">Get the same detailed website audit we charge <strong style={{fontWeight: 700}}>$300</strong> for — complimentary for qualified <strong style={{fontWeight: 700}}>GTA businesses</strong>. We&apos;ll pinpoint exactly what&apos;s driving customers away and show you how to fix it during a brief consultation call.</span>
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}

// Sample blog posts for demo
const samplePosts: BlogPost[] = [
  {
    slug: 'gta-small-business-website-mistakes',
    title: '5 Website Mistakes Costing GTA Small Businesses Customers (And How to Fix Them)',
    excerpt: 'Research shows 94% of negative website feedback is design-related. Discover the critical mistakes costing GTA small businesses customers and proven solutions.',
    date: 'January 12, 2025',
    category: 'Strategy',
    readTime: '8 min read',
    featured: true
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
  }
];