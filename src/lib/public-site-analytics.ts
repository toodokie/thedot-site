export const excludedAnalyticsPaths = ['/client', '/admin'] as const;

export function isExcludedAnalyticsPath(pathname: string): boolean {
  return excludedAnalyticsPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

// Client and admin portal traffic should not change the agency site's visitor or speed reports.
export function onlyPublicSiteEvents<T extends { url: string }>(event: T): T | null {
  const pathname = new URL(event.url, 'https://www.thedotcreative.co').pathname;
  return isExcludedAnalyticsPath(pathname) ? null : event;
}

// Google Analytics has no beforeSend callback. Its supported opt-out flag must be
// set before gtag loads and before client-side history changes reach its listener.
export function googleAnalyticsRouteGuard(measurementId: string): string {
  return `
    (function () {
      var key = ${JSON.stringify(`ga-disable-${measurementId}`)};
      var excluded = ${JSON.stringify(excludedAnalyticsPaths)};
      function update(pathname) {
        window[key] = excluded.some(function (path) {
          return pathname === path || pathname.indexOf(path + '/') === 0;
        });
      }
      update(location.pathname);
      function guardHistory(method) {
        var original = history[method];
        history[method] = function (state, title, url) {
          if (url != null) {
            try { update(new URL(url, location.href).pathname); } catch (error) {}
          }
          return original.apply(this, arguments);
        };
      }
      guardHistory('pushState');
      guardHistory('replaceState');
      window.addEventListener('popstate', function () { update(location.pathname); });
    })();
  `;
}
