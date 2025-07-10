'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ServicesSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const router = useRouter();

  const handleCardClick = (slug: string) => {
    router.push(`/services#${slug}`);
  };

  const services = [
      {
        id: 1,
        title: "Website Design & Development",
        description: "Custom websites that convert visitors into customers",
        hoverDescription: "We build responsive websites that work on every device and turn your visitors into paying customers. No template nonsense - just clean, professional design that reflects your business values and drives real results.",
        slug: "website-design",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M52,96c-24.262,0 -44,-19.738 -44,-44c0,-24.262 19.738,-44 44,-44c24.262,0 44,19.738 44,44c0,8.982 -2.755,17.728 -7.829,25.052l0.776,0.873c1.15,1.296 1.743,3.025 1.63,4.748c-0.113,1.723 -0.928,3.36 -2.235,4.49l-6.094,5.262c-1.182,1.02 -2.689,1.581 -4.247,1.581c-1.851,0 -3.62,-0.792 -4.853,-2.174l-0.752,-0.845c-6.269,3.29 -13.24,5.013 -20.396,5.013z" fill="#e5e6d9" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" opacity="0.35"/>
                <path d="M50,94c-24.262,0 -44,-19.738 -44,-44c0,-24.262 19.738,-44 44,-44c24.262,0 44,19.738 44,44c0,8.982 -2.755,17.728 -7.829,25.052l0.776,0.873c1.15,1.296 1.743,3.025 1.63,4.748c-0.113,1.723 -0.928,3.36 -2.235,4.49l-6.094,5.262c-1.182,1.02 -2.689,1.581 -4.247,1.581c-1.851,0 -3.62,-0.792 -4.853,-2.174l-0.752,-0.845c-6.269,3.29 -13.24,5.013 -20.396,5.013z" fill="#d4d5cc" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <circle cx="50" cy="50" r="37.5" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M87.5,50c0,-20.711 -16.789,-37.5 -37.5,-37.5c-20.711,0 -37.5,16.789 -37.5,37.5c0,20.711 16.789,37.5 37.5,37.5c8.066,0 15.53,-2.555 21.647,-6.888l4.353,4.894l6.091,-5.259l-4.407,-4.954c6.096,-6.669 9.816,-15.546 9.816,-25.293z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M87.44,51.506v-3h-17.239c-0.11,-5.856 -0.861,-11.34 -2.126,-16.212c4.447,-1.187 8.441,-2.814 11.725,-4.83l-1.569,-2.557c-3.061,1.879 -6.801,3.399 -10.981,4.509c-3.526,-11.092 -9.866,-18.35 -17.25,-18.35c-7.377,0 -13.712,7.245 -17.239,18.319c-4.063,-1.081 -7.758,-2.544 -10.87,-4.342l-1.501,2.598c3.316,1.916 7.241,3.475 11.543,4.624c-1.269,4.88 -2.023,10.374 -2.133,16.241h-17.24v3h17.239c0.11,5.856 0.861,11.34 2.126,16.212c-4.447,1.187 -8.441,2.814 -11.725,4.83l1.569,2.557c3.061,-1.879 6.801,-3.399 10.981,-4.509c3.526,11.092 9.866,18.35 17.25,18.35c7.377,0 13.712,-7.245 17.239,-18.319c4.063,1.081 7.758,2.544 10.87,4.342l1.501,-2.598c-3.316,-1.916 -7.241,-3.475 -11.543,-4.624c1.269,-4.88 2.023,-10.374 2.133,-16.241zM67.201,48.506h-15.701v-13.977c4.743,-0.091 9.339,-0.614 13.597,-1.524c1.238,4.676 1.989,9.95 2.104,15.501zM64.249,30.125c-3.986,0.834 -8.294,1.315 -12.749,1.404v-17.312c5.239,0.996 9.891,7.132 12.749,15.908zM48.5,14.217v17.312c-4.41,-0.091 -8.716,-0.584 -12.739,-1.435c2.859,-8.76 7.506,-14.882 12.739,-15.877zM34.911,32.975c4.297,0.926 8.893,1.46 13.589,1.554v13.977h-15.701c0.116,-5.563 0.869,-10.848 2.112,-15.531zM32.799,51.506h15.701v13.977c-4.743,0.092 -9.339,0.614 -13.597,1.524c-1.238,-4.676 -1.989,-9.95 -2.104,-15.501zM35.751,69.887c3.986,-0.834 8.294,-1.315 12.749,-1.404v17.312c-5.239,-0.996 -9.891,-7.132 -12.749,-15.908zM51.5,85.795v-17.312c4.41,0.091 8.716,0.584 12.739,1.435c-2.859,8.76 -7.506,14.882 -12.739,15.877zM65.089,67.037c-4.297,-0.926 -8.893,-1.46 -13.589,-1.554v-13.977h15.701c-0.116,5.563 -0.869,10.848 -2.112,15.531z" fill="#3d3c44" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" opacity="0.35"/>
                <path d="M67.155,73.51l-6.595,8.861l-6.53,-28.1l27.161,10.286l-9.768,5.255l8.962,10.322l-4.275,3.691z" fill="#120A8F" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
              </g>
            </g>
          </svg>
        )
      },
      {
        id: 2,
        title: "SEO & Content Strategy",
        description: "Get found online and establish local expertise",
        hoverDescription: "Strategic SEO and content creation that puts you ahead of competitors in Google searches. Blog posts, website copy, and local market optimization that brings qualified leads while you focus on running your business.",
        slug: "seo-content",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero" stroke="none" strokeWidth="none" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M93,79.5v-48c0,-3.584 -2.916,-6.5 -6.5,-6.5h-1.364l2.587,-8.622c0.146,-0.482 0.231,-0.974 0.263,-1.502l0.012,-0.323l-0.004,-0.122c-0.003,-0.291 -0.024,-0.58 -0.065,-0.864l-0.01,-0.363l-0.43,-1.293l-0.104,-0.164c-0.131,-0.276 -0.28,-0.543 -0.447,-0.796l-0.122,-0.188l-0.101,-0.136c-0.356,-0.479 -0.772,-0.905 -1.302,-1.314l-0.181,-0.133l-0.102,-0.064c-0.358,-0.241 -0.742,-0.447 -1.158,-0.619l-0.264,-0.12l-0.337,-0.102c-0.341,-0.103 -0.686,-0.175 -1.03,-0.218l-0.235,-0.057h-12.606c-3.584,0 -6.5,2.916 -6.5,6.5c0,1.319 0.396,2.548 1.073,3.575l-1.701,1.105l-0.27,-0.27c-1.227,-1.232 -2.862,-1.91 -4.601,-1.91c-1.394,0 -2.725,0.436 -3.845,1.259l-10.504,7.701l-0.051,-0.051c-1.228,-1.231 -2.862,-1.909 -4.601,-1.909c-1.207,0 -2.388,0.335 -3.406,0.965l-26.001,16c-1.478,0.91 -2.514,2.34 -2.916,4.029c-0.402,1.69 -0.122,3.436 0.787,4.912c0.930,1.512 2.398,2.54 4.079,2.922c-0.027,0.237 -0.043,0.478 -0.043,0.723v25.624c-2.863,0.679 -5,3.257 -5,6.325c0,3.584 2.916,6.5 6.5,6.5h78c3.584,0 6.5,-2.916 6.5,-6.5c0,-2.699 -1.653,-5.019 -4,-6z" fill="#f2f2f2" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M27,83h-11.5v-31.449h12z" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M65.5,83.5h-11.5l-0.5,-47h12z" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M84.5,83.5h-11.5l-0.5,-54h12z" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <rect x="15.5" y="51.551" width="12" height="31.949" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M46,83h-11.5v-38.508h12z" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <rect x="34.5" y="44.492" width="12" height="39.008" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="53.5" y="36.5" width="12" height="47" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="72.5" y="29.5" width="12" height="54" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10.5,83.5h78" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M67.5,12.5h12l-20,13l-4,-4l-15,11l-4,-4l-26,16" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M76.5,22.5l3,-10" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
            </g>
          </svg>
        )
      },
      {
        id: 3,
        title: "Website Maintenance & Support",
        description: "Keep your site secure, fast, and converting customers",
        hoverDescription: "Professional ongoing website care so you can focus on running your business. Security updates, content changes, speed optimization, and regular backups. No technical headaches for you.",
        slug: "website-maintenance",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M19.5,90c-5.23828,0 -9.5,-4.26172 -9.5,-9.5v-57c0,-5.23828 4.26172,-9.5 9.5,-9.5h65c5.23828,0 9.5,4.26172 9.5,9.5v57c0,5.23828 -4.26172,9.5 -9.5,9.5z" fill="#000000" opacity="0.35"/>
                <path d="M17.5,88c-5.23828,0 -9.5,-4.26172 -9.5,-9.5v-57c0,-5.23828 4.26172,-9.5 9.5,-9.5h65c5.23828,0 9.5,4.26172 9.5,9.5v57c0,5.23828 -4.26172,9.5 -9.5,9.5z" fill="#f2f2f2"/>
                <path d="M85.5,30.085v48.415c0,1.657 -1.343,3 -3,3h-65c-1.657,0 -3,-1.343 -3,-3v-48.777z" fill="#b4b6a6"/>
                <path d="M82.5,18.5h-65c-1.657,0 -3,1.343 -3,3v10.5h71v-10.5c0,-1.657 -1.343,-3 -3,-3z" fill="#3d3c44"/>
                <path d="M82.5,83h-65c-2.48145,0 -4.5,-2.01855 -4.5,-4.5v-57c0,-2.48145 2.01855,-4.5 4.5,-4.5h65c2.48145,0 4.5,2.01855 4.5,4.5v57c0,2.48145 -2.01855,4.5 -4.5,4.5zM17.5,20c-0.82715,0 -1.5,0.67285 -1.5,1.5v57c0,0.82715 0.67285,1.5 1.5,1.5h65c0.82715,0 1.5,-0.67285 1.5,-1.5v-57c0,-0.82715 -0.67285,-1.5 -1.5,-1.5z" fill="#40396e"/>
                <path d="M28.97598,24h0c1.10457,0 2,0.89543 2,2v0c0,1.10457 -0.89543,2 -2,2h0c-1.10457,0 -2,-0.89543 -2,-2v0c0,-1.10457 0.89543,-2 2,-2z" fill="#b4b6a6"/>
                <path d="M21.97598,24h0c1.10457,0 2,0.89543 2,2v0c0,1.10457 -0.89543,2 -2,2h0c-1.10457,0 -2,-0.89543 -2,-2v0c0,-1.10457 0.89543,-2 2,-2z" fill="#442afa"/>
                <path d="M78.02402,28h-42c-1.10457,0 -2,-0.89543 -2,-2v0c0,-1.10457 0.89543,-2 2,-2h42c1.10457,0 2,0.89543 2,2v0c0,1.10457 -0.89543,2 -2,2z" fill="#f2f2f2"/>
                <path d="M48,36h-28v11h28z" fill="#daff00"/>
                <path d="M48,51h-28v25h28z" fill="#daff00"/>
                <path d="M80,36h-28v40h28z" fill="#daff00"/>
              </g>
            </g>
          </svg>
        )
      },
      {
        id: 4,
        title: "Brand Identity & Print Materials",
        description: "Complete visual identity from logo to business cards",
        hoverDescription: "Comprehensive brand systems including logo, colors, typography, business cards, brochures, and signage. Every piece works together to build instant recognition and trust with your customers.",
        slug: "brand-identity",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M96,52c0,24.26 -19.74,44 -44,44c-24.26,0 -44,-19.74 -44,-44c0,-6.77 1.56,-13.42 4.54,-19.45l-7.06,-7.26c-3.51,-3.63 -3.45,-9.5 0.1,-13.05c1.72,-1.73 4.13,-2.72 6.61,-2.72c1.78,0 3.5,0.5 4.97,1.43l8.81,5.61c7.52,-5.54 16.62,-8.56 26.03,-8.56c24.26,0 44,19.74 44,44z" fill="#3d3c44" opacity="0.3"/>
                <path d="M94,50c0,24.26 -19.74,44 -44,44c-24.26,0 -44,-19.74 -44,-44c0,-6.77 1.56,-13.42 4.54,-19.45l-7.06,-7.26c-3.51,-3.63 -3.45,-9.5 0.1,-13.05c1.72,-1.73 4.13,-2.72 6.61,-2.72c1.78,0 3.5,0.5 4.97,1.43l8.81,5.61c7.52,-5.54 16.62,-8.56 26.03,-8.56c24.26,0 44,19.74 44,44z" fill="#f2f2f2"/>
                <path d="M19.192,28.629c-4.215,6.064 -6.692,13.426 -6.692,21.371c0,20.711 16.789,37.5 37.5,37.5c3.786,0 7.439,-0.567 10.884,-1.61c14.743,-15.841 0.15,-27.945 -5.634,-34.265c1.588,0.295 3.072,0.46 4.479,0.531c-5.435,-0.978 -13.483,-3.019 -20.354,-7.156c-3.094,-1.863 -12.144,-9.456 -20.183,-16.371z" fill="#daff00"/>
                <path d="M81.474,29.624c-6.684,-10.303 -18.279,-17.124 -31.474,-17.124c-12.766,0 -24.035,6.384 -30.808,16.129c8.039,6.915 17.089,14.508 20.183,16.371c6.871,4.137 14.919,6.178 20.354,7.156c16.368,0.821 20.871,-12.76 21.745,-22.532z" fill="#f5ffba"/>
                <path d="M87.5,50c0,-7.515 -2.219,-14.509 -6.026,-20.376c-0.949,10.613 -6.166,25.731 -26.224,22.001c5.784,6.32 20.378,18.424 5.634,34.265c15.402,-4.665 26.616,-18.965 26.616,-35.89z" fill="#442afa"/>
                <path d="M75,64.28c0,3.87 -1.26,7.66 -3.26,10.59c-1.95,1.9 -4.15,3.53 -6.55,4.85c-4.36,2.41 -9.36,3.78 -14.69,3.78c-16.84,0 -30.5,-13.66 -30.5,-30.5c0,-2.7 0.35,-5.32 1.01,-7.81c0.23,12.64 10.55,22.81 23.24,22.81c7.09,0 13.45,-3.18 17.71,-8.19c0.34,-0.4 0.67,-0.81 0.98,-1.24l0.01,-0.01c1.28,-1.27 3.04,-2.06 4.99,-2.06c3.52,0 6.45,2.59 6.97,5.97v0.04c0.06,0.34 0.09,1.77 0.09,1.77z" fill="#3d3c44"/>
                <path d="M56.499,53.819c-2.197,2.806 -9.177,4.366 -17.329,-4.227c-0.758,-0.799 -29,-31 -29,-31c-0.86,-0.888 -3.113,-3.462 -2.233,-4.342c0.437,-0.437 1.016,-0.658 1.596,-0.658c0.422,0 2.264,1.764 2.636,2c0,0 36.126,21.475 37,22c10,5.999 9.527,13.428 7.33,16.227z" fill="#6d6b77"/>
                <path d="M50,11c-9.83,0 -18.83,3.66 -25.69,9.7l-11.83,-7.53c-1.65,-1.05 -3.96,-0.81 -5.35,0.59c-1.66,1.66 -1.68,4.37 -0.05,6.06l9.63,9.9c-3.62,5.91 -5.71,12.86 -5.71,20.28c0,21.5 17.5,39 39,39c21.5,0 39,-17.5 39,-39c0,-21.5 -17.5,-39 -39,-39zM49.204,85.991c-18.933,-0.411 -34.542,-15.821 -35.183,-34.748c-0.238,-7.034 1.554,-13.649 4.849,-19.293c0.26,-0.445 0.528,-0.885 0.804,-1.319c0.492,-0.773 0.364,-1.788 -0.275,-2.445l-0.989,-1.016l-9.18,-9.44c-0.5,-0.51 -0.49,-1.34 0.02,-1.85c0.42,-0.42 1.13,-0.49 1.63,-0.18l11.19,7.12l1.266,0.807c0.763,0.486 1.755,0.397 2.422,-0.214c0.388,-0.355 0.785,-0.702 1.192,-1.043c7.158,-5.978 16.664,-9.242 26.91,-8.167c16.719,1.753 30.16,15.17 31.932,31.887c2.318,21.865 -15.08,40.368 -36.588,39.901z" fill="#3d3c44"/>
                <path d="M62.125,62.5l-12.125,-8.5c0,0 -0.5,-4.375 5,-6c5.75,5 12.625,10 12.625,10z" fill="#f2f2f2"/>
                <path d="M75,64.28c0,3.87 -1.26,7.66 -3.26,10.59c-1.95,1.9 -4.15,3.53 -6.55,4.85c0.79,-1.23 1.52,-3.38 1.52,-4.82c0,-2.14 -0.97,-4.06 -2.49,-5.35c-0.24,-0.2 -0.36,-0.22 -0.8,-0.57c-1.55,-1.28 -2.55,-3.23 -2.55,-5.42c0,-1.38 0.39,-2.67 1.09,-3.75c0.27,-0.45 0.6,-0.87 0.98,-1.24l0.01,-0.01c1.28,-1.27 3.04,-2.06 4.99,-2.06c3.52,0 6.45,2.59 6.97,5.97v0.04c0.06,0.34 0.09,1.77 0.09,1.77z" fill="#6d6b77"/>
              </g>
            </g>
          </svg>
        )
      },
      {
        id: 6,
        title: "Professional Photography & Video",
        description: "High-quality visuals that make your business look established",
        hoverDescription: "Professional headshots, product photography, and promotional videos that compete with big corporations. Stop losing customers to blurry phone photos. We make your business look as professional as it deserves.",
        slug: "photography-video",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M16.5,94c-5.24671,0 -9.5,-4.2533 -9.5,-9.5v-54c0,-5.24671 4.25329,-9.5 9.5,-9.5h5.83398l0.81934,-2.91797c0.68555,-2.44238 2.28125,-4.47168 4.49414,-5.71484c1.41895,-0.79785 3.02441,-1.21973 4.64453,-1.21973c0.86816,0 1.73438,0.12012 2.57422,0.35547l12.68164,3.56152l3.43457,-4.35156c1.57324,-1.99219 3.82617,-3.25195 6.3457,-3.54883c0.36621,-0.04395 0.75,-0.06738 1.12891,-0.06738c2.14648,0 4.17676,0.70898 5.87207,2.04883l31.19727,24.62695c1.99219,1.57324 3.25195,3.82715 3.54883,6.34668c0.29688,2.51855 -0.40527,5.00293 -1.97656,6.99512c-14.26339,18.12404 -24.16952,31.35107 -28.76925,37.57278c-1.97433,2.67054 -4.27175,5.07908 -6.84696,7.17624h0c-1.72168,1.39746 -3.79004,2.13672 -5.98242,2.13672z" fill="#3d3c44" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" opacity="0.35"/>
                <path d="M14.5,92c-5.24671,0 -9.5,-4.2533 -9.5,-9.5v-54c0,-5.24671 4.25329,-9.5 9.5,-9.5h5.83398l0.81934,-2.91797c0.68555,-2.44238 2.28125,-4.47168 4.49414,-5.71484c1.41895,-0.79785 3.02441,-1.21973 4.64453,-1.21973c0.86816,0 1.73438,0.12012 2.57422,0.35547l12.68164,3.56152l3.43457,-4.35156c1.57324,-1.99219 3.82617,-3.25195 6.3457,-3.54883c0.36621,-0.04395 0.75,-0.06738 1.12891,-0.06738c2.14648,0 4.17676,0.70898 5.87207,2.04883l31.19727,24.62695c1.99219,1.57324 3.25195,3.82715 3.54883,6.34668c0.29688,2.51855 -0.40527,5.00293 -1.97656,6.99512c-14.26339,18.12403 -24.16952,31.35107 -28.76925,37.57278c-1.97433,2.67054 -4.27175,5.07908 -6.84696,7.17624h0c-1.72168,1.39746 -3.79004,2.13672 -5.98242,2.13672z" fill="#f2f2f2" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M51.70171,84.75571l-31.20117,-24.63063c-1.30047,-1.02661 -1.52248,-2.91309 -0.49587,-4.21356l34.08007,-43.17137c1.02661,-1.30047 2.91309,-1.52248 4.21356,-0.49587l31.20117,24.63063c1.30047,1.02661 1.52248,2.91309 0.49586,4.21356l-34.08006,43.17137c-1.02661,1.30048 -2.91309,1.52248 -4.21356,0.49587z" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M49.81797,85.9134l-34.89397,-9.79858c-2.52775,-0.70982 -4.00147,-3.33438 -3.29165,-5.86213l13.9216,-49.57656c0.70982,-2.52775 3.33438,-4.00147 5.86213,-3.29165l34.89397,9.79858c2.52775,0.70982 4.00147,3.33438 3.29166,5.86213l-13.9216,49.57656c-0.70982,2.52775 -3.33438,4.00147 -5.86213,3.29166z" fill="#442afa" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M52.375,85.5h-37.875c-1.65685,0 -3,-1.34315 -3,-3v-52.5c0,-1.65685 1.34315,-3 3,-3h37.875c1.65685,0 3,1.34315 3,3v52.5c0,1.65685 -1.34315,3 -3,3z" fill="#daff00" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <rect x="11.511" y="72.532" width="43.864" height="12.968" fill="#9a98a7" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M89.49945,36.87488l-31.20117,-24.63062c-1.30048,-1.02661 -3.18695,-0.80457 -4.21356,0.49585l-6.12097,7.75385l-16.85327,-4.7326c-1.59521,-0.44794 -3.25146,0.48206 -3.6994,2.07721l-2.15143,7.66144h-10.75964c-1.65686,0 -3,1.34314 -3,3v54c0,1.65686 1.34314,3 3,3h39c0.71783,0 1.36792,-0.26251 1.88428,-0.68304c0.42584,-0.29028 34.61108,-43.72852 34.61108,-43.72852c1.02661,-1.30048 0.80457,-3.18695 -0.49591,-4.21356z" fill="none" stroke="#3d3c44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
            </g>
          </svg>
        )
      },
      {
        id: 8,
        title: "Social Media & Digital Marketing",
        description: "Strategic online presence that builds customer relationships",
        hoverDescription: "Social media content, digital campaigns, and online marketing that keeps your business top-of-mind. Consistent posting and engagement strategies that turn followers into customers.",
        slug: "social-media",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0,0,256,256">
            <g fill="none" fillRule="nonzero" stroke="none" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="10" strokeDasharray="" strokeDashoffset="0" fontFamily="none" fontWeight="none" fontSize="none" textAnchor="none" style={{mixBlendMode: 'normal'}}>
              <g transform="scale(2.56,2.56)">
                <path d="M19.5,90c-5.238,0 -9.5,-4.262 -9.5,-9.5v-57c0,-5.238 4.262,-9.5 9.5,-9.5h65c5.238,0 9.5,4.262 9.5,9.5v57c0,5.238 -4.262,9.5 -9.5,9.5z" fill="#3d3c44" stroke="none" strokeWidth="1" opacity="0.35"/>
                <path d="M17.5,88c-5.238,0 -9.5,-4.262 -9.5,-9.5v-57c0,-5.238 4.262,-9.5 9.5,-9.5h65c5.238,0 9.5,4.262 9.5,9.5v57c0,5.238 -4.262,9.5 -9.5,9.5z" fill="#f2f2f2" stroke="none" strokeWidth="1"/>
                <path d="M85.75,32.114v42.647c0,3.844 -3.145,6.989 -6.989,6.989h-61.011c-1.657,0 -3,-1.343 -3,-3v-47z" fill="#daff00" stroke="none" strokeWidth="1"/>
                <path d="M82,18h-65c-1.657,0 -3,1.343 -3,3v11h71v-11c0,-1.657 -1.343,-3 -3,-3z" fill="#3d3c44" stroke="none" strokeWidth="1"/>
                <path d="M82.5,81.5h-65c-1.657,0 -3,-1.343 -3,-3v-57c0,-1.657 1.343,-3 3,-3h65c1.657,0 3,1.343 3,3v57c0,1.657 -1.343,3 -3,3z" fill="none" stroke="#3d3c44" strokeWidth="3"/>
                <circle cx="21.999" cy="25.969" r="2" fill="#daff00" stroke="none" strokeWidth="1"/>
                <circle cx="29" cy="26" r="2" fill="#daff00" stroke="none" strokeWidth="1"/>
                <path d="M25.69,63.601c-0.688,0 -1.179,-0.229 -1.475,-0.688c-0.295,-0.459 -0.287,-1.024 0.024,-1.696l6.292,-13.788c0.262,-0.557 0.573,-0.962 0.934,-1.217c0.36,-0.254 0.778,-0.381 1.254,-0.381c0.475,0 0.893,0.127 1.253,0.381c0.36,0.254 0.664,0.66 0.91,1.217l6.341,13.788c0.311,0.688 0.324,1.258 0.037,1.708c-0.287,0.451 -0.75,0.676 -1.389,0.676c-0.557,0 -0.987,-0.131 -1.29,-0.393c-0.304,-0.262 -0.57,-0.671 -0.799,-1.229l-1.032,-2.359h-8.086l-1.008,2.359c-0.246,0.574 -0.508,0.987 -0.786,1.241c-0.279,0.254 -0.673,0.381 -1.18,0.381zM32.67,50.108l-2.728,6.538h5.554l-2.777,-6.538z" fill="#3d3c44" stroke="none" strokeWidth="1"/>
                <path d="M45.696,63.38c-1.327,0 -1.991,-0.663 -1.991,-1.991v-13.346c0,-1.327 0.664,-1.991 1.991,-1.991h4.792c2.949,0 5.235,0.749 6.857,2.249c1.622,1.499 2.433,3.634 2.433,6.403c0,2.769 -0.811,4.907 -2.433,6.414c-1.622,1.508 -3.908,2.261 -6.857,2.261h-4.792zM47.514,60.259h2.753c3.687,0 5.53,-1.851 5.53,-5.554c0,-3.687 -1.843,-5.53 -5.53,-5.53h-2.753z" fill="#3d3c44" stroke="none" strokeWidth="1"/>
                <path d="M68.922,63.65c-1.049,0 -2.098,-0.114 -3.146,-0.344c-1.048,-0.23 -1.958,-0.565 -2.728,-1.008c-0.459,-0.246 -0.745,-0.578 -0.86,-0.996c-0.115,-0.418 -0.09,-0.823 0.074,-1.217c0.164,-0.394 0.426,-0.671 0.786,-0.836c0.36,-0.164 0.795,-0.123 1.303,0.123c0.655,0.377 1.384,0.655 2.187,0.836c0.803,0.181 1.597,0.27 2.384,0.27c1.179,0 2.028,-0.184 2.544,-0.553c0.516,-0.369 0.774,-0.831 0.774,-1.389c0,-0.475 -0.181,-0.852 -0.541,-1.131c-0.36,-0.278 -0.991,-0.516 -1.892,-0.713l-2.777,-0.59c-3.097,-0.655 -4.645,-2.261 -4.645,-4.817c0,-1.098 0.295,-2.061 0.885,-2.888c0.59,-0.828 1.413,-1.471 2.47,-1.93c1.057,-0.458 2.282,-0.688 3.674,-0.688c0.917,0 1.818,0.111 2.703,0.332c0.885,0.221 1.663,0.545 2.335,0.971c0.409,0.246 0.663,0.565 0.762,0.958c0.098,0.393 0.069,0.77 -0.086,1.131c-0.156,0.36 -0.418,0.614 -0.786,0.762c-0.369,0.147 -0.823,0.09 -1.364,-0.172c-0.541,-0.278 -1.115,-0.483 -1.721,-0.615c-0.606,-0.131 -1.229,-0.197 -1.868,-0.197c-1.032,0 -1.831,0.201 -2.397,0.602c-0.565,0.402 -0.848,0.921 -0.848,1.56c0,0.476 0.172,0.86 0.516,1.155c0.344,0.295 0.942,0.533 1.794,0.713l2.777,0.59c3.179,0.693 4.769,2.249 4.769,4.674c0,1.081 -0.291,2.028 -0.873,2.839c-0.582,0.811 -1.401,1.442 -2.457,1.893c-1.057,0.45 -2.307,0.675 -3.748,0.675z" fill="#3d3c44" stroke="none" strokeWidth="1"/>
              </g>
            </g>
          </svg>
        )
      }
    ];
  
    return (
      <section 
        className="services-section"
        style={{ 
          background: '#faf9f6', 
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 50
        }}
      >
        <div style={{ 
          maxWidth: '120rem',
          margin: '0 auto',
          padding: '0 2.5rem',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Services Header */}
          <div 
            className="services-header"
            style={{
              textAlign: 'left',
              marginBottom: '6rem',
              boxSizing: 'border-box'
            }}
          >
            <h2 className="section-title">
              Services
            </h2>
            <h3 className="section-description">
              Explore our diverse range of services designed to meet all your brand&apos;s creative and marketing needs.
            </h3>
          </div>
  
          {/* Services Grid */}
          <div 
            className="services-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '2rem',
              boxSizing: 'border-box'
            }}
          >
            {services.map((service, index) => {
              const isHovered = hoveredCard === service.id;
              const showDescription = isHovered;
              
              return (
                <div
                key={service.id}
                className="service-card"
                onMouseEnter={() => setHoveredCard(service.id)}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => handleCardClick(service.slug)}
                style={{
                  display: 'block',
                  background: '#faf9f6',
                  border: '1px solid rgba(53, 51, 47, 0.2)',
                  borderRadius: '1rem',
                  padding: '3rem 2.5rem',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                  animationDelay: `${index * 0.1}s`,
                  cursor: 'pointer',
                  minHeight: '250px'
                }}
              >
                {/* Default State */}
                <div 
                  style={{
                    opacity: showDescription ? 0 : 1,
                    transition: 'opacity 0.3s ease',
                    position: 'relative',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Service Icon */}
                  <div 
                    className="service-icon"
                    style={{
                      width: '4rem',
                      height: '4rem',
                      marginBottom: '2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    {service.icon}
                  </div>
    
                  {/* Service Title */}
                  <h4 
                    className="service-card-title"
                    style={{
                      fontFamily: 'futura-pt, sans-serif',
                      fontSize: '1.5rem',
                      fontWeight: 400,
                      lineHeight: 1.3,
                      color: '#35332f',
                      margin: '0 0 1rem 0',
                    }}
                  >
                    {service.title}
                  </h4>
                  
                  {/* Service Description */}
                  <p 
                    className="service-card-text"
                    style={{
                      fontFamily: 'ff-real-text-pro-2, sans-serif',
                      fontSize: '1rem',
                      fontWeight: 300,
                      lineHeight: 1.5,
                      color: '#35332f',
                      margin: 0,
                    }}
                  >
                    {service.description}
                  </p>
                </div>

                {/* Hover State */}
                <div 
                  style={{
                    opacity: showDescription ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: '3rem 2.5rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <p 
                    style={{
                      fontFamily: 'futura-pt, sans-serif',
                      fontSize: '1.3rem',
                      fontWeight: 400,
                      lineHeight: 1.6,
                      color: '#35332f',
                      margin: 0,
                    }}
                  >
                    {service.hoverDescription || service.description}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        </div>
        
        <style jsx>{`
          .services-section {
            padding: 8rem 0;
          }
          
          @media (max-width: 999px) {
            .services-section {
              padding: 4rem 0;
            }
          }
          
          @media (max-width: 768px) {
            .services-section {
              padding: 4rem 0;
              margin-top: 2rem; /* Extra margin to prevent overlap */
            }
          }
          
          .section-title {
            font-family: 'futura-pt', sans-serif;
            font-size: clamp(2.5rem, 6vw, 4rem);
            font-weight: 400;
            line-height: 1.2;
            color: #35332f;
            margin: 0 0 2rem 0;
          }
          
          .section-description {
            font-family: 'ff-real-text-pro-2', sans-serif;
            font-size: clamp(1.25rem, 2.5vw, 1.5rem);
            font-weight: 300;
            line-height: 1.4;
            color: #35332f;
            margin: 0;
            opacity: 0.8;
          }
          
          @media (max-width: 768px) {
            .services-grid {
              grid-template-columns: 1fr !important;
              gap: 1.5rem !important;
            }
            
            .service-card {
              padding: 2rem 1.5rem !important;
            }
            
            .service-icon {
              width: 3rem !important;
              height: 3rem !important;
              margin-bottom: 1.5rem !important;
            }
          }
        `}</style>
      </section>
    );
  }