'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * LatestFromJournal
 * Homepage module: the 3 most recent posts from /api/blog, above Services.
 * Styled to match the site's own patterns 1:1 (ServicesSection container width +
 * section-title, and the blog .post-card / .post-category / .read-more-btn), NOT
 * the design system (which didn't match the real cards). Renders nothing on
 * fetch error / no posts.
 */

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  readTime: number;
  category: string;
};

export default function LatestFromJournal() {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/blog')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.posts?.length) setPosts(d.posts.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!posts || posts.length === 0) return null;

  return (
    <section className="journal">
      <div className="inner">
        <div className="journal-header">
          <h2 className="section-title">Latest thinking</h2>
          <h3 className="section-description">
            Ideas on design, AI visibility, and building a business that actually gets found.
          </h3>
          <div className="journal-header-link">
            <Link href="/blog" className="view-all-link">View all articles</Link>
          </div>
        </div>

        <div className="journal-grid">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="card-link"
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%' }}
            >
              <article className="post-card">
                <div className="post-category">{p.category}</div>
                <h3>{p.title}</h3>
                <div className="post-meta">
                  <span>{p.date}</span>
                  <span>•</span>
                  <span>{p.readTime} min read</span>
                </div>
                <p className="post-excerpt">{p.excerpt}</p>
                <div className="read-more-btn">Read Full Article</div>
              </article>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .journal { background: #faf9f6; padding: 8rem 0 0 0; }
        .inner { max-width: 120rem; margin: 0 auto; padding: 0 2.5rem; width: 100%; box-sizing: border-box; }

        .journal-header { text-align: left; margin-bottom: 6rem; }
        .section-title {
          font-family: futura-pt, sans-serif;
          font-size: clamp(2.5rem, 6vw, 4rem);
          font-weight: 300;
          line-height: 1.2;
          color: var(--foreground, #35332f);
          text-transform: none;
          margin: 0 0 2rem 0;
        }
        .section-description {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(1.25rem, 2.5vw, 1.5rem);
          font-weight: 200;
          line-height: 1.5;
          color: var(--grey-2, #7a776f);
          max-width: 46ch;
          margin: 0;
        }
        .journal-header-link { margin-top: 2rem; display: block; }
        .view-all-link {
          font-family: ff-real-text-pro, sans-serif;
          font-size: 1.2rem;
          font-weight: 200;
          color: var(--foreground, #35332f);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          display: inline-block;
          padding: 0.5rem 1rem 0.5rem 0;
          transition: all 0.3s ease;
        }
        .view-all-link:hover { color: var(--foreground, #35332f); text-decoration: underline; transform: translateX(5px); }

        .journal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }

        .card-link { text-decoration: none !important; }
        .post-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 40px;
          transition: all 0.3s ease;
          color: inherit;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 320px;
          width: 100%;
        }
        .post-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); border-color: var(--yellow, #daff00); }
        .post-category {
          background: var(--yellow, #daff00);
          color: var(--foreground, #35332f);
          padding: 4px 12px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          align-self: flex-start;
          margin-bottom: 20px;
        }
        .post-card h3 {
          font-family: futura-pt, sans-serif;
          font-weight: 400;
          font-size: clamp(1.4rem, 1.5vw, 1.8rem);
          line-height: 1.3;
          color: var(--foreground, #35332f);
          text-transform: none;
          margin: 0 0 15px 0;
        }
        .post-meta { display: flex; gap: 15px; margin-bottom: 15px; font-size: 0.85rem; color: #666; }
        .post-excerpt {
          font-family: ff-real-text-pro, sans-serif;
          color: #555;
          line-height: 1.6;
          margin: 0 0 20px 0;
          flex-grow: 1;
          font-weight: 200;
        }
        .read-more-btn {
          font-family: ff-real-text-pro, sans-serif;
          background: transparent;
          color: var(--foreground, #35332f);
          padding: 0;
          text-decoration: underline !important;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          font-weight: 200;
          transition: all 0.3s ease;
          align-self: flex-start;
        }
        .read-more-btn:hover { transform: translateX(5px); }
        .card-link:hover .read-more-btn { transform: translateX(5px); }

        @media (max-width: 900px) { .journal-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) { .journal { padding: 4rem 0 0 0; } .journal-header { margin-bottom: 3rem; } }
        @media (prefers-reduced-motion: reduce) { .post-card, .read-more-btn, .view-all-link { transition: none; } }
      `}</style>
    </section>
  );
}
