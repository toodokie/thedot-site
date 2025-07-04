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
      
      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      
      // Hide/show header based on scroll direction with debounce
      const timeout = setTimeout(() => {
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
          // Scrolling down - hide header
          setIsHidden(true);
        } else {
          // Scrolling up - show header
          setIsHidden(false);
        }
        setLastScrollY(currentScrollY);
      }, 150); // 150ms debounce
      
      setScrollTimeout(timeout);
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
