// src/components/ClientAnimations.tsx (Client Component)
'use client';
import { useEffect } from 'react';

export default function ClientAnimations() {
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          
          // For services section, also animate individual cards with stagger
          if (entry.target.classList.contains('services-section')) {
            const cards = entry.target.querySelectorAll('.service-card');
            cards.forEach((card, index) => {
              setTimeout(() => {
                card.classList.add('animate-in');
              }, index * 100); // 100ms stagger between cards
            });
          }
          
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
    
    // Observe all elements with animate-on-scroll class
    const animatedElements = document.querySelectorAll('.animate-on-scroll, .services-section');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });
    
    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  return null; // This component only handles effects, no UI
}