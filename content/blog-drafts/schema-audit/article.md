| Field | Value |
| --- | --- |
| Title | Your Website Has Schema. Is It Actually Helping? |
| Slug | is-your-schema-actually-helping |
| metaTitle | Your Website Has Schema. Is It Actually Helping? |
| metaDescription | Having schema isn't the same as having schema that works. Here's the 12-point audit that checks whether your structured data actually helps search and AI. |
| Excerpt | Most business sites already have schema, and almost none of it has been checked. Here is the 12-point audit we use to tell whether your structured data actually helps search and AI systems, or just sits there. |
| Category | Marketing |
| Tags | Structured Data, Schema, Technical SEO, AI Search, Local SEO, SEO |
| Read time | 6 min read |
| Featured image | /images/blog/is-your-schema-actually-helping/cover.jpg |
| Author | The Dot Creative |

# Your Website Has Schema. Is It Actually Helping?

Most business websites already ship with structured data. If you run on Squarespace, WordPress, Shopify, or Wix, some schema is almost certainly in your pages right now, whether you added it on purpose or not. So the useful question is not whether you have schema. It is whether the schema you have is accurate, complete enough, connected across your pages, consistent with what visitors actually see, and readable by a machine. Having schema and having schema that works are two very different things.

## First, what schema actually does (and what it doesn't)

Structured data is a quiet layer of code that labels the facts on your page. This is a business, here is its name, address, and phone number. This is an article, here is who wrote it and when. It helps search systems understand your page with less guesswork. That is the honest description of the job.

