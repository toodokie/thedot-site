"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCloseMenu = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsClosing(false);
    }, 500);
  };

  const handleOpenMenu = () => {
    setIsMobileMenuOpen(true);
    setIsClosing(false);
  };

  return (
    <div className="container">
      <div className="header-content">
        
        {/* Logo Section */}
        <div className="logo-section">
          <Link href="/" className="logo-link">
            <Image
              src="/images/logo.png"
              alt="The Dot Creative Agency"
              width={90}
              height={56}
              className="logo-image"
              priority
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="navigation desktop-nav">
          <Link href="/services" className={`nav-link ${isActive('/services') ? 'active' : ''}`}>Services</Link>
          <Link href="/estimate" className={`nav-link ${isActive('/estimate') ? 'active' : ''}`}>Project Estimate</Link>
          <Link href="/brief" className={`nav-link ${isActive('/brief') ? 'active' : ''}`}>Brief</Link>
          <Link href="/blog" className={`nav-link ${isActive('/blog') ? 'active' : ''}`}>Blog</Link>
          <Link href="/contact" className={`nav-link ${isActive('/contact') ? 'active' : ''}`}>Contacts</Link>
        </nav>

        {/* Desktop Contact Section */}
        <div className="contact-section desktop-contact">
          <div className="location-info">
            <svg className="location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="42" height="42">
              <g transform="scale(2.56,2.56)">
                <path d="M47.587,96.063c-23.431,0 -42.494,-19.062 -42.494,-42.494c0,-23.432 19.063,-42.495 42.494,-42.495c4.72,0 9.323,0.763 13.727,2.271c4.16,-3.43 9.486,-5.408 14.819,-5.408c10.98,0 22.751,8.783 22.773,21.858c0.009,5.875 -2.915,12.715 -8.929,20.868c0.069,0.982 0.104,1.954 0.104,2.906c0.001,23.432 -19.062,42.494 -42.494,42.494z" fill="#000000" opacity="0.35"/>
                <path d="M45.587,94.063c-23.431,0 -42.494,-19.062 -42.494,-42.494c0,-23.432 19.063,-42.495 42.494,-42.495c4.72,0 9.323,0.763 13.727,2.271c4.16,-3.43 9.486,-5.408 14.819,-5.408c10.98,0 22.751,8.783 22.773,21.858c0.009,5.875 -2.915,12.715 -8.929,20.868c0.069,0.982 0.104,1.954 0.104,2.906c0.001,23.432 -19.062,42.494 -42.494,42.494z" fill="#f2f2f2"/>
                <circle cx="45.588" cy="51.569" r="35.994" fill="#daff00"/>
                <path d="M81.093,50.069h-16.842c-0.094,-4.993 -0.652,-9.704 -1.593,-13.974c4.133,-1.054 8.094,-2.472 11.774,-4.283c0.744,-0.365 1.049,-1.265 0.684,-2.008c-0.365,-0.744 -1.265,-1.051 -2.008,-0.684c-3.487,1.716 -7.244,3.061 -11.167,4.063c-3.158,-11.487 -9.229,-19.109 -16.354,-19.109c-7.124,0 -13.196,7.622 -16.353,19.109c-3.847,-0.983 -7.534,-2.295 -10.962,-3.964c-0.745,-0.361 -1.642,-0.053 -2.005,0.692c-0.363,0.745 -0.053,1.643 0.692,2.005c3.617,1.761 7.505,3.144 11.558,4.177c-0.941,4.27 -1.499,8.981 -1.593,13.974h-16.807c-0.829,0 -1.5,0.672 -1.5,1.5c0,0.828 0.671,1.5 1.5,1.5h16.807c0.108,5.76 0.834,11.146 2.053,15.911c-4.055,1.003 -7.949,2.353 -11.575,4.079c-0.748,0.356 -1.066,1.251 -0.71,1.999c0.356,0.748 1.254,1.065 1.999,0.71c3.475,-1.654 7.212,-2.946 11.108,-3.902c3.285,10.412 9.067,17.198 15.788,17.198c6.721,0 12.504,-6.786 15.789,-17.198c3.901,0.958 7.643,2.252 11.123,3.909c0.208,0.099 0.428,0.146 0.644,0.146c0.561,0 1.098,-0.315 1.355,-0.855c0.356,-0.747 0.039,-1.643 -0.709,-1.999c-3.631,-1.729 -7.53,-3.081 -11.591,-4.085c1.219,-4.765 1.945,-10.151 2.053,-15.911h16.842c0.829,0 1.5,-0.672 1.5,-1.5c0,-0.828 -0.671,-1.5 -1.5,-1.5zM61.252,50.069h-14.165v-11.886c4.305,-0.09 8.533,-0.559 12.611,-1.401c0.909,4.079 1.457,8.579 1.554,13.287zM58.97,33.87c-3.842,0.785 -7.825,1.225 -11.883,1.313v-17.94c4.973,1.095 9.351,7.552 11.883,16.627zM44.087,17.244v17.94c-4.057,-0.088 -8.04,-0.528 -11.883,-1.313c2.533,-9.076 6.91,-15.533 11.883,-16.627zM31.476,36.784c4.079,0.842 8.308,1.31 12.611,1.4v11.886h-14.163c0.097,-4.709 0.645,-9.208 1.552,-13.286zM29.924,53.069h14.164v13.937c-4.134,0.086 -8.201,0.525 -12.135,1.307c-1.189,-4.577 -1.916,-9.766 -2.029,-15.244zM32.791,71.206c3.663,-0.713 7.448,-1.116 11.296,-1.2v15.889c-4.61,-1.015 -8.705,-6.643 -11.296,-14.689zM47.087,85.895v-15.889c3.849,0.084 7.633,0.488 11.297,1.2c-2.591,8.046 -6.686,13.674 -11.297,14.689zM59.223,68.313c-3.934,-0.782 -8.002,-1.221 -12.136,-1.307v-13.937h14.164c-0.112,5.478 -0.84,10.668 -2.028,15.244z" fill="#35332f" opacity="0.35"/>
                <path d="M74.133,13.964c-7.241,0 -14.798,5.75 -14.81,13.988c-0.015,9.858 14.81,24.684 14.81,24.684c0,0 14.826,-14.806 14.811,-24.685c-0.013,-8.225 -7.57,-13.987 -14.811,-13.987z" fill="#7a776f"/>
                <path d="M90.407,27.806c-0.014,-9.038 -8.318,-15.37 -16.274,-15.37c-4.983,0 -10.101,2.479 -13.234,6.555c-4.647,-2.188 -9.835,-3.417 -15.311,-3.417c-19.879,0 -35.994,16.115 -35.994,35.994c0,19.879 16.115,35.994 35.994,35.994c19.879,0 35.994,-16.115 35.994,-35.994c0,-1.628 -0.119,-3.228 -0.328,-4.799c4.382,-5.611 9.162,-13.80 9.153,-18.963z" fill="none" stroke="#35332f" strokeWidth="3"/>
                <circle cx="74.133" cy="28.025" r="7.109" fill="#f2f2f2"/>
              </g>
            </svg>
            <span>Ontario, Canada</span>
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="mobile-menu-button"
          onClick={() => handleOpenMenu()}
          aria-label="Toggle mobile menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        
      </div>

      {/* Mobile Menu Overlay - Rendered as Portal */}
      {mounted && isMobileMenuOpen && createPortal(
        <div 
          className={`mobile-menu-overlay ${isClosing ? 'closing' : ''}`}
          onClick={() => handleCloseMenu()}
        >
          <nav 
            className="mobile-nav"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="close-button"
              onClick={() => handleCloseMenu()}
              style={{
                position: 'absolute',
                top: '1.5rem',
                right: '2rem',
                cursor: 'pointer',
                zIndex: 10,
                width: '1.5rem',
                height: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <span style={{
                position: 'absolute',
                width: '1.5rem',
                height: '0.125rem',
                background: 'var(--foreground)',
                transform: 'rotate(45deg)',
                transition: 'all 0.3s ease'
              }}></span>
              <span style={{
                position: 'absolute',
                width: '1.5rem',
                height: '0.125rem',
                background: 'var(--foreground)',
                transform: 'rotate(-45deg)',
                transition: 'all 0.3s ease'
              }}></span>
            </div>
            
            <Link href="/services" className={`mobile-nav-link ${isActive('/services') ? 'active' : ''}`} onClick={() => handleCloseMenu()}>
              Services
            </Link>
            <Link href="/estimate" className={`mobile-nav-link ${isActive('/estimate') ? 'active' : ''}`} onClick={() => handleCloseMenu()}>
              Project Estimate
            </Link>
            <Link href="/brief" className={`mobile-nav-link ${isActive('/brief') ? 'active' : ''}`} onClick={() => handleCloseMenu()}>
              Brief
            </Link>
            <Link href="/blog" className={`mobile-nav-link ${isActive('/blog') ? 'active' : ''}`} onClick={() => handleCloseMenu()}>
              Blog
            </Link>
            <Link href="/contact" className={`mobile-nav-link ${isActive('/contact') ? 'active' : ''}`} onClick={() => handleCloseMenu()}>
              Contacts
            </Link>
            
            <div className="mobile-contact">
              <div className="mobile-location">
              <svg className="location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="42" height="42">
              <g transform="scale(2.56,2.56)">
                <path d="M47.587,96.063c-23.431,0 -42.494,-19.062 -42.494,-42.494c0,-23.432 19.063,-42.495 42.494,-42.495c4.72,0 9.323,0.763 13.727,2.271c4.16,-3.43 9.486,-5.408 14.819,-5.408c10.98,0 22.751,8.783 22.773,21.858c0.009,5.875 -2.915,12.715 -8.929,20.868c0.069,0.982 0.104,1.954 0.104,2.906c0.001,23.432 -19.062,42.494 -42.494,42.494z" fill="#000000" opacity="0.35"/>
                <path d="M45.587,94.063c-23.431,0 -42.494,-19.062 -42.494,-42.494c0,-23.432 19.063,-42.495 42.494,-42.495c4.72,0 9.323,0.763 13.727,2.271c4.16,-3.43 9.486,-5.408 14.819,-5.408c10.98,0 22.751,8.783 22.773,21.858c0.009,5.875 -2.915,12.715 -8.929,20.868c0.069,0.982 0.104,1.954 0.104,2.906c0.001,23.432 -19.062,42.494 -42.494,42.494z" fill="#f2f2f2"/>
                <circle cx="45.588" cy="51.569" r="35.994" fill="#daff00"/>
                <path d="M81.093,50.069h-16.842c-0.094,-4.993 -0.652,-9.704 -1.593,-13.974c4.133,-1.054 8.094,-2.472 11.774,-4.283c0.744,-0.365 1.049,-1.265 0.684,-2.008c-0.365,-0.744 -1.265,-1.051 -2.008,-0.684c-3.487,1.716 -7.244,3.061 -11.167,4.063c-3.158,-11.487 -9.229,-19.109 -16.354,-19.109c-7.124,0 -13.196,7.622 -16.353,19.109c-3.847,-0.983 -7.534,-2.295 -10.962,-3.964c-0.745,-0.361 -1.642,-0.053 -2.005,0.692c-0.363,0.745 -0.053,1.643 0.692,2.005c3.617,1.761 7.505,3.144 11.558,4.177c-0.941,4.27 -1.499,8.981 -1.593,13.974h-16.807c-0.829,0 -1.5,0.672 -1.5,1.5c0,0.828 0.671,1.5 1.5,1.5h16.807c0.108,5.76 0.834,11.146 2.053,15.911c-4.055,1.003 -7.949,2.353 -11.575,4.079c-0.748,0.356 -1.066,1.251 -0.71,1.999c0.356,0.748 1.254,1.065 1.999,0.71c3.475,-1.654 7.212,-2.946 11.108,-3.902c3.285,10.412 9.067,17.198 15.788,17.198c6.721,0 12.504,-6.786 15.789,-17.198c3.901,0.958 7.643,2.252 11.123,3.909c0.208,0.099 0.428,0.146 0.644,0.146c0.561,0 1.098,-0.315 1.355,-0.855c0.356,-0.747 0.039,-1.643 -0.709,-1.999c-3.631,-1.729 -7.53,-3.081 -11.591,-4.085c1.219,-4.765 1.945,-10.151 2.053,-15.911h16.842c0.829,0 1.5,-0.672 1.5,-1.5c0,-0.828 -0.671,-1.5 -1.5,-1.5zM61.252,50.069h-14.165v-11.886c4.305,-0.09 8.533,-0.559 12.611,-1.401c0.909,4.079 1.457,8.579 1.554,13.287zM58.97,33.87c-3.842,0.785 -7.825,1.225 -11.883,1.313v-17.94c4.973,1.095 9.351,7.552 11.883,16.627zM44.087,17.244v17.94c-4.057,-0.088 -8.04,-0.528 -11.883,-1.313c2.533,-9.076 6.91,-15.533 11.883,-16.627zM31.476,36.784c4.079,0.842 8.308,1.31 12.611,1.4v11.886h-14.163c0.097,-4.709 0.645,-9.208 1.552,-13.286zM29.924,53.069h14.164v13.937c-4.134,0.086 -8.201,0.525 -12.135,1.307c-1.189,-4.577 -1.916,-9.766 -2.029,-15.244zM32.791,71.206c3.663,-0.713 7.448,-1.116 11.296,-1.2v15.889c-4.61,-1.015 -8.705,-6.643 -11.296,-14.689zM47.087,85.895v-15.889c3.849,0.084 7.633,0.488 11.297,1.2c-2.591,8.046 -6.686,13.674 -11.297,14.689zM59.223,68.313c-3.934,-0.782 -8.002,-1.221 -12.136,-1.307v-13.937h14.164c-0.112,5.478 -0.84,10.668 -2.028,15.244z" fill="#35332f" opacity="0.35"/>
                <path d="M74.133,13.964c-7.241,0 -14.798,5.75 -14.81,13.988c-0.015,9.858 14.81,24.684 14.81,24.684c0,0 14.826,-14.806 14.811,-24.685c-0.013,-8.225 -7.57,-13.987 -14.811,-13.987z" fill="#7a776f"/>
                <path d="M90.407,27.806c-0.014,-9.038 -8.318,-15.37 -16.274,-15.37c-4.983,0 -10.101,2.479 -13.234,6.555c-4.647,-2.188 -9.835,-3.417 -15.311,-3.417c-19.879,0 -35.994,16.115 -35.994,35.994c0,19.879 16.115,35.994 35.994,35.994c19.879,0 35.994,-16.115 35.994,-35.994c0,-1.628 -0.119,-3.228 -0.328,-4.799c4.382,-5.611 9.162,-13.80 9.153,-18.963z" fill="none" stroke="#35332f" strokeWidth="3"/>
                <circle cx="74.133" cy="28.025" r="7.109" fill="#f2f2f2"/>
              </g>
            </svg>
                <span>ONTARIO, CANADA</span>
              </div>
            </div>
          </nav>
        </div>,
        document.body
      )}
    </div>
  );
}