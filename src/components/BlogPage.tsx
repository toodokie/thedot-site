'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import Footer from './Footer';
import { trackContent, trackNavigation } from '@/lib/analytics';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: number;
  featured?: boolean;
  featuredImage?: string;
  content: string;
  tags: string[];
}

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>(samplePosts); // Start with sample data to prevent layout shifts
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Apply critical containment styles immediately after hydration
    if (typeof window !== 'undefined') {
      const criticalElements = document.querySelectorAll('.blog-container, .main-content, .featured-section, .review-cta-section');
      criticalElements.forEach(element => {
        (element as HTMLElement).style.contain = 'layout style';
      });
    }
    
    // Preload posts API to reduce loading time
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = '/api/blog';
    document.head.appendChild(link);
    
    // Fetch blog posts from API
    fetchPosts();

    // Setup animation observer with reduced rootMargin to prevent layout shifts
    const observerOptions: IntersectionObserverInit = {
      threshold: 0.05, // Reduced threshold
      rootMargin: '0px 0px -20px 0px' // Reduced margin
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Delay animation setup to avoid interfering with initial layout
    const setupAnimations = () => {
      const animatedElements = document.querySelectorAll('.animate-on-scroll');
      animatedElements.forEach((element) => {
        observer.observe(element);
      });
    };

    // Setup animations after layout is stable
    requestAnimationFrame(() => {
      requestAnimationFrame(setupAnimations);
    });

    return () => {
      const animatedElements = document.querySelectorAll('.animate-on-scroll');
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/blog');
      if (response.ok) {
        const data = await response.json();
        let posts = data.posts || [];
        
        // Override featured image for all featured posts since S3 URLs are expiring
        posts = posts.map((post: BlogPost) => {
          if (post.featured) {
            console.log('Featured post found:', post.title, post.slug);
            
            // Use local images based on slug or title
            if (post.slug.includes('emotional-brand') || 
                post.title.toLowerCase().includes('emotional brand')) {
              return {
                ...post,
                featuredImage: '/images/blog/emotional-brand-strategy-306-percent-lifetime-value-ontario-business/emotional-brand-800x600 px.webp'
              };
            } else if (post.slug.includes('software-subscription') || 
                       post.title.toLowerCase().includes('software subscription')) {
              return {
                ...post,
                featuredImage: '/images/blog/software-subscription-trap-ontario-business/software-subscription-trap-ontario-business 800.webp'
              };
            } else if (post.slug.includes('website-design-trends') || 
                       post.title.toLowerCase().includes('website design trends')) {
              return {
                ...post,
                featuredImage: '/images/blog/website-design-trends-europe/Website Design Trends.webp'
              };
            } else if (post.slug.includes('website-mistakes') || 
                       post.title.toLowerCase().includes('gta small business')) {
              return {
                ...post,
                featuredImage: '/images/blog/website-mistakes-gta-businesses/hero-hourglass.gif'
              };
            } else if (post.slug.includes('true-cost-of-free') || 
                       post.title.toLowerCase().includes('true cost of free') ||
                       post.title.toLowerCase().includes('manual work')) {
              return {
                ...post,
                featuredImage: '/images/blog/true-cost-of-free-manual-work/manual-vs-automated-workflow.webp'
              };
            }
            
            // Fallback: try to use S3 URL via proxy, but if it fails, use first available local image
            return {
              ...post,
              featuredImage: post.featuredImage && post.featuredImage.includes('prod-files-secure.s3.us-west-2.amazonaws.com') 
                ? '/images/blog/emotional-brand-strategy-306-percent-lifetime-value-ontario-business/emotional-brand-800x600 px.webp'
                : post.featuredImage
            };
          }
          return post;
        });
        
        setPosts(posts);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      // Keep sample data on error to prevent layout shifts
      setPosts(samplePosts);
      setIsLoading(false);
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
          font-family: ff-real-text-pro, sans-serif;
          contain: strict; /* Strictest containment for complete isolation */
          will-change: auto; /* Reset will-change */
          position: relative;
          transform: translateZ(0); /* Force layer creation */
          backface-visibility: hidden; /* Additional optimization */
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
          min-height: 120px;
        }
        
        .div-block-184 {
          width: 100%;
          contain: layout style;
          transform: translateZ(0);
        }
        
        .div-block-183 {
          justify-content: space-between;
          width: 100%;
          display: flex;
        }
        
        .div-block-178-services {
          width: 70%;
          min-height: 80px;
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
          font-family: ff-real-text-pro, sans-serif;
          font-weight: 300;
          display: flex;
          contain: layout style;
          transform: translateZ(0);
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
          font-family: ff-real-text-pro, sans-serif;
          font-size: 2.2rem;
          font-weight: 200;
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
          min-width: 160px;
          max-width: 160px;
          height: 160px;
          min-height: 160px;
          max-height: 160px;
          margin-top: 0;
          margin-left: 1em;
          margin-right: 1em;
          display: block;
          overflow: hidden;
          aspect-ratio: 1/1;
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
            min-height: 70px;
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
            min-height: 60px;
          }
          
          .graphic-title-wrap-copy-services {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            text-align: center;
          }
          
          .dot_h1_pages {
            color: var(--foreground);
            text-transform: none;
            text-align: center;
            font-size: 4rem;
          }
          
          .dot_h2_subheader {
            align-self: center;
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
          contain: layout style; /* Prevent layout shifts */
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
          font-family: ff-real-text-pro, sans-serif;
          font-size: 1rem;
          font-weight: 300;
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
          contain: layout style;
          transform: translateZ(0); /* Create stacking context */
        }
        
        .featured-post {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
          padding: 60px;
          background: #fff;
          border: 1px solid #e0e0e0;
          transition: all 0.3s ease;
          contain: layout style;
          height: auto;
          aspect-ratio: 2/1; /* Maintain consistent proportions */
        }
        
        .featured-post:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          border-color: var(--yellow);
        }
        
        .featured-content {
          font-weight: 400;
        }
        
        .featured-content h2 {
          font-family: futura-pt, sans-serif;
          font-size: 2.5rem !important;
          font-weight: 300;
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
          font-size: 0.875rem;
          color: #666;
        }
        
        .featured-excerpt {
          font-size: 1rem;
          line-height: 1.6;
          font-weight: 200;
          color: #555;
          margin-bottom: 30px;
        }
        
        .read-more-btn {
          background: transparent;
          color: var(--foreground) !important;
          padding: 0;
          text-decoration: underline !important;
          text-decoration-thickness: 1px !important;
          text-underline-offset: 4px !important;
          font-weight: 200;
          transition: all 0.3s ease;
          display: inline-block;
          text-align: left;
          cursor: pointer;
        }
        
        .read-more-btn:hover {
          background: transparent;
          color: var(--foreground) !important;
          text-decoration: underline !important;
          transform: translateX(5px);
        }
        
        .featured-image {
          width: 100%;
          aspect-ratio: 4/3;
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          font-style: italic;
          overflow: hidden;
          border-radius: 8px;
          contain: strict; /* Stronger containment */
          transform: translateZ(0); /* Hardware acceleration */
        }
        
        .posts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 40px;
          margin-bottom: 80px;
          contain: layout style;
          grid-auto-rows: minmax(320px, 1fr); /* Fixed minimum height */
          min-height: 600px; /* Minimum height for grid */
        }
        
        .post-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 40px;
          transition: all 0.3s ease;
          color: inherit;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 320px; /* Fixed minimum height */
          font-weight: 400;
          contain: layout style;
          transform: translateZ(0);
        }
        
        .post-card h3 {
          font-weight: 400 !important;
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
          flex-grow: 1;
          font-weight: 200;
        }
        
        /* Loading skeleton styles */
        .post-card-skeleton {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 40px;
          min-height: 320px;
          display: flex;
          flex-direction: column;
        }
        
        .skeleton-element {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        .skeleton-category {
          width: 80px;
          height: 16px;
          margin-bottom: 20px;
        }
        
        .skeleton-title {
          width: 100%;
          height: 24px;
          margin-bottom: 10px;
        }
        
        .skeleton-title-2 {
          width: 70%;
          height: 24px;
          margin-bottom: 20px;
        }
        
        .skeleton-meta {
          width: 150px;
          height: 16px;
          margin-bottom: 20px;
        }
        
        .skeleton-excerpt {
          width: 100%;
          height: 16px;
          margin-bottom: 10px;
        }
        
        .skeleton-excerpt-2 {
          width: 90%;
          height: 16px;
          margin-bottom: 10px;
        }
        
        .skeleton-excerpt-3 {
          width: 80%;
          height: 16px;
          margin-bottom: 30px;
        }
        
        .skeleton-button {
          width: 120px;
          height: 40px;
          margin-top: auto;
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
          contain: layout style;
          transform: translateZ(0);
        }
        
        .review-cta-content {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 2.5rem;
          contain: layout style;
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
          cursor: pointer;
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
          font-family: ff-real-text-pro, sans-serif;
          font-size: 1.125rem;
          font-weight: 300;
          line-height: 1.3;
          transition: transform 0.3s ease;
          display: inline-block;
        }
        
        .animate-on-scroll {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          will-change: opacity;
        }
        
        .animate-on-scroll:not(.animate-in) {
          opacity: 0;
        }
        
        .animate-on-scroll.animate-in {
          opacity: 1;
        }

        /* Skeleton Loading Styles - Matched to actual content dimensions */
        .skeleton-title {
          height: 3.5rem; /* Match actual title height */
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 20px;
          width: 90%;
        }
        
        .skeleton-title::after {
          content: '';
          display: block;
          height: 2.5rem;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-top: 8px;
          width: 70%;
        }

        .skeleton-meta {
          height: 1rem;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 20px;
          width: 60%;
        }

        .skeleton-excerpt {
          height: 4.5rem; /* Match actual excerpt height */
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 12px;
          width: 100%;
          min-height: 4.5rem;
        }

        .skeleton-excerpt::after {
          content: '';
          display: block;
          height: 1.1rem;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-top: 12px;
          width: 85%;
        }
        
        .skeleton-excerpt::before {
          content: '';
          display: block;
          height: 1.1rem;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 12px;
          width: 95%;
        }

        .skeleton-button {
          height: 1.2rem;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-top: 20px;
          width: 40%;
        }

        .skeleton-category {
          height: 1.2rem;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 15px;
          width: 30%;
        }

        .skeleton-image {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 8px;
        }

        .skeleton-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 8px;
        }

        @keyframes skeleton-loading {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .post-skeleton {
          pointer-events: none;
          min-height: 320px; /* Match post card height */
        }

        .featured-skeleton {
          pointer-events: none;
          min-height: 360px; /* Match featured post height */
        }

        /* Font loading optimization and CLS prevention */
        * {
          font-display: swap;
        }
        
        /* Critical rendering optimization */
        .blog-container * {
          box-sizing: border-box;
        }
        
        /* Prevent flash of unstyled content */
        .animate-on-scroll {
          opacity: 1 !important;
          transform: none !important;
        }
        
        /* Ensure stable layout before content loads */
        .category-filters,
        .featured-section,
        .posts-grid,
        .review-cta-section {
          visibility: visible;
          opacity: 1;
        }
        
        /* Load-time layout stability */
        body {
          overflow-x: hidden;
        }
        
        /* Prevent animation-triggered shifts */
        .animate-on-scroll:not(.animate-in) {
          opacity: 1 !important;
          transform: none !important;
        }
        
        @media (max-width: 768px) {
          .blog-title {
            font-size: 3.5rem;
          }
          
          .main-content {
            contain: layout style;
          }
          
          .posts-grid {
            contain: layout style;
          }
          
          .featured-section {
            contain: layout style;
          }
          
          .featured-post {
            aspect-ratio: auto; /* Remove aspect ratio constraint on mobile */
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
          --black: var(--foreground);
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
        
        .dot-bottom-link.hero:hover {
          letter-spacing: 15px;
        }
        
        .dot-bottom-link.hero:hover .small-bottom-link-text-eng {
          transform: translateY(-15px);
        }
        
        /* Mobile styles */
        /* Desktop scaling for blog elements */
        @media (min-width: 1000px) {
          .featured-excerpt {
            font-size: 1.125rem !important; /* Scale from 1rem */
          }
          .post-excerpt {
            font-size: 1.125rem !important;
          }
          .post-card h3 {
            font-size: 1.6rem !important; /* Scale up from 1.4rem */
          }
          .small-bottom-link-text-eng {
            font-size: 1.25rem !important; /* Scale from 1.125rem */
          }
        }
        
        @media (min-width: 1240px) {
          .featured-excerpt {
            font-size: 1.25rem !important; /* Further scale for large screens */
          }
          .post-excerpt {
            font-size: 1.25rem !important;
          }
          .post-card h3 {
            font-size: 1.8rem !important; /* Further scale for very large screens */
          }
          .small-bottom-link-text-eng {
            font-size: 1.375rem !important;
          }
        }
        
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
                    <h1 className="dot_h1_pages">Strategic Design Insights</h1>
                    <div className="hero-circle-video-copy-mobile">
                      <video 
                        className="background-video-copy"
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                      >
                        <source src="/video/hero-video-min.mp4" type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                </div>
                <div className="w-layout-blockcontainer graphic-copy-services-subheader w-container">
                  <div className="graphic-copy-services-copy">
                    <h2 className="dot_h2_subheader">Practical web strategies for Ontario business growth</h2>
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
                  <source src="/video/hero-video-min.mp4" type="video/mp4" />
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
                  trackContent.blogCategoryFilter(category);
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
                    <span>{featuredPost.readTime} min read</span>
                  </div>
                  <p className="featured-excerpt">{featuredPost.excerpt}</p>
                  <Link 
                    href={`/blog/${featuredPost.slug}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                    onClick={() => {
                      trackContent.blogPostView(featuredPost.slug, featuredPost.title, featuredPost.category);
                    }}
                  >
                    <div className="read-more-btn">
                      Read Full Article
                    </div>
                  </Link>
                </div>
                <div className="featured-image">
                  {featuredPost.featuredImage ? (
                    <Image
                      src={featuredPost.featuredImage.includes('prod-files-secure.s3.us-west-2.amazonaws.com') 
                        ? `/api/image-proxy?url=${encodeURIComponent(featuredPost.featuredImage)}` 
                        : featuredPost.featuredImage
                      }
                      alt={featuredPost.title}
                      width={800}
                      height={600}
                      priority
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '8px'
                      }}
                      placeholder="blur"
                      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                      unoptimized
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
            {isLoading ? (
              // Show skeleton loaders while loading
              <>
                {[1, 2, 3, 4, 5, 6].map((index) => (
                  <div key={`skeleton-${index}`} className="post-card-skeleton">
                    <div className="skeleton-element skeleton-category"></div>
                    <div className="skeleton-element skeleton-title"></div>
                    <div className="skeleton-element skeleton-title-2"></div>
                    <div className="skeleton-element skeleton-meta"></div>
                    <div className="skeleton-element skeleton-excerpt"></div>
                    <div className="skeleton-element skeleton-excerpt-2"></div>
                    <div className="skeleton-element skeleton-excerpt-3"></div>
                    <div className="skeleton-element skeleton-button"></div>
                  </div>
                ))}
              </>
            ) : (
              filteredPosts.filter(post => !post.featured).map(post => (
              <Link 
                key={post.slug}
                href={`/blog/${post.slug}`}
                onClick={() => {
                  trackContent.blogPostView(post.slug, post.title, post.category);
                }}
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%' }}
              >
                <article className="post-card">
                  <div className="post-category">{post.category}</div>
                  <h3>{post.title}</h3>
                  <div className="post-meta">
                    <span>{post.date}</span>
                    <span>•</span>
                    <span>{post.readTime} min read</span>
                  </div>
                  <p className="post-excerpt">{post.excerpt}</p>
                  <div className="read-more-btn">
                    Read Full Article
                  </div>
                </article>
              </Link>
            )))}
          </section>
        </div>

        {/* Website Review CTA Section */}
        <section className="review-cta-section">
          <div className="review-cta-content">
            <Link 
              href="/contacts" 
              className="dot-bottom-link hero animate-on-scroll"
              onClick={() => trackNavigation.ctaClick('Brand Performance Audit', 'Blog Page', '/contacts')}
            >
              REQUEST BRAND<br />PERFORMANCE AUDIT<br />
              <span className="small-bottom-link-text-eng">Find out why your marketing isn't converting. This strategic brand audit (valued at <strong style={{fontWeight: 700}}>$300</strong>, complimentary for qualified <strong style={{fontWeight: 700}}>GTA businesses</strong>) uncovers the missing emotional connections that turn one-time buyers into lifetime advocates. Brief consultation included.</span>
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
    id: '1',
    slug: 'gta-small-business-website-mistakes',
    title: '5 Website Mistakes Costing GTA Small Businesses Customers (And How to Fix Them)',
    excerpt: 'Research shows 94% of negative website feedback is design-related. Discover the critical mistakes costing GTA small businesses customers and proven solutions.',
    date: 'January 12, 2025',
    category: 'Strategy',
    readTime: 8,
    featured: true,
    content: '',
    tags: ['strategy', 'web-design', 'small-business']
  },
  {
    id: '2',
    slug: 'the-power-of-visual-storytelling',
    title: 'The Power of Visual Storytelling in Brand Design',
    excerpt: 'Discover how compelling visual narratives can transform your brand identity and create deeper connections with your audience.',
    date: 'March 15, 2024',
    category: 'Design',
    readTime: 5,
    content: '',
    tags: ['design', 'branding', 'storytelling']
  },
  {
    id: '3',
    slug: 'responsive-design-best-practices',
    title: 'Responsive Design Best Practices for 2024',
    excerpt: 'Learn the essential principles and techniques for creating websites that work seamlessly across all devices.',
    date: 'March 10, 2024',
    category: 'Development',
    readTime: 7,
    content: '',
    tags: ['development', 'responsive', 'web-design']
  },
  {
    id: '4',
    slug: 'color-psychology-in-branding',
    title: 'Color Psychology: How Colors Influence Brand Perception',
    excerpt: 'Explore the psychological impact of color choices and how to leverage them for stronger brand communication.',
    date: 'March 5, 2024',
    category: 'Strategy',
    readTime: 6,
    content: '',
    tags: ['strategy', 'branding', 'psychology']
  },
  {
    id: '5',
    slug: 'future-of-web-design',
    title: 'The Future of Web Design: Trends to Watch',
    excerpt: 'A comprehensive look at emerging design trends that will shape the digital landscape in the coming years.',
    date: 'February 28, 2024',
    category: 'Industry Insights',
    readTime: 8,
    content: '',
    tags: ['trends', 'web-design', 'industry-insights']
  }
];