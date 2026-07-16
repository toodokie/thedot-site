'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, Heading, Text, Eyebrow, Tag, Arrow, Button } from '@thedot/design-system';

/**
 * LatestFromJournal
 * Homepage module: the 3 most recent blog posts from /api/blog, above Services.
 * Built with @thedot/design-system (Card/Heading/Text/Eyebrow/Tag/Arrow) so it is
 * on-brand by construction. The scoped `:global(a)` reset defeats globals.css,
 * which underlines every link. Renders nothing if the fetch fails / no posts.
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
    <section className="journal">
      <div className="wrap">
        <div className="head">
          <div className="head-left">
            <Eyebrow tone="grey">From the journal</Eyebrow>
            <Heading level={2} variant="display">Latest thinking</Heading>
          </div>
          <Button as={Link} href="/blog" variant="ghost" size="sm">View all articles</Button>
        </div>

        <div className="grid">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="card-link">
              <Card
                eyebrow={p.category ? <Tag tone="yellow">{p.category}</Tag> : undefined}
                title={p.title}
              >
                <Text size="sm" tone="grey">
                  {fmtDate(p.date)}{p.readTime ? ` · ${p.readTime} min read` : ''}
                </Text>
                {p.excerpt && <Text size="md" className="excerpt">{p.excerpt}</Text>}
                <span className="read">
                  <Text as="span" size="sm">Read article</Text>
                  <Arrow size={14} />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .journal { background: #faf9f6; padding: clamp(56px, 8vw, 110px) 24px; }
        .wrap { max-width: 1200px; margin: 0 auto; }
        .head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1em 1.4em; margin-bottom: clamp(28px, 4vw, 48px); }
        .head-left { display: flex; flex-direction: column; gap: 0.5em; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: clamp(20px, 2.5vw, 32px); align-items: stretch; }
        .card-link { display: block; height: 100%; }
        .read { display: inline-flex; align-items: center; gap: 0.4em; margin-top: 0.5em; }

        /* Defeat globals.css: it underlines every link and can uppercase headings. */
        .journal :global(a) { text-decoration: none; }
        .journal :global(.excerpt) { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>
    </section>
  );
}
