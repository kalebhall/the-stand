import http from 'node:http';

import { ensureSupportAdminBootstrap, getCurrentUser } from './src/bootstrap.mjs';
import { runHealthCheck } from './src/health.mjs';

const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 404;
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    const body = await runHealthCheck();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
    return;
  }

  if (req.url === '/api/me' && req.method === 'GET') {
    await ensureSupportAdminBootstrap();
    const user = getCurrentUser(req.headers.authorization ?? '');
    if (!user) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }));
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(user));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }));
});

server.listen(port, () => {
  console.log(`The Stand web server listening on ${port}`);
});
