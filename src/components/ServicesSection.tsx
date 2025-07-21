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
      id: 4,
      title: "Professional Foundation",
      price: "$2,500-$4,500",
      description: "Strategic website design that positions your business for growth. Professional aesthetics meet thoughtful user experience, creating digital presence that commands respect and converts visitors.",
      hoverDescription: "• 5-7 page strategic website\n• Professional brand implementation\n• Mobile-first responsive design\n• AODA compliance standards\n• 30-day post-launch support",
      slug: "conversion-essentials",
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
      id: 5,
      title: "Connected Business System",
      price: "$5,500-$7,500",
      description: "Your complete digital transformation. We design exceptional websites then connect them to your existing business tools, creating one intelligent system that saves 10+ hours weekly.",
      hoverDescription: "• Typically reduces admin time by 25-40%\n• Strategic website design\n• Business systems integration\n• Workflow automation setup\n• Team training & documentation\n• 90-day optimization period",
      slug: "conversion-growth-studio",
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
      id: 6,
      title: "Design & Consulting Services",
      price: "Starting at $350",
      description: "Targeted solutions for businesses seeking specific improvements or ongoing partnership. From brand refinement to system optimization.",
      hoverDescription: "Options:\n• Brand Identity Systems\n• AODA Compliance Audit\n• System Integration Consulting\n• Performance Optimization",
      slug: "conversion-essentials",
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
              Selected services
            </h2>
            <h3 className="section-description">
              Solutions curated for our most common client partnerships. From strategic websites to fully integrated business systems.
            </h3>
            
            <div className="services-header-link">
              <a href="/services" className="view-all-link">
                View All Our Solutions
              </a>
            </div>
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
                className={`service-card ${(service.id === 4 || service.id === 5 || service.id === 6) ? 'fast-track-card' : ''}`}
                onMouseEnter={!(service.id === 4 || service.id === 5 || service.id === 6) ? () => setHoveredCard(service.id) : undefined}
                onMouseLeave={!(service.id === 4 || service.id === 5 || service.id === 6) ? () => setHoveredCard(null) : undefined}
                onClick={() => handleCardClick(service.slug)}
                style={{
                  display: 'block',
                  background: 'linear-gradient(135deg, rgba(218, 255, 0, 0.1) 0%, var(--raw-white) 100%)',
                  border: '1px solid rgba(53, 51, 47, 0.2)',
                  borderRadius: '1rem',
                  padding: '3rem 2.5rem',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: service.id === 4 ? 'none' : 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                  animationDelay: `${index * 0.1}s`,
                  cursor: service.id === 4 ? 'default' : 'pointer',
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
                    justifyContent: 'space-between',
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
                  <h4 className="service-card-title">
                    {service.title}
                  </h4>

                  {/* Service Price */}
                  {service.price && (
                    <p 
                      className="service-card-price"
                      style={{
                        fontFamily: 'futura-pt, sans-serif',
                        fontSize: '1rem',
                        fontWeight: 400,
                        lineHeight: 1.2,
                        color: 'var(--foreground)',
                        margin: '0 0 1rem 0',
                      }}
                    >
                      <span dangerouslySetInnerHTML={{ __html: service.price.replace(/\n/g, '<br>') }} />
                    </p>
                  )}

                  {/* Small text for Fast-Track Website */}
                  {service.id === 4 && (
                    <p 
                      className="service-popular-text"
                      style={{
                        fontFamily: 'ff-real-text-pro, sans-serif',
                        fontSize: '0.96rem',
                        fontWeight: 300,
                        fontStyle: 'italic',
                        color: '#666',
                        margin: '0 0 1rem 0',
                      }}
                    >
                      Ideal for businesses ready to elevate their digital presence
                    </p>
                  )}

                  {/* Small text for Conversion Growth Studio */}
                  {service.id === 5 && (
                    <p 
                      className="service-popular-text"
                      style={{
                        fontFamily: 'ff-real-text-pro, sans-serif',
                        fontSize: '0.96rem',
                        fontWeight: 300,
                        fontStyle: 'italic',
                        color: '#666',
                        margin: '0 0 1rem 0',
                      }}
                    >
                      For growing businesses with operational complexity
                    </p>
                  )}

                  {/* Small text for A La Carte Solutions */}
                  {service.id === 6 && (
                    <p 
                      className="service-popular-text"
                      style={{
                        fontFamily: 'ff-real-text-pro, sans-serif',
                        fontSize: '0.96rem',
                        fontWeight: 300,
                        fontStyle: 'italic',
                        color: '#666',
                        margin: '0 0 1rem 0',
                      }}
                    >
                      For specific needs and ongoing optimization
                    </p>
                  )}
                  
                  {/* Service Description */}
                  <p 
                    className="service-card-text"
                    style={{
                      fontFamily: 'ff-real-text-pro, sans-serif',
                      fontSize: '1rem',
                      fontWeight: 200,
                      lineHeight: 1.6,
                      color: 'var(--foreground)',
                      margin: '0 0 1.5rem 0',
                    }}
                  >
                    {service.description}
                  </p>

                  {/* Bullet Points for services */}
                  {(service.id === 4 || service.id === 5 || service.id === 6) && (
                    <div 
                      className="service-bullets"
                      style={{
                        fontFamily: 'ff-real-text-pro, sans-serif',
                        fontSize: '1rem',
                        fontWeight: 200,
                        lineHeight: 1.6,
                        color: 'var(--foreground)',
                        margin: '0 0 1.25rem 0',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {service.hoverDescription}
                    </div>
                  )}


                  {/* CTA Button for Fast-Track Website */}
                  {(service.id === 4 || service.id === 5 || service.id === 6) && (
                    <button 
                      className="services-cta-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(service.id === 6 ? '/estimate' : '/contacts');
                      }}
                    >
                      {service.id === 6 ? 'Get Custom Quote' : 'Book a Discovery Call'}
                    </button>
                  )}
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
                      color: 'var(--foreground)',
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
            padding: 8rem 0 0 0;
          }
          
          .services-header-link {
            margin-top: 2rem;
            display: block;
          }
          
          .view-all-link {
            font-family: 'ff-real-text-pro', sans-serif;
            font-size: 1.2rem;
            font-weight: 200;
            color: var(--foreground);
            text-decoration: underline;
            text-decoration-thickness: 1px;
            text-underline-offset: 4px;
            display: inline-block;
            padding: 0.5rem 1rem 0.5rem 0;
            transition: all 0.3s ease;
          }
          
          .view-all-link:hover {
            color: var(--foreground);
            text-decoration: underline;
            transform: translateX(5px);
          }
          
          /* Responsive font scaling to match blog page pattern */
          @media (min-width: 1000px) {
            .view-all-link {
              font-size: 1.25rem !important;
            }
          }
          
          @media (min-width: 1240px) {
            .view-all-link {
              font-size: 1.375rem !important;
            }
          }
          
          
          .fast-track-card {
            pointer-events: none !important;
          }
          
          .fast-track-card .services-cta-button {
            pointer-events: auto;
          }
          
          .service-card {
            background: radial-gradient(circle at center top, rgba(218, 255, 0, 0.4) 0%, rgba(218, 255, 0, 0.3) 15%, rgba(218, 255, 0, 0.2) 20%, rgba(218, 255, 0, 0.1) 25%, rgba(218, 255, 0, 0.05) 28%, var(--raw-white) 30%) !important;
            transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
            height: 100% !important;
          }
          
          .service-card:hover {
            background: radial-gradient(circle at center 15%, rgba(218, 255, 0, 0.45) 0%, rgba(218, 255, 0, 0.35) 18%, rgba(218, 255, 0, 0.25) 23%, rgba(218, 255, 0, 0.15) 27%, rgba(218, 255, 0, 0.08) 30%, var(--raw-white) 33%) !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 8px 25px rgba(0,0,0,0.12) !important;
          }
          
          .service-icon {
            transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
          }
          
          .service-card:hover .service-icon {
            transform: translateY(2px) !important;
          }
          
          
          @media (max-width: 999px) {
            .services-section {
              padding: 2rem 0 2rem 0;
            }
            
            .services-header-link {
              text-align: left;
            }
            
            .view-all-link {
              font-size: 1rem;
            }
            
          }
          
          @media (max-width: 768px) {
            .services-section {
              padding: 2rem 0 2rem 0;
            }
            
            .service-card-title {
              font-size: 1.8rem !important;
            }
            
            .service-card-text {
              font-size: 1rem !important;
              font-weight: 200 !important;
              line-height: 1.8 !important;
            }
          }
          
          .section-title {
            font-family: 'futura-pt', sans-serif;
            font-size: clamp(2.5rem, 6vw, 4rem);
            font-weight: 300;
            line-height: 1.2;
            color: var(--foreground);
            margin: 0 0 2rem 0;
          }
          
          .section-description {
            font-family: 'ff-real-text-pro', sans-serif;
            font-size: clamp(1.25rem, 2.5vw, 1.5rem);
            font-weight: 300;
            line-height: 1.4;
            color: var(--foreground);
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