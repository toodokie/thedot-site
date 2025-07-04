'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import ScrollHeader from '@/components/ScrollHeader';

export default function ConditionalHeader() {
  const pathname = usePathname();
  
  // Hide header on project pages (any route that's not the homepage and not starting with specific routes)
  const isProjectPage = pathname !== '/' && 
                        !pathname.startsWith('/contact') && 
                        !pathname.startsWith('/services') && 
                        !pathname.startsWith('/blog') && 
                        !pathname.startsWith('/brief') && 
                        !pathname.startsWith('/estimate');
  
  // Add class to body for project pages to remove any spacing
  useEffect(() => {
    if (isProjectPage) {
      document.body.classList.add('project-page-body');
    } else {
      document.body.classList.remove('project-page-body');
    }
    
    return () => {
      document.body.classList.remove('project-page-body');
    };
  }, [isProjectPage]);
  
  if (isProjectPage) {
    return null;
  }
  
  return <ScrollHeader />;
}