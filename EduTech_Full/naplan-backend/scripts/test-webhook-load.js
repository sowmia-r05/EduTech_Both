// Simple load test script for webhooks
// Run with: node scripts/test-webhook-load.js

const axios = require('axios');

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/flexiquiz';

// Mock webhook data
const mockWebhook = {
  event_id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  event_type: 'response.submitted',
  data: {
    response_id: `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    quiz_id: 'quiz_123',
    quiz_name: 'Test Quiz',
    first_name: 'Test',
    last_name: 'User',
    email_address: 'test@example.com',
    points: 85,
    available_points: 100,
    percentage_score: 85.0,
    grade: 'A',
    pass: true,
    attempt: 1,
    duration: 1800,
    date_submitted: new Date().toISOString()
  }
};

async function testSingleWebhook() {
  try {
    const response = await axios.post(WEBHOOK_URL, mockWebhook);
    console.log('✅ Single webhook test successful:', response.status);
    return true;
  } catch (error) {
    console.error('❌ Single webhook test failed:', error.message);
    return false;
  }
}

async function testLoadTest(concurrentRequests = 10) {
  console.log(`🚀 Starting load test with ${concurrentRequests} concurrent requests...`);
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < concurrentRequests; i++) {
    // Create unique webhook for each request
    const webhook = {
      ...mockWebhook,
      event_id: `load_test_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
      data: {
        ...mockWebhook.data,
        response_id: `load_resp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    promises.push(
      axios.post(WEBHOOK_URL, webhook)
        .then(res => ({ success: true, status: res.status }))
        .catch(err => ({ success: false, error: err.message }))
    );
  }
  
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`📊 Load Test Results:`);
  console.log(`   Total requests: ${concurrentRequests}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Requests/sec: ${(concurrentRequests / (duration / 1000)).toFixed(2)}`);
  
  return { successful, failed, duration };
}

// Main test runner
async function runTests() {
  console.log('🧪 Testing Webhook System Performance\n');
  
  // Test 1: Single webhook
  console.log('1️⃣ Testing single webhook...');
  const singleSuccess = await testSingleWebhook();
  
  if (!singleSuccess) {
    console.log('❌ Single webhook test failed. Stopping tests.');
    return;
  }
  
  // Test 2: Light load (10 concurrent)
  console.log('\n2️⃣ Testing light load (10 concurrent)...');
  await testLoadTest(10);
  
  // Test 3: Medium load (50 concurrent)
  console.log('\n3️⃣ Testing medium load (50 concurrent)...');
  await testLoadTest(50);
  
  // Test 4: Heavy load (100 concurrent)
  console.log('\n4️⃣ Testing heavy load (100 concurrent)...');
  await testLoadTest(100);
  
  console.log('\n✅ All tests completed!');
  console.log('💡 Check server logs for processing stats and memory usage.');
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testSingleWebhook, testLoadTest, runTests };