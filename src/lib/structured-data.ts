export function generateFAQSchema(faqs: Array<{question: string, answer: string}>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  }
}

export function generateBreadcrumbSchema(items: Array<{name: string, url: string}>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  }
}

export function generateServiceSchema(service: {
  name: string,
  description: string,
  provider: string,
  areaServed: string,
  priceRange: string
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": service.name,
    "description": service.description,
    "provider": {
      "@type": "LocalBusiness",
      "name": service.provider
    },
    "areaServed": service.areaServed,
    "priceRange": service.priceRange
  }
}

export function generateReviewSchema(reviews: Array<{
  author: string,
  rating: number,
  text: string,
  date: string
}>) {
  const aggregateRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "The Dot Creative Agency",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": aggregateRating.toFixed(1),
      "reviewCount": reviews.length
    },
    "review": reviews.map(review => ({
      "@type": "Review",
      "author": {
        "@type": "Person",
        "name": review.author
      },
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": review.rating
      },
      "reviewBody": review.text,
      "datePublished": review.date
    }))
  }
}