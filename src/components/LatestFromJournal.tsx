'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * LatestFromJournal
 * Homepage module: the 3 most recent blog posts, pulled live from /api/blog.
 * Internal links from the homepage (highest-authority page) to the posts help
 * search + AI crawlers discover and prioritise them. Auto-updates on publish.
 * Renders nothing if the fetch fails or there are no posts.
 */

const DISPLAY = "'futura-pt','Futura','Avenir Next','Helvetica Neue',Arial,sans-serif";
const BODY = "'ff-real-text-pro','Helvetica Neue',Arial,sans-serif";

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  readTime: number;
  category: string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  if (!m) return d || '';
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

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
    <section className="journal" aria-label="Latest from the journal">
      <div className="wrap">
        <header className="head">
          <span className="eyebrow"><span className="dot" aria-hidden="true" />From the journal</span>
          <h2 className="title">Latest thinking</h2>
          <Link href="/blog" className="all">View all articles &rarr;</Link>
        </header>

        <div className="grid">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="card">
              <div className="meta">
                {p.category && <span className="cat">{p.category}</span>}
                <span className="date">{fmtDate(p.date)}{p.readTime ? ` · ${p.readTime} min read` : ''}</span>
              </div>
              <h3 className="card-title">{p.title}</h3>
              {p.excerpt && <p className="excerpt">{p.excerpt}</p>}
              <span className="read">Read article &rarr;</span>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .journal { background: var(--background, #faf9f6); padding: clamp(56px, 8vw, 110px) 24px; font-family: ${BODY}; color: var(--foreground, #35332f); }
        .journal * { box-sizing: border-box; }
        .wrap { max-width: 1200px; margin: 0 auto; }
        .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6em 1.4em; margin-bottom: clamp(28px, 4vw, 48px); }
        .eyebrow { display: inline-flex; align-items: center; gap: 0.55em; font-family: ${DISPLAY}; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-2, #7a776f); width: 100%; }
        .dot { width: 0.5em; height: 0.5em; border-radius: 100%; flex: 0 0 auto; background: radial-gradient(circle farthest-corner at 35% 30%, #ffffff, var(--yellow, #daff00)); border: 1px solid var(--foreground, #35332f); }
        .title { font-family: ${DISPLAY}; font-weight: 300; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.08; letter-spacing: -0.01em; margin: 0; flex: 1 1 auto; }
        .all { font-family: ${DISPLAY}; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--foreground, #35332f); text-decoration: none; border-bottom: 1px solid var(--foreground, #35332f); padding-bottom: 2px; white-space: nowrap; transition: all 0.25s ease; }
        .all:hover { color: var(--grey-2, #7a776f); border-color: var(--yellow, #daff00); box-shadow: inset 0 -8px 0 rgba(218,255,0,0.45); }

        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: clamp(20px, 2.5vw, 32px); }
        .card { display: flex; flex-direction: column; background: var(--white-3, #fffefc); border: 1px solid var(--white-smoke-2, #ebebe7); border-radius: 14px; padding: clamp(20px, 2.6vw, 28px); text-decoration: none; color: inherit; transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease; }
        .card:hover { transform: translateY(-5px); box-shadow: 0 12px 30px rgba(0,0,0,0.09); border-color: var(--yellow, #daff00); }
        .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55em; margin-bottom: 0.9em; }
        .cat { font-family: ${DISPLAY}; font-size: 0.6rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--foreground, #35332f); background: var(--yellow, #daff00); padding: 0.28em 0.6em; }
        .date { font-family: ${DISPLAY}; font-size: 0.72rem; letter-spacing: 0.04em; color: var(--grey-2, #7a776f); }
        .card-title { font-family: ${DISPLAY}; font-weight: 300; font-size: 1.35rem; line-height: 1.22; letter-spacing: -0.005em; margin: 0 0 0.55em; text-wrap: balance; }
        .excerpt { font-size: 0.95rem; line-height: 1.55; color: #47453f; margin: 0 0 1.2em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .read { margin-top: auto; font-family: ${DISPLAY}; font-size: 0.76rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--foreground, #35332f); }
        .card:hover .read { box-shadow: inset 0 -8px 0 rgba(218,255,0,0.5); }

        @media (max-width: 600px) { .head { flex-direction: column; align-items: flex-start; } .all { align-self: flex-start; } }
        @media (prefers-reduced-motion: reduce) { .card { transition: none; } }
      `}</style>
    </section>
  );
}
