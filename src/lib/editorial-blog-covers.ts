const editorialCoverPaths: Record<string, string> = {
  'using-ai-agent-at-work-boundaries': '/images/blog/using-ai-agent-at-work-boundaries/cover.png',
  'september-2026-google-spam-update-traffic-impact': '/images/blog/september-2026-google-spam-update-traffic-impact/cover.png',
};

export function getEditorialBlogCover(slug: string): string | undefined {
  return editorialCoverPaths[slug];
}
