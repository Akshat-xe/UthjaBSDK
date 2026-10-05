import { CheerioCrawler, Configuration, Log, LogLevel } from '@crawlee/cheerio';

export function assertSourceUrl(value) {
  const url = new URL(value);
  const allowed = ['unstop.com', 'devpost.com', 'mlh.io', 'mlh.com'];
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !allowed.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
  ) {
    throw new Error('Crawler URL is outside configured opportunity sources');
  }
  return url.href;
}

// Crawlee owns request scheduling, retries, concurrency, and HTML/JSON parsing.
// Each crawl has separate in-memory storage: scheduled runs never reuse a stale queue.
export async function crawlPages(urls, handler) {
  urls.forEach(assertSourceUrl);
  const failures = [];
  const crawler = new CheerioCrawler(
    {
      maxConcurrency: 2,
      maxRequestRetries: 2,
      maxRequestsPerCrawl: urls.length,
      navigationTimeoutSecs: 15,
      requestHandlerTimeoutSecs: 20,
      useSessionPool: false,
      additionalMimeTypes: ['application/json'],
      log: new Log({ level: LogLevel.ERROR }),
      preNavigationHooks: [
        (_context, options) => {
          // Reject redirects rather than following an upstream redirect to a local/private target.
          options.followRedirect = false;
          options.retry = { limit: 0 };
        },
      ],
      async requestHandler(context) {
        if (context.response.statusCode >= 300)
          throw new Error(`Source HTTP ${context.response.statusCode}`);
        await handler(context);
      },
      failedRequestHandler({ request }, error) {
        failures.push(`${request.url}: ${error.message}`);
      },
    },
    new Configuration({ persistStorage: false, purgeOnStart: false }),
  );
  await crawler.run(urls);
  if (failures.length) throw new Error(failures.join('; '));
}

export async function crawlJson(url) {
  let result;
  await crawlPages([url], ({ json, body }) => {
    result = json ?? JSON.parse(body.toString());
  });
  return result;
}
