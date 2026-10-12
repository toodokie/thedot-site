# Your Google Rankings Changed. Don't Rewrite Your Website Yet.

Google finished rolling out its September 2026 spam update on October 8. If your traffic chart changed around then, it is tempting to open every page and start rewriting. That would be a fast way to lose the evidence you need.

The [Search Status Dashboard](https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu) says the update began September 24, applied globally and across all languages, and finished October 8. It does not say that Google targeted AI-written content in particular. A spam update is a change to Google's automated systems for detecting search spam; it is not a personal notice that your site has broken a rule. Google's [spam-update guidance](https://developers.google.com/search/docs/appearance/spam-updates) says sites that see a change should review its spam policies. That is a reason to investigate, not to assume a cause.

## First, establish whether anything actually dropped

Open Google Search Console, choose **Performance → Search results**, and select **Web** as the search type. Turn on clicks and impressions. Set a date range that includes September 24 through October 8 and at least a few weeks on either side. Google has only just finished the rollout, so recent data may still be settling. Write down the date when you check rather than treating today's chart as the final answer.

Use the **Compare** tab to compare the rollout period and the period after it with similar earlier periods. Account for weekdays: comparing one weekend with a Tuesday is a poor test. Then look at a longer view, and if your business is seasonal, compare with the same time last year. Google's own [traffic-drop guide](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops) recommends checking broader patterns and similar periods before changing a site.

You are looking for a sustained change in Google Search visibility, not a single down day. If clicks fell but impressions stayed roughly level, people may still be seeing your listings but choosing other results. If both fell, investigate which searches and pages lost visibility. Average position can help identify a large shift, but it is an average across different queries; do not let one number run the diagnosis.

## Find the affected pages and searches

In the same Performance report, open **Pages**. Sort by the difference in clicks or impressions. Is the drop concentrated in one article, a group of service pages, or the whole site? Then open **Queries**. Did a handful of search terms change, or did your site lose ground broadly? Check **Countries** and **Devices** if your audience is local or mobile-heavy. A fall in one market or device can point somewhere different from a sitewide change.

Make a short list of the pages that account for most of the lost traffic. For each, note the queries, the dates and any site changes you made around the same time. Did a redirect break? Did a page acquire a `noindex` tag? Did you change its title, remove useful detail or reorganize navigation? If the loss is confined to one section, check whether that section is still indexed and accessible. A technical failure deserves a fix regardless of what Google's update was doing.

Traffic can also move because customer demand changes, competitors improve, a page loses its rich result, or your own tracking changes. A chart line beginning during an update is correlation. It does not prove the update caused the decline.

## A spam update is not a manual action

Google uses automated spam detection and can also issue a **manual action** after human review. If it issues a manual action, Search Console's **Security & Manual Actions → Manual actions** report and message centre will tell you. A ranking change during a spam update does not, by itself, mean you received one. Google's [manual-actions guidance](https://support.google.com/webmasters/answer/9044175) explains the distinction and the review process.

If the report shows a manual action, read the specific issue, fix the affected pages and follow Google's reconsideration process. If it shows none, do not file a reconsideration request for an algorithmic traffic change. Continue the diagnosis from the page and query data.

## Change the site only when the evidence points there

If your investigation finds spam-policy problems, address them. If it finds a technical issue, repair it. If an important page no longer answers the question that brings people there, improve it for the reader: restore missing detail, make the service clear, and show who is responsible for the information. Document each change and its date. Give Google time to recrawl and reassess it; Google's guidance says recovery from spam-policy improvements can take months.

If visibility is stable, the apparent drop is normal variation, or the cause is still unclear, leave the pages alone for now. Put a calendar note to check again after more post-rollout data arrives. “Do nothing” is a decision when it follows measurement, not a refusal to care.

For a business owner, the useful sequence is simple: **confirm the drop, locate it, check for manual or technical problems, then decide whether the content needs work.** Your website is a working business asset. Do not take it apart because a headline made a chart feel urgent.

If you are also reviewing how customers discover you beyond traditional rankings, our published guide to [AI search visibility](https://www.thedotcreative.co/blog/can-ai-find-your-business) covers that separate question.

### Sources

- [Google Search Status Dashboard, “September 2026 spam update”](https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu)
- [Google Search Central, “Google Search spam updates and your site”](https://developers.google.com/search/docs/appearance/spam-updates)
- [Google Search Central, “Debugging drops in Google Search traffic”](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops)
- [Google Search Console Help, “Performance report”](https://support.google.com/webmasters/answer/7576553)
- [Google Search Console Help, “Manual actions report”](https://support.google.com/webmasters/answer/9044175)