Now the part the plugin ads leave out. Schema is not a guaranteed ranking tool. Adding it does not directly improve your rankings, and there is no special "AI schema" that unlocks AI search. In its own guidance, Google is clear that the normal SEO requirements apply to [AI Overviews and AI Mode](https://developers.google.com/search/docs/appearance/ai-features). There is no separate structured-data requirement to appear there. What good structured data does is give search systems clearer, less ambiguous facts about a page and the entities it describes. Clearer facts are worth having. They are not a shortcut.

If AI search is the reason schema is on your mind, the companion piece in this series, [Can You Submit Your Brand to AI Search?](https://www.thedotcreative.co/blog/can-you-submit-your-brand-to-ai-search), answers that question head on. And if you are still working out how AI even finds local businesses, start with [Can AI Find Your Business?](https://www.thedotcreative.co/blog/can-ai-find-your-business).

## The 12-point schema audit you can save

This is the audit we actually run. Twelve checks, grouped into four questions. Save it, or hand it to whoever manages your site.

### Is it valid?

1. **Inventory.** What schema types and properties are already present on each template? You cannot fix what you have not listed. Write down what every page type already outputs.
2. **Syntax.** Run the page through the [Schema.org Validator](https://validator.schema.org/). Does it find malformed JSON-LD, broken values, or disconnected nodes?
3. **Search eligibility.** Run the page through Google's Rich Results Test. Does it recognize a supported feature, and does it flag any missing requirements?

### Does it tell the truth?

4. **Page fit.** Does the main schema type describe the main subject of the page? A contact page marked up as an article is a mismatch.
5. **Visible truth.** Does every marked-up fact appear on the page, and is it still current? A claim in your code that a visitor cannot see is a problem.
6. **Completeness.** Are the required fields present? Are recommended fields added only when they are real and useful, not padded for the sake of it?

### Is it the right shape?

7. **Specificity.** Is the most appropriate current type in use? Avoid deprecated types such as [ProfessionalService](https://schema.org/ProfessionalService).
8. **Entity identity.** Do repeated entities use stable `@id` values and the same canonical facts, so the same business is not described two slightly different ways?
9. **Relationships.** Do your WebSite, Organization, [LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business), Article, BreadcrumbList, and any real Service nodes point to one another correctly?

### Does it hold together, and stay that way?

10. **Consistency.** Do your name, address, phone, URL, logo, and official profiles agree across the site, your Google Business Profile, Bing Places, and your official social accounts?
11. **Delivery.** Is the markup actually present in the rendered page? Is the URL crawlable, indexable, and canonical? Schema a crawler never reaches does nothing.
12. **Monitoring.** After you deploy, re-test the live URL and inspect it in Search Console. This is not a one-time job.

## Two tools, two different jobs

A lot of confusion comes from treating these two tools as interchangeable. They are not.

Use the [Schema.org Validator](https://validator.schema.org/) to see your full graph and catch syntax issues. It shows you the whole structure and where it breaks. Use Google's Rich Results Test to check for Google-supported search features. It tells you what Google can recognize. They do different jobs, and neither replaces the other.

One thing worth saying plainly: a green result on the Rich Results Test is not proof that a rich result will appear. Google explicitly says appearance is not guaranteed. The test confirms eligibility, not the outcome. And a graph can pass the syntax check while still being inaccurate, incomplete, irrelevant to the page, or blocked from crawling. Valid is not the same as useful.

## What an audit typically finds for a service business

Here is the pattern we see again and again with professional-services firms. The site does not have "no schema." A Squarespace or WordPress site usually outputs basic WebSite, Organization, LocalBusiness, and Article structured data on its own. So the right scope is almost never a fresh install. It is an audit, a round of corrections, and some careful enrichment.

When we work through a service business, the priorities tend to look like this:

- Give the main business entity a stable, canonical `@id`, then reference it consistently from the website and article publisher nodes.
- Reconcile the Organization and LocalBusiness nodes so they describe the same real business, not two slightly different identities.
- Confirm the canonical business name, legal name, URL, full postal address, telephone, email, logo, and image.
- Review the `sameAs` links. They should point to official profiles that identify the business. A personal profile should not be the only identity link for the company.
- Add accurate areaServed, opening hours, or contact points only where they are confirmed and visible on the page.
- Make each article's headline, dates, author, image, and publisher accurate, then connect the publisher to the canonical organization node.
- Add BreadcrumbList where the visible page structure supports it.

Then the judgment calls, which matter as much as the fixes:

- Consider [Service](https://schema.org/Service) markup on substantial service pages only when it describes content a visitor can actually see. It is valid Schema.org vocabulary, but it is not a guaranteed Google rich-result feature.
- Do not use Product for a professional service.
- Do not use the deprecated [ProfessionalService](https://schema.org/ProfessionalService) type.
- Do not add self-serving review markup expecting Google star snippets for your own reviews. [Google's policy](https://developers.google.com/search/blog/2019/09/making-review-rich-results-more-helpful) does not support that.
- Do not promise FAQ rich results. Google now generally limits [FAQ rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes) to authoritative government and health sites.

For most service businesses, Organization, LocalBusiness, WebSite, Article, and BreadcrumbList are more useful than chasing exotic types. The wins come from getting the ordinary entities right and connected, not from finding a rare type nobody else is using.

## What this means for you

Take one thing from this: having schema is a starting point, not a finish line. The value sits in structured data that is accurate, connected, consistent with what people see, and reachable by a crawler. A quick pass with the two tools above will tell you whether yours clears that bar.

If you would rather have someone read your full graph, reconcile your entities, and hand you a specific list of corrections, that is the schema and AI-visibility audit we run at The Dot. A good place to start is our free [AI-visibility self-check](/tools/ai-visibility), which shows you how AI systems describe your business today.

When you want the full picture, book a schema and AI-visibility audit with The Dot Creative at [thedotcreative.co/contacts](/contacts). We will show you what search systems and AI actually read on your site, and the corrections that make your facts clear.

---

*Primary sources (for reference):*

- *Google, general structured data guidelines: https://developers.google.com/search/docs/appearance/structured-data/sd-policies*
- *Google, introduction to structured data: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data*
- *Google, AI features and your website: https://developers.google.com/search/docs/appearance/ai-features*
- *Google, LocalBusiness structured data: https://developers.google.com/search/docs/appearance/structured-data/local-business*
- *Google, FAQ rich-result changes: https://developers.google.com/search/blog/2023/08/howto-faq-changes*
- *Google, self-serving review rich-result policy: https://developers.google.com/search/blog/2019/09/making-review-rich-results-more-helpful*
- *Schema.org Markup Validator: https://validator.schema.org/*
- *Schema.org, deprecated ProfessionalService type: https://schema.org/ProfessionalService*
- *Schema.org, Service type: https://schema.org/Service*
