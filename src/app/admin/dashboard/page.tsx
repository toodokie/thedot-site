'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Lead {
  id: string;
  source: string;
  name: string;
  email: string;
  company?: string;
  serviceType?: string;
  temperature?: string;
  leadScore?: string;
  estimateAmount?: number;
  budgetRange?: string;
  timeline?: string;
  briefType?: string;
  message?: string;
  date: string;
  status?: string;
}

interface Stats {
  leads: {
    total: number;
    new: number;
    hot: number;
    warm: number;
    cold: number;
  };
  contacts: {
    total: number;
    new: number;
  };
  briefs: {
    total: number;
    priorityHot: number;
    hot: number;
    warm: number;
  };
  security: {
    botBlocks: number;
    rateLimitHits: number;
    lastReset: string;
  };
  revenue: {
    potential: number;
    estimatedTotal: number;
  };
}

interface AnalyticsData {
  overview: {
    sessions: number;
    users: number;
    pageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  pageEngagement: Array<{
    path: string;
    title: string;
    views: number;
    users: number;
    avgTimeOnPage: number;
  }>;
  demographics: {
    age: Array<{
      ageBracket: string;
      users: number;
    }>;
    gender: Array<{
      gender: string;
      users: number;
    }>;
    location: Array<{
      country: string;
      city: string;
      users: number;
    }>;
  };
  events: Array<{
    eventName: string;
    count: number;
    countPerUser: number;
  }>;
  conversionFunnel: {
    calculatorStarted: number;
    calculatorCompleted: number;
    calculatorConversionRate: string;
    contactFormSubmitted: number;
    briefSubmitted: number;
    ctaClicks: number;
    leadsGenerated: number;
    totalConversions: number;
  };
  trafficSources: Array<{
    source: string;
    sessions: number;
  }>;
  period: {
    last7Days: {
      start: string;
      end: string;
    };
    last30Days: {
      start: string;
      end: string;
    };
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'hot' | 'new'>('all');

  useEffect(() => {
    checkAuth();
    fetchData();

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/verify');
      if (!response.ok) {
        router.push('/admin/login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/admin/login');
    }
  };

  const fetchData = async () => {
    try {
      const [leadsRes, statsRes, analyticsRes] = await Promise.all([
        fetch('/api/admin/leads'),
        fetch('/api/admin/stats'),
        fetch('/api/admin/analytics'),
      ]);

      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData.leads || []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      } else {
        console.warn('Analytics data not available');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const filteredLeads = leads.filter(lead => {
    if (activeTab === 'hot') {
      return lead.temperature === 'Hot' || lead.leadScore === 'Hot' || lead.leadScore === 'Priority Hot';
    }
    if (activeTab === 'new') {
      return lead.status === 'New';
    }
    return true;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              margin: '0 auto 1rem',
              animation: 'spin 1s linear infinite'
            }}
          >
            <circle cx="12" cy="12" r="10" stroke="var(--dim-grey)" strokeWidth="4" opacity="0.25"/>
            <path fill="var(--foreground)" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" opacity="0.75"/>
          </svg>
          <p style={{
            color: 'var(--dim-grey)',
            fontFamily: 'futura-pt, Arial, sans-serif'
          }}>
            Loading dashboard...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      fontFamily: 'futura-pt, Arial, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e5e5e5',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div className="container" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 2.5rem'
        }}>
          <div>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '0.25rem'
            }}>
              Admin Dashboard
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--dim-grey)'
            }}>
              The Dot Creative CRM
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link
              href="/admin/portal"
              style={{
                fontSize: '0.875rem',
                color: 'var(--foreground)',
                textDecoration: 'none',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--highlight-color)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            >
              Client Portal
            </Link>
            <Link
              href="/"
              style={{
                fontSize: '0.875rem',
                color: 'var(--foreground)',
                textDecoration: 'none',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--highlight-color)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            >
              View Site
            </Link>
            <button
              onClick={handleLogout}
              style={{
                padding: '0.625rem 1.25rem',
                background: 'var(--foreground)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'futura-pt, Arial, sans-serif'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#2a2826'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--foreground)'}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: '3rem 2.5rem' }}>
        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          {/* Total Leads */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--dim-grey)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '1rem'
            }}>
              Total Leads
            </h3>
            <p style={{
              fontSize: '2.5rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '0.5rem'
            }}>
              {stats?.leads.total || 0}
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--dim-grey)'
            }}>
              {stats?.leads.new || 0} new
            </p>
          </div>

          {/* Hot Leads */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--dim-grey)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '1rem'
            }}>
              Hot Leads
            </h3>
            <p style={{
              fontSize: '2.5rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '0.5rem'
            }}>
              {(stats?.leads.hot || 0) + (stats?.briefs.priorityHot || 0) + (stats?.briefs.hot || 0)}
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--dim-grey)'
            }}>
              {stats?.briefs.priorityHot || 0} priority
            </p>
          </div>

          {/* Revenue Potential */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--dim-grey)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '1rem'
            }}>
              Revenue Potential
            </h3>
            <p style={{
              fontSize: '2.5rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '0.5rem'
            }}>
              {formatCurrency((stats?.revenue.potential || 0) + (stats?.revenue.estimatedTotal || 0))}
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--dim-grey)'
            }}>
              from {(stats?.leads.total || 0) + (stats?.briefs.total || 0)} leads
            </p>
          </div>

          {/* Bot Blocks */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--dim-grey)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '1rem'
            }}>
              Bot Blocks
            </h3>
            <p style={{
              fontSize: '2.5rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '0.5rem'
            }}>
              {stats?.security.botBlocks || 0}
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--dim-grey)'
            }}>
              {stats?.security.rateLimitHits || 0} rate limits
            </p>
          </div>
        </div>

        {/* Google Analytics Section */}
        {analytics && (
          <>
            {/* Overview Stats */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: '3rem'
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: 'var(--foreground)',
                marginBottom: '1.5rem'
              }}>
                Website Traffic (Last 30 Days)
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem'
              }}>
                <div style={{
                  padding: '1rem',
                  background: '#fafafa',
                  borderRadius: '0.5rem'
                }}>
                  <h4 style={{
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Total Users
                  </h4>
                  <p style={{
                    fontSize: '2rem',
                    fontWeight: '600',
                    color: 'var(--foreground)'
                  }}>
                    {analytics.overview.users.toLocaleString()}
                  </p>
                </div>
                <div style={{
                  padding: '1rem',
                  background: '#fafafa',
                  borderRadius: '0.5rem'
                }}>
                  <h4 style={{
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Sessions
                  </h4>
                  <p style={{
                    fontSize: '2rem',
                    fontWeight: '600',
                    color: 'var(--foreground)'
                  }}>
                    {analytics.overview.sessions.toLocaleString()}
                  </p>
                </div>
                <div style={{
                  padding: '1rem',
                  background: '#fafafa',
                  borderRadius: '0.5rem'
                }}>
                  <h4 style={{
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Page Views
                  </h4>
                  <p style={{
                    fontSize: '2rem',
                    fontWeight: '600',
                    color: 'var(--foreground)'
                  }}>
                    {analytics.overview.pageViews.toLocaleString()}
                  </p>
                </div>
                <div style={{
                  padding: '1rem',
                  background: '#fafafa',
                  borderRadius: '0.5rem'
                }}>
                  <h4 style={{
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Bounce Rate
                  </h4>
                  <p style={{
                    fontSize: '2rem',
                    fontWeight: '600',
                    color: 'var(--foreground)'
                  }}>
                    {analytics.overview.bounceRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Page Engagement (Last 7 Days) */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: '3rem'
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: 'var(--foreground)',
                marginBottom: '1.5rem'
              }}>
                Page Engagement (Last 7 Days)
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'futura-pt, Arial, sans-serif'
                }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'var(--dim-grey)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Page</th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'var(--dim-grey)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Views</th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'var(--dim-grey)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Users</th>
                      <th style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'var(--dim-grey)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.pageEngagement.slice(0, 10).map((page, index) => (
                      <tr
                        key={index}
                        style={{
                          borderBottom: '1px solid #f0f0f0',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      >
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--foreground)',
                            marginBottom: '0.25rem'
                          }}>
                            {page.title || page.path}
                          </div>
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--dim-grey)'
                          }}>
                            {page.path}
                          </div>
                        </td>
                        <td style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: 'var(--foreground)'
                        }}>
                          {page.views.toLocaleString()}
                        </td>
                        <td style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontSize: '0.875rem',
                          color: 'var(--foreground)'
                        }}>
                          {page.users.toLocaleString()}
                        </td>
                        <td style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontSize: '0.875rem',
                          color: 'var(--foreground)'
                        }}>
                          {formatTime(page.avgTimeOnPage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Demographics and Conversion Funnel */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '1.5rem',
              marginBottom: '3rem'
            }}>
              {/* Demographics */}
              <div style={{
                background: 'white',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                  marginBottom: '1.5rem'
                }}>
                  Demographics (Last 7 Days)
                </h3>

                {/* Age */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    marginBottom: '0.75rem'
                  }}>
                    Age Groups
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {analytics.demographics.age.slice(0, 5).map((age, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.5rem',
                          background: '#fafafa',
                          borderRadius: '0.375rem'
                        }}
                      >
                        <span style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
                          {age.ageBracket}
                        </span>
                        <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--foreground)' }}>
                          {age.users.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gender */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    marginBottom: '0.75rem'
                  }}>
                    Gender
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {analytics.demographics.gender.map((gender, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.5rem',
                          background: '#fafafa',
                          borderRadius: '0.375rem'
                        }}
                      >
                        <span style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
                          {gender.gender}
                        </span>
                        <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--foreground)' }}>
                          {gender.users.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <h4 style={{
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    marginBottom: '0.75rem'
                  }}>
                    Top Locations
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {analytics.demographics.location.slice(0, 5).map((location, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.5rem',
                          background: '#fafafa',
                          borderRadius: '0.375rem'
                        }}
                      >
                        <span style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
                          {location.city}, {location.country}
                        </span>
                        <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--foreground)' }}>
                          {location.users.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Conversion Funnel */}
              <div style={{
                background: 'white',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                  marginBottom: '1.5rem'
                }}>
                  Conversion Funnel (Last 7 Days)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{
                    padding: '1rem',
                    background: '#fafafa',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: 'var(--dim-grey)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem'
                    }}>
                      Calculator Started
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'var(--foreground)'
                    }}>
                      {analytics.conversionFunnel.calculatorStarted.toLocaleString()}
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#fafafa',
                    borderRadius: '0.5rem',
                    border: '2px solid var(--highlight-color)'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: 'var(--dim-grey)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem'
                    }}>
                      Calculator Completed
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'var(--foreground)',
                      marginBottom: '0.25rem'
                    }}>
                      {analytics.conversionFunnel.calculatorCompleted.toLocaleString()}
                    </div>
                    <div style={{
                      fontSize: '0.875rem',
                      color: 'var(--foreground)'
                    }}>
                      {analytics.conversionFunnel.calculatorConversionRate}% conversion rate
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#fafafa',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: 'var(--dim-grey)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem'
                    }}>
                      Contact Forms
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'var(--foreground)'
                    }}>
                      {analytics.conversionFunnel.contactFormSubmitted.toLocaleString()}
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#fafafa',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: 'var(--dim-grey)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem'
                    }}>
                      Briefs Submitted
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'var(--foreground)'
                    }}>
                      {analytics.conversionFunnel.briefSubmitted.toLocaleString()}
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: 'var(--highlight-color)',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      color: 'var(--foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem'
                    }}>
                      Total Conversions
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'var(--foreground)'
                    }}>
                      {analytics.conversionFunnel.totalConversions.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Traffic Sources */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: '3rem'
            }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: 'var(--foreground)',
                marginBottom: '1rem'
              }}>
                Traffic Sources (Last 7 Days)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {analytics.trafficSources.slice(0, 5).map((source, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      background: '#fafafa',
                      borderRadius: '0.375rem'
                    }}
                  >
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--foreground)'
                    }}>
                      {source.source}
                    </div>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--foreground)'
                    }}>
                      {source.sessions.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Analytics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          {/* Marketing Analytics */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '1.5rem'
            }}>
              Marketing Analytics
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Calculator Leads
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.leads.total || 0}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Contact Forms
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.contacts.total || 0}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Project Briefs
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.briefs.total || 0}
                </span>
              </div>
              <div style={{
                paddingTop: '1rem',
                borderTop: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)' }}>
                  Conversion Rate
                </span>
                <span style={{ fontWeight: '700', fontSize: '1.125rem', color: 'var(--foreground)' }}>
                  {stats && stats.leads.total + stats.contacts.total > 0
                    ? Math.round((stats.briefs.total / (stats.leads.total + stats.contacts.total)) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Lead Temperature */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '1.5rem'
            }}>
              Lead Temperature
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Priority Hot
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.briefs.priorityHot || 0}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Hot
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {(stats?.leads.hot || 0) + (stats?.briefs.hot || 0)}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Warm
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {(stats?.leads.warm || 0) + (stats?.briefs.warm || 0)}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Cold
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.leads.cold || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Security Status */}
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '1.5rem'
            }}>
              Security Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Bot Blocks Today
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.security.botBlocks || 0}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--dim-grey)' }}>
                  Rate Limits Hit
                </span>
                <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>
                  {stats?.security.rateLimitHits || 0}
                </span>
              </div>
              <div style={{
                paddingTop: '1rem',
                borderTop: '1px solid #f0f0f0',
                fontSize: '0.875rem',
                color: 'var(--dim-grey)'
              }}>
                All systems operational
              </div>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e5e5'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: 'var(--foreground)'
              }}>
                Recent Leads
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setActiveTab('all')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: 'futura-pt, Arial, sans-serif',
                    background: activeTab === 'all' ? 'var(--foreground)' : '#f5f5f5',
                    color: activeTab === 'all' ? 'white' : 'var(--foreground)'
                  }}
                >
                  All ({leads.length})
                </button>
                <button
                  onClick={() => setActiveTab('hot')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: 'futura-pt, Arial, sans-serif',
                    background: activeTab === 'hot' ? 'var(--foreground)' : '#f5f5f5',
                    color: activeTab === 'hot' ? (activeTab === 'hot' ? 'var(--highlight-color)' : 'var(--foreground)') : 'var(--foreground)'
                  }}
                >
                  Hot ({leads.filter(l => l.temperature === 'Hot' || l.leadScore === 'Hot' || l.leadScore === 'Priority Hot').length})
                </button>
                <button
                  onClick={() => setActiveTab('new')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: 'futura-pt, Arial, sans-serif',
                    background: activeTab === 'new' ? 'var(--foreground)' : '#f5f5f5',
                    color: activeTab === 'new' ? 'var(--highlight-color)' : 'var(--foreground)'
                  }}
                >
                  New ({leads.filter(l => l.status === 'New').length})
                </button>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'futura-pt, Arial, sans-serif'
            }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Source</th>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Contact</th>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Details</th>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Score</th>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Value</th>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Time</th>
                  <th style={{
                    padding: '0.75rem 1.5rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: 'var(--dim-grey)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '3rem',
                        textAlign: 'center',
                        color: 'var(--dim-grey)',
                        fontSize: '0.875rem'
                      }}
                    >
                      No leads found
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          background: '#f5f5f5',
                          color: 'var(--foreground)',
                          borderRadius: '0.375rem'
                        }}>
                          {lead.source}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: 'var(--foreground)',
                          marginBottom: '0.25rem'
                        }}>
                          {lead.name}
                        </div>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--dim-grey)'
                        }}>
                          {lead.email}
                        </div>
                        {lead.company && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--dim-grey)',
                            opacity: 0.7
                          }}>
                            {lead.company}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{
                          fontSize: '0.875rem',
                          color: 'var(--foreground)'
                        }}>
                          {lead.serviceType || lead.briefType || '-'}
                        </div>
                        {lead.budgetRange && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--dim-grey)'
                          }}>
                            {lead.budgetRange}
                          </div>
                        )}
                        {lead.timeline && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--dim-grey)'
                          }}>
                            {lead.timeline}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', whiteSpace: 'nowrap' }}>
                        {(lead.temperature || lead.leadScore) && (
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            borderRadius: '0.375rem',
                            background: (lead.temperature === 'Hot' || lead.leadScore === 'Hot' || lead.leadScore === 'Priority Hot') ? 'var(--highlight-color)' : '#f5f5f5',
                            color: 'var(--foreground)'
                          }}>
                            {lead.temperature || lead.leadScore}
                          </span>
                        )}
                      </td>
                      <td style={{
                        padding: '1rem 1.5rem',
                        whiteSpace: 'nowrap',
                        fontSize: '0.875rem',
                        color: 'var(--foreground)',
                        fontWeight: '500'
                      }}>
                        {lead.estimateAmount ? formatCurrency(lead.estimateAmount) : '-'}
                      </td>
                      <td style={{
                        padding: '1rem 1.5rem',
                        whiteSpace: 'nowrap',
                        fontSize: '0.875rem',
                        color: 'var(--dim-grey)'
                      }}>
                        {formatDate(lead.date)}
                      </td>
                      <td style={{
                        padding: '1rem 1.5rem',
                        whiteSpace: 'nowrap',
                        fontSize: '0.875rem'
                      }}>
                        <a
                          href={`mailto:${lead.email}`}
                          style={{
                            color: 'var(--foreground)',
                            fontWeight: '500',
                            textDecoration: 'none',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--highlight-color)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--foreground)'}
                        >
                          Email
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
