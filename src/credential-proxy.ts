/**
 * Credential proxy for container isolation.
 * Containers connect here instead of directly to the Anthropic API.
 * The proxy injects real credentials so containers never see them.
 *
 * Two auth modes:
 *   API key:  Proxy injects x-api-key on every request.
 *   OAuth:    Container CLI exchanges its placeholder token for a temp
 *             API key via /api/oauth/claude_cli/create_api_key.
 *             Proxy injects real OAuth token on that exchange request;
 *             subsequent requests carry the temp key which is valid as-is.
 */
import { createServer, Server } from 'http';
import { request as httpsRequest } from 'https';
import { request as httpRequest, RequestOptions } from 'http';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 120; // requests per window

// Allow all API paths — the proxy's security comes from credential injection.
const ALLOWED_PATH_PREFIXES = ['/'];

// Simple per-IP sliding window rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export type AuthMode = 'api-key' | 'oauth';

export interface ProxyConfig {
  authMode: AuthMode;
}

export function startCredentialProxy(
  port: number,
  host = '127.0.0.1',
): Promise<Server> {
  const secrets = readEnvFile([
    'OPENROUTER_API_KEY',
    'OPENROUTER_BASE_URL',
  ]);

  const authMode: AuthMode = 'api-key';

  const upstreamUrl = new URL(
    secrets.OPENROUTER_BASE_URL || 'https://openrouter.ai/api',
  );
  const isHttps = upstreamUrl.protocol === 'https:';
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // Path filtering: only allow SDK-relevant API paths
      const reqPath = req.url || '/';
      const pathAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
        reqPath.startsWith(prefix),
      );
      if (!pathAllowed) {
        logger.warn(
          { path: reqPath },
          'Credential proxy: blocked request to disallowed path',
        );
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // Per-IP rate limiting
      const clientIp = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      let bucket = rateLimitMap.get(clientIp);
      if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateLimitMap.set(clientIp, bucket);
      }
      bucket.count++;
      if (bucket.count > RATE_LIMIT_MAX) {
        logger.warn(
          { clientIp, count: bucket.count },
          'Credential proxy: rate limit exceeded',
        );
        res.writeHead(429);
        res.end('Too Many Requests');
        return;
      }

      const chunks: Buffer[] = [];
      let bodySize = 0;
      req.on('data', (c) => {
        bodySize += c.length;
        if (bodySize <= MAX_BODY_SIZE) {
          chunks.push(c);
        }
      });
      req.on('end', () => {
        if (bodySize > MAX_BODY_SIZE) {
          logger.warn(
            { bodySize },
            'Credential proxy: request body too large',
          );
          res.writeHead(413);
          res.end('Payload Too Large');
          return;
        }
        const body = Buffer.concat(chunks);
        const headers: Record<string, string | number | string[] | undefined> =
          {
            ...(req.headers as Record<string, string>),
            host: upstreamUrl.host,
            'content-length': body.length,
          };

        // Strip hop-by-hop headers that must not be forwarded by proxies
        delete headers['connection'];
        delete headers['keep-alive'];
        delete headers['transfer-encoding'];

        // Inject OpenRouter API key as Bearer token
        delete headers['authorization'];
        delete headers['x-api-key'];
        headers['authorization'] = `Bearer ${secrets.OPENROUTER_API_KEY}`;

        const upstream = makeRequest(
          {
            hostname: upstreamUrl.hostname,
            port: upstreamUrl.port || (isHttps ? 443 : 80),
            path: req.url,
            method: req.method,
            headers,
          } as RequestOptions,
          (upRes) => {
            res.writeHead(upRes.statusCode!, upRes.headers);
            upRes.pipe(res);
          },
        );

        upstream.on('error', (err) => {
          logger.error(
            { err, url: req.url },
            'Credential proxy upstream error',
          );
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
          }
        });

        upstream.write(body);
        upstream.end();
      });
    });

    server.listen(port, host, () => {
      logger.info({ port, host, authMode }, 'Credential proxy started');
      resolve(server);
    });

    server.on('error', reject);
  });
}

/** Detect which auth mode the host is configured for. */
export function detectAuthMode(): AuthMode {
  return 'api-key';
}
