import http from 'http';

interface LoadTestConfig {
  url: string;
  path: string;
  method: string;
  concurrency: number;
  duration: number; // seconds
}

interface RequestResult {
  statusCode: number;
  duration: number;
  success: boolean;
}

async function makeRequest(config: LoadTestConfig): Promise<RequestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(config.path, config.url);
    
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 4001,
        path: url.pathname,
        method: config.method,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const duration = Date.now() - startTime;
          resolve({
            statusCode: res.statusCode || 0,
            duration,
            success: res.statusCode === 200,
          });
        });
      }
    );

    req.on('error', () => {
      const duration = Date.now() - startTime;
      resolve({
        statusCode: 0,
        duration,
        success: false,
      });
    });

    req.end();
  });
}

async function runLoadTest(config: LoadTestConfig): Promise<void> {
  console.log(`\n🚀 Load Test Configuration:`);
  console.log(`  URL: ${config.url}${config.path}`);
  console.log(`  Method: ${config.method}`);
  console.log(`  Concurrency: ${config.concurrency} concurrent requests`);
  console.log(`  Duration: ${config.duration} seconds`);
  console.log(`\nStarting load test...\n`);

  const results: RequestResult[] = [];
  const startTime = Date.now();
  const endTime = startTime + config.duration * 1000;
  let completedRequests = 0;
  let activeRequests = 0;

  // Progress indicator
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r⏱️  Progress: ${elapsed}s | Requests: ${completedRequests} | Active: ${activeRequests}`);
  }, 100);

  // Main load test loop
  while (Date.now() < endTime) {
    // Maintain concurrency level
    while (activeRequests < config.concurrency && Date.now() < endTime) {
      activeRequests++;
      makeRequest(config).then((result) => {
        results.push(result);
        completedRequests++;
        activeRequests--;
      });
      
      // Small delay to prevent overwhelming the event loop
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Wait for all active requests to complete
  while (activeRequests > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  clearInterval(progressInterval);
  console.log('\n\n✅ Load test completed!\n');

  // Calculate statistics
  const successfulRequests = results.filter((r) => r.success);
  const failedRequests = results.filter((r) => !r.success);
  const durations = results.map((r) => r.duration).sort((a, b) => a - b);

  const totalRequests = results.length;
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  const minDuration = durations[0];
  const maxDuration = durations[durations.length - 1];
  const successRate = (successfulRequests.length / totalRequests) * 100;
  const rps = totalRequests / config.duration;

  console.log('📊 Load Test Results:');
  console.log('═'.repeat(60));
  console.log(`Total Requests:     ${totalRequests}`);
  console.log(`Successful:         ${successfulRequests.length}`);
  console.log(`Failed:             ${failedRequests.length}`);
  console.log(`Success Rate:       ${successRate.toFixed(2)}%`);
  console.log(`Requests/Second:    ${rps.toFixed(2)}`);
  console.log('');
  console.log('⏱️  Response Times:');
  console.log(`  Min:     ${minDuration}ms`);
  console.log(`  Avg:     ${avgDuration.toFixed(2)}ms`);
  console.log(`  P50:     ${p50}ms`);
  console.log(`  P95:     ${p95}ms`);
  console.log(`  P99:     ${p99}ms`);
  console.log(`  Max:     ${maxDuration}ms`);
  console.log('═'.repeat(60));

  // Performance targets
  console.log('\n🎯 Performance Targets:');
  const p50Target = p50 < 50;
  const p95Target = p95 < 150;
  const p99Target = p99 < 300;
  const successTarget = successRate > 99;

  console.log(`  P50 < 50ms:     ${p50Target ? '✅ PASS' : '❌ FAIL'} (${p50}ms)`);
  console.log(`  P95 < 150ms:    ${p95Target ? '✅ PASS' : '❌ FAIL'} (${p95}ms)`);
  console.log(`  P99 < 300ms:    ${p99Target ? '✅ PASS' : '❌ FAIL'} (${p99}ms)`);
  console.log(`  Success > 99%:  ${successTarget ? '✅ PASS' : '❌ FAIL'} (${successRate.toFixed(2)}%)`);

  const allPassed = p50Target && p95Target && p99Target && successTarget;
  console.log(`\n${allPassed ? '✅ All targets met!' : '⚠️  Some targets not met'}`);
}

// Test configurations
const tests: LoadTestConfig[] = [
  {
    url: 'http://localhost:4001',
    path: '/api/market/trending',
    method: 'GET',
    concurrency: 50,
    duration: 10,
  },
  {
    url: 'http://localhost:4001',
    path: '/api/news?page=1&limit=50',
    method: 'GET',
    concurrency: 50,
    duration: 10,
  },
  {
    url: 'http://localhost:4001',
    path: '/health',
    method: 'GET',
    concurrency: 100,
    duration: 5,
  },
];

async function runAllTests(): Promise<void> {
  console.log('🔥 Backend Load Test Suite\n');
  console.log('═'.repeat(60));
  console.log('⚠️  Make sure the backend server is running on localhost:4001');
  console.log('═'.repeat(60));

  for (let i = 0; i < tests.length; i++) {
    console.log(`\n📋 Test ${i + 1}/${tests.length}`);
    await runLoadTest(tests[i]);
    
    // Wait between tests
    if (i < tests.length - 1) {
      console.log('\n⏳ Waiting 3 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n✅ All load tests completed!');
}

// Run tests
runAllTests().catch((error) => {
  console.error('\n❌ Load test failed:', error);
  process.exit(1);
});
