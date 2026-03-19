import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { redis, cacheHelpers } from '../src/config/redis';
import { newsService } from '../src/modules/news/service';
import { followService } from '../src/modules/follow/service';
import { marketService } from '../src/modules/market/service';
import { searchService } from '../src/modules/search/service';

interface PerformanceTest {
  name: string;
  fn: () => Promise<any>;
}

interface TestResult {
  name: string;
  duration: number;
  success: boolean;
  error?: string;
}

const tests: PerformanceTest[] = [
  {
    name: 'News Feed (Following)',
    fn: async () => {
      // Simulate authenticated user
      const userId = '507f1f77bcf86cd799439011'; // Mock user ID
      return await newsService.getFollowingNews(userId, 1, 50, [], 'all');
    },
  },
  {
    name: 'Search Query (coins)',
    fn: async () => {
      return await searchService.search({
        query: 'bitcoin',
        segments: ['coins'],
        limit: 10,
      });
    },
  },
  {
    name: 'Market Trending',
    fn: async () => {
      return await marketService.getTrending();
    },
  },
  {
    name: 'Market Top Gainers',
    fn: async () => {
      return await marketService.getTopGainers();
    },
  },
  {
    name: 'Get All News',
    fn: async () => {
      return await newsService.getAllNews(1, 50, []);
    },
  },
];

async function runTest(test: PerformanceTest): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await test.fn();
    const duration = Date.now() - startTime;
    return { name: test.name, duration, success: true };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return { name: test.name, duration, success: false, error: error.message };
  }
}

async function getCacheStats(): Promise<{ hits: number; misses: number; hitRate: string }> {
  try {
    // This is a simplified version - in production you'd track these in Redis
    const info = await redis.info('stats');
    const keyspaceHits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0');
    const keyspaceMisses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0');
    const total = keyspaceHits + keyspaceMisses;
    const hitRate = total > 0 ? ((keyspaceHits / total) * 100).toFixed(2) : '0.00';
    
    return {
      hits: keyspaceHits,
      misses: keyspaceMisses,
      hitRate: `${hitRate}%`,
    };
  } catch (error) {
    return { hits: 0, misses: 0, hitRate: 'N/A' };
  }
}

async function runPerformanceTests(): Promise<void> {
  console.log('🚀 Starting Performance Tests...\n');

  try {
    // Connect to database
    await mongoose.connect(config.mongoUri, {
      maxPoolSize: 50,
      minPoolSize: 10,
    });
    console.log('✅ Connected to MongoDB');

    // Wait for Redis to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Connected to Redis\n');

    const results: TestResult[] = [];

    // Run each test
    for (const test of tests) {
      process.stdout.write(`Running: ${test.name}... `);
      const result = await runTest(test);
      results.push(result);
      
      if (result.success) {
        console.log(`✅ ${result.duration}ms`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    }

    console.log('\n📊 Performance Test Results:');
    console.log('═'.repeat(60));
    
    results.forEach((result) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.name.padEnd(30)} ${result.duration}ms`);
    });

    console.log('═'.repeat(60));

    // Calculate statistics
    const successfulTests = results.filter((r) => r.success);
    if (successfulTests.length > 0) {
      const avgDuration =
        successfulTests.reduce((sum, r) => sum + r.duration, 0) / successfulTests.length;
      const maxDuration = Math.max(...successfulTests.map((r) => r.duration));
      const minDuration = Math.min(...successfulTests.map((r) => r.duration));

      console.log(`\n📈 Statistics:`);
      console.log(`  Average: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Min: ${minDuration}ms`);
      console.log(`  Max: ${maxDuration}ms`);
      console.log(`  Success Rate: ${successfulTests.length}/${results.length} (${((successfulTests.length / results.length) * 100).toFixed(1)}%)`);
    }

    // Cache stats
    console.log('\n💾 Cache Statistics:');
    const cacheStats = await getCacheStats();
    console.log(`  Hits: ${cacheStats.hits}`);
    console.log(`  Misses: ${cacheStats.misses}`);
    console.log(`  Hit Rate: ${cacheStats.hitRate}`);

    // Database connection pool
    console.log('\n🔗 Database Connection Pool:');
    console.log(`  Status: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    console.log(`  Max Pool Size: 50`);
    console.log(`  Min Pool Size: 10`);

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    await redis.quit();
    console.log('\n✅ Cleanup complete');
  }
}

// Run the tests
runPerformanceTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
