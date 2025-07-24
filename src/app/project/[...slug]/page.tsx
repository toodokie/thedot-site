import { notFound } from 'next/navigation';

// List of URLs that existed in old Webflow site but don't exist in current site
const REMOVED_PROJECTS = [
  'care-clinic-website-design',
  'book-landing', 
  'book'
];

export default function RemovedProjectPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug.join('/');
  
  // For removed projects, we want them to 404 so Google removes them from index
  if (REMOVED_PROJECTS.includes(slug)) {
    notFound();
  }
  
  // For any other /project/ URLs, also 404 (should redirect via next.config.ts)
  notFound();
}

// Tell search engines these pages don't exist
export async function generateMetadata({ params }: { params: { slug: string[] } }) {
  return {
    robots: {
      index: false,
      follow: false,
    },
  };
}