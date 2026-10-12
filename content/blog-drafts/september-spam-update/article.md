# Google's September 2026 Spam Update: What Changed for Your Traffic?

Google changed how its automated systems identify spam in Search. The [September 2026 spam update](https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu) rolled out from September 24 to October 8, across all countries and languages. That can change where pages appear in search results, which can change how many people see and visit a website.

Here is the important limit: **Google has not said which specific detection signals changed or which sites were affected.** Its announcement did not introduce a new rule for site owners, name a particular kind of content as the target, or say that AI-written pages were singled out. If your traffic moved during the rollout, the timing is a clue. It is not an explanation by itself.

## What does a “spam update” mean?

Google already uses automated systems to catch pages and tactics meant to manipulate search results or mislead visitors. It continually runs those systems, then occasionally makes a notable improvement and calls it a spam update. Google's [general spam-update guidance](https://developers.google.com/search/docs/appearance/spam-updates) says sites that violate its policies may rank lower or stop appearing in results.

Think of the update as a change in Google's ability to recognize spam, not a notice that every website must be rebuilt. Google did not publish a list of the exact changes made in this rollout. A site owner therefore cannot look at one falling chart and know which system made the decision.

Google's existing [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) include practices such as stuffing pages with repeated keywords, creating many low-value pages mainly to capture rankings, buying links for ranking credit, or showing search engines a different page from the one visitors see. Those are examples of what Google already considers spam; **Google has not said this update specifically targeted any one of them.**

Nor is this an announced ban on content made with AI. Google's policy on large amounts of unhelpful content applies regardless of how the pages were produced. Its [guidance on generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content) focuses on value, accuracy and review. The issue is publishing many pages that add little for readers, not simply using a tool while writing.

## How might this affect website traffic?

Your Google traffic depends partly on how often your pages appear in search results and where they appear. If Google's systems treat a page differently after the update, its visibility can change. That may mean fewer or more visits from Google Search. It does not necessarily mean your total website traffic will move in the same way; people can still arrive through email, social media, ads and direct visits.

There are several possible patterns:

- **Fewer appearances and fewer visits from Google.** A page may be showing for fewer searches or appearing less prominently. This deserves investigation, but does not prove a spam violation.
- **Similar appearances but fewer visits.** People may still see the page in results but click it less often. The title or description shown in Search, competing results or a change in what people want could matter.
- **A drop limited to certain pages or searches.** One service page or group of articles may account for most of the change. That is more useful to know than a single sitewide percentage.
- **An increase.** Search rankings are relative. If other results move, your pages might gain visibility even though you did not change them. This is a possible effect, not a promise that the update will help compliant sites.
- **No meaningful change.** A global rollout does not mean every site will see a measurable shift.

Google Search Console calls an appearance an **impression** and a visit from a search result a **click**. Those two numbers are more useful here than an isolated “average ranking” number, which blends many searches and pages. Google's [Performance report](https://support.google.com/webmasters/answer/7576553) shows all three.

## Does a drop mean Google penalized your site?

No. A drop that starts during the rollout is not proof that the update caused it, and an automated ranking change is different from a **manual action**. A manual action follows a human review at Google and appears in Search Console's [Manual actions report](https://support.google.com/webmasters/answer/9044175). If that report is clear, you have not received a manual action, even if search traffic has fallen.

Other explanations can produce a similar chart: a page became unavailable or stopped being included in Google's results; a website link started leading to the wrong place; a competitor published a stronger answer; interest in a topic changed; or visitors saw your result but clicked something else. Google's [traffic-drop guide](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops) recommends checking these possibilities before deciding what to change.

## How to check whether your traffic was affected

You do not need to understand Google's ranking systems to run a useful first check.

**1. Look at Google Search traffic, not just all website visits.** Open Google Search Console, Google's free tool for seeing how your site performs in Search. Go to **Performance → Search results**, and select **Web**. Turn on **Clicks** and **Impressions**. If your analytics tool shows a total-traffic drop but Search Console is steady, the change may have come from another channel.

**2. Put the rollout on your chart.** Set a date range that includes September 24 through October 8, plus several weeks before and after where available. Use **Compare** to look at similar-length periods and comparable weekdays. If you are checking only days after the rollout, treat the pattern as provisional and return when you have more post-update data. Compare with the same season last year if your business has predictable busy and quiet periods.

**3. Find where the difference sits.** In the Performance report, check **Pages** to see whether one page, a section or the whole site changed. Check **Queries** to see which searches lost or gained visibility. **Countries** and **Devices** can matter too, especially for a local business. Write down the pages, searches and dates responsible for most of the movement.

**4. Rule out a site problem.** Check Search Console's **Page indexing** report, which shows whether Google can include your pages in results, and review any recent website changes. Look for missing pages, links that lead to the wrong place, settings that hide a page from Google, or server problems. Check **Manual actions** separately. A technical issue is worth fixing whether or not the spam update happened at the same time.

**5. Match the response to the evidence.** If the drop is sustained and concentrated on pages that may violate Google's spam policies, review and repair those practices. If a page no longer helps the reader, improve it for that reader. If the cause is a technical fault, fix the fault. Keep a record of what you changed and when. Google's guidance says recovery after spam-policy improvements can take months as its systems reassess the site; no quick rewrite guarantees a return.

If the change is small, short-lived or still unexplained, avoid changing every page at once. More data may reveal a normal fluctuation, seasonal demand or another cause. Changing the whole site now would make it harder to tell what actually happened.

## The practical takeaway

**What changed:** Google improved automated spam detection worldwide between September 24 and October 8. **What might change for you:** where your pages appear in Google results, and therefore impressions and clicks from Search. **What remains unknown:** the exact detection changes and whether they caused any particular site's traffic shift.

Check the data first. Find the affected pages and searches. Rule out technical and manual-action issues. Then make a focused change only when you have a reason for it. That is more useful than treating every traffic dip as a verdict on your whole website.

If you are also reviewing how people discover your business beyond traditional rankings, our published guide to [AI search visibility](https://www.thedotcreative.co/blog/can-ai-find-your-business) covers that separate question.

### Sources

- [Google Search Status Dashboard, “September 2026 spam update”](https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu)
- [Google Search Central, “Google Search spam updates and your site”](https://developers.google.com/search/docs/appearance/spam-updates)
- [Google Search Central, “Spam policies for Google web search”](https://developers.google.com/search/docs/essentials/spam-policies)
- [Google Search Central, “Google Search's guidance on using generative AI content on your website”](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [Google Search Central, “Debugging drops in Google Search traffic”](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops)
- [Google Search Console Help, “Performance report”](https://support.google.com/webmasters/answer/7576553)
- [Google Search Console Help, “Manual actions report”](https://support.google.com/webmasters/answer/9044175)
