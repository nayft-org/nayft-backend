const targetUrl = process.env.HEALTHCHECK_READY_URL || 'http://127.0.0.1:4001/ready';
const requestTimeoutMs = Number.parseInt(process.env.HEALTHCHECK_READY_TIMEOUT_MS || '5000', 10);

function sanitize(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input ?? 'unknown');
  return raw
    .replace(/(token|secret|password|apikey|api_key|authorization)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

function printPayload(prefix, payload) {
  try {
    console.log(`${prefix} ${JSON.stringify(payload)}`);
  } catch {
    console.log(`${prefix} ${sanitize(payload)}`);
  }
}

async function run() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    const elapsedMs = Date.now() - startedAt;
    const bodyText = await response.text();
    let parsed = null;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }

    if (response.ok) {
      printPayload('[Healthcheck] Ready', {
        status: parsed?.status || 'ready',
        phase: parsed?.phase || 'unknown',
        elapsedMs,
      });
      process.exit(0);
    }

    printPayload('[Healthcheck] Failed', {
      status: parsed?.status || 'unhealthy',
      failureCategory: parsed?.failureCategory || 'READINESS_HTTP_FAILED',
      phase: parsed?.phase || 'unknown',
      reason: sanitize(parsed?.reason || `HTTP_${response.status}`),
      checks: parsed?.checks || undefined,
      elapsedMs,
    });
    process.exit(1);
  } catch (error) {
    printPayload('[Healthcheck] Failed', {
      status: 'unhealthy',
      failureCategory: 'HEALTHCHECK_TIMEOUT',
      reason: sanitize(error instanceof Error ? error.message : String(error)),
      targetUrl,
      elapsedMs: Date.now() - startedAt,
    });
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

run();
