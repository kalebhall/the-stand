export function assertHealthResponse(body) {
  if (body?.status !== 'ok' || body?.db !== 'connected' || typeof body?.version !== 'string') {
    throw new Error('Invalid health response');
  }
  return body;
}

export function assertMeResponse(body) {
  if (!body?.user?.id || !body?.user?.email || !Array.isArray(body?.roles)) {
    throw new Error('Invalid me response');
  }
  return body;
}
