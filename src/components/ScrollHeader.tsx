"use client";
import { useEffect, useState } from 'react';
import Header from './Header';

export default function ScrollHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [scrollTimeout, setScrollTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show background after scrolling past hero section
      setIsScrolled(currentScrollY > 50);
      
      // Clear existing timeout for hiding only
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      
      // Immediately show header when scrolling up
      if (currentScrollY < lastScrollY) {
        // Scrolling up - show header immediately
        setIsHidden(false);
        setLastScrollY(currentScrollY);
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down - hide header with slight debounce to prevent flickering
        const timeout = setTimeout(() => {
          setIsHidden(true);
          setLastScrollY(currentScrollY);
        }, 100); // Reduced debounce for hiding
        
        setScrollTimeout(timeout);
      } else {
        setLastScrollY(currentScrollY);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [lastScrollY, scrollTimeout]);

  return (
    <div className={`header-bg ${isHidden ? 'hidden' : ''} ${isScrolled ? 'scrolled' : ''}`}>
      <Header />
    </div>
  );
}
