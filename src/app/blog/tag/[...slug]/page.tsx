import { redirect } from 'next/navigation';

// This page handles old Webflow blog tag URLs and redirects them
export default function BlogTagPage() {
  // Server-side redirect to main blog page
  redirect('/blog');
}

// Tell Google these pages don't exist
export async function generateMetadata() {
  return {
    robots: {
      index: false,
      follow: false,
    },
  };
}