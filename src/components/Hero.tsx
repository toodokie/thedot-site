'use client';

import { useEffect } from 'react';

export default function HeroVideoLoader() {
    useEffect(() => {
        // Replace video placeholders with actual videos
        const circleVideoPlaceholder = document.getElementById('hero-video-placeholder');
        const fullVideoPlaceholder = document.getElementById('hero-video-full-placeholder');
        
        // Detect if on mobile for performance optimization
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (circleVideoPlaceholder) {
            const video = document.createElement('video');
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'none';
            video.className = 'circle-video';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            video.width = 300;
            video.height = 300;
            
            const source = document.createElement('source');
            source.src = '/video/hero-video-min.mp4';
            source.type = 'video/mp4';
            video.appendChild(source);
            
            video.onloadeddata = () => {
                video.play().catch(console.error);
            };
            
            circleVideoPlaceholder.replaceWith(video);
        }
        
        if (fullVideoPlaceholder) {
            const video = document.createElement('video');
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'none';
            video.className = 'hero-video';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            
            const source = document.createElement('source');
            source.src = '/video/hero-video-min.mp4';
            source.type = 'video/mp4';
            video.appendChild(source);
            
            video.onloadeddata = () => {
                video.play().catch(console.error);
            };
            
            fullVideoPlaceholder.replaceWith(video);
        }
        
        // Handle video playback after injection
        const handleVideos = () => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                // Mobile optimization: reduce quality and frame rate if needed
                if (isMobile) {
                    video.setAttribute('playbackRate', '0.8');
                }
                
                if (video.paused) {
                    video.play().catch(console.error);
                }
            });
        };
        
        // Handle first user interaction
        const handleFirstInteraction = () => {
            handleVideos();
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('click', handleFirstInteraction);
        };
        
        document.addEventListener('touchstart', handleFirstInteraction);
        document.addEventListener('click', handleFirstInteraction);
        
        // Initial video handling after a short delay
        setTimeout(handleVideos, 100);
        
        return () => {
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('click', handleFirstInteraction);
        };
    }, []);

    return null; // This component only handles video injection
}