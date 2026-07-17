'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * LatestFromJournal
 * Homepage module: the 3 most recent posts from /api/blog, above Services.
 * Visual target = the site's blog cards + ServicesSection width. Uses UNIQUE
 * `jrnl-*` class names (NOT .post-card/.post-excerpt/.post-meta/.section-*),
 * because globals.css scales those with !important at desktop breakpoints only,
 * which inverted the title/excerpt hierarchy on mobile. All type sizes are set
 * explicitly here so the title is always larger than the excerpt at every width.
 * Renders nothing on fetch error / no posts.
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
    <section className="jrnl-section">
      <div className="jrnl-inner">
        <div className="jrnl-header">
          <h2 className="jrnl-heading">Latest thinking</h2>
          <p className="jrnl-desc">Ideas on design, AI visibility, and building a business that actually gets found.</p>
          <div className="jrnl-header-link">
            <Link href="/blog" className="jrnl-viewall">View all articles</Link>
          </div>
        </div>

        <div className="jrnl-grid">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="jrnl-card-link"
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%' }}
            >
              <article className="jrnl-card">
                {p.category && <div className="jrnl-cat">{p.category}</div>}
                <h3 className="jrnl-title">{p.title}</h3>
                <div className="jrnl-meta">
                  <span>{p.date}</span>
                  <span>•</span>
                  <span>{p.readTime} min read</span>
                </div>
                <p className="jrnl-excerpt">{p.excerpt}</p>
                <div className="jrnl-read">Read Full Article</div>
              </article>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .jrnl-section { background: #faf9f6; padding: 8rem 0 0 0; }
        .jrnl-inner { max-width: 120rem; margin: 0 auto; padding: 0 2.5rem; width: 100%; box-sizing: border-box; }

        .jrnl-header { text-align: left; margin-bottom: 6rem; }
        .jrnl-heading {
          font-family: futura-pt, sans-serif;
          font-size: clamp(2.5rem, 6vw, 4rem);
          font-weight: 300;
          line-height: 1.2;
          letter-spacing: 0;
          text-transform: none;
          color: var(--foreground, #35332f);
          margin: 0 0 2rem 0;
          padding: 0;
          text-indent: 0;
        }
        .jrnl-desc {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(1.25rem, 2.2vw, 1.5rem);
          font-weight: 200;
          line-height: 1.5;
          color: var(--grey-2, #7a776f);
          max-width: 46ch;
          margin: 0;
        }
        .jrnl-header-link { margin-top: 2rem; display: block; }
        .jrnl-viewall {
          font-family: ff-real-text-pro, sans-serif;
          font-size: 1.2rem;
          font-weight: 200;
          color: var(--foreground, #35332f);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          display: inline-block;
          padding: 0.5rem 1rem 0.5rem 0;
          transition: transform 0.3s ease;
        }
        .jrnl-viewall:hover { transform: translateX(5px); }

        .jrnl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }

        .jrnl-card-link { text-decoration: none !important; }
        .jrnl-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          padding: 40px;
          transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 320px;
          width: 100%;
          box-sizing: border-box;
        }
        .jrnl-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); border-color: var(--yellow, #daff00); }

        .jrnl-cat {
          background: var(--yellow, #daff00);
          color: var(--foreground, #35332f);
          padding: 4px 12px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          align-self: flex-start;
          margin: 0 0 20px 0;
        }
        .jrnl-title {
          font-family: futura-pt, sans-serif;
          font-weight: 400;
          font-size: clamp(1.5rem, 2.2vw, 1.9rem) !important;
          line-height: 1.3;
          letter-spacing: 0;
          text-transform: none;
          color: var(--foreground, #35332f);
          margin: 0 0 14px 0;
          padding: 0;
          text-indent: 0;
        }
        .jrnl-meta { display: flex; gap: 15px; margin-bottom: 15px; font-size: clamp(0.85rem, 0.9vw, 0.95rem) !important; color: #666; }
        .jrnl-excerpt {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(1rem, 1.3vw, 1.25rem) !important;
          color: #555;
          line-height: 1.6;
          margin: 0 0 20px 0;
          flex-grow: 1;
          font-weight: 200;
        }
        .jrnl-read {
          font-family: ff-real-text-pro, sans-serif;
          font-size: clamp(1rem, 1.1vw, 1.15rem);
          color: var(--foreground, #35332f);
          text-decoration: underline !important;
          text-decoration-thickness: 1px;
          text-underline-offset: 4px;
          font-weight: 200;
          transition: transform 0.3s ease;
          align-self: flex-start;
        }
        .jrnl-read:hover, .jrnl-card-link:hover .jrnl-read { transform: translateX(5px); }

        @media (max-width: 980px) { .jrnl-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) { .jrnl-section { padding: 4rem 0 0 0; } .jrnl-inner { padding: 0 1.5rem; } .jrnl-header { margin-bottom: 3rem; } .jrnl-card { padding: 30px 25px; } }
        @media (prefers-reduced-motion: reduce) { .jrnl-card, .jrnl-read, .jrnl-viewall { transition: none; } }
      `}</style>
    </section>
  );
}
