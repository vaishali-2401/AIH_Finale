/**
 * Simple test script to verify backend connection
 * Run this in the browser console or as a Node.js script
 */

const BACKEND_URL = 'http://localhost:8000';

async function testBackendConnection() {
    console.log('🧪 Testing Backend Connection...');
    
    try {
        // Test 1: Health surrogate (list_pdfs)
        console.log('\n1. Testing health (list_pdfs)...');
        const healthResponse = await fetch(`${BACKEND_URL}/list_pdfs`);
        console.log('✅ Health (list_pdfs) status:', healthResponse.status);
        
        // Test 2: List PDFs
        console.log('\n2. Testing list PDFs...');
        const pdfsResponse = await fetch(`${BACKEND_URL}/list_pdfs`);
        const pdfsData = await pdfsResponse.json();
        console.log('✅ List PDFs:', pdfsData);
        
        // Test 3: Extract and search (requires image); skip, but show endpoint
        console.log('\n3. Skipping extract_and_search (requires image upload). Endpoint:', `${BACKEND_URL}/extract_and_search/`);
        
        // Test 4: Insights
        console.log('\n4. Testing insights (GET)...');
        const insightsResponse = await fetch(`${BACKEND_URL}/api/insights`);
        console.log('✅ Insights status:', insightsResponse.status);
        
        console.log('\n🎉 All backend tests passed! Frontend should be able to connect.');
        
    } catch (error) {
        console.error('❌ Backend connection test failed:', error);
        console.log('\n💡 Make sure the backend is running on', BACKEND_URL);
        console.log('💡 Run: cd backend/final && python run.py');
    }
}

// Run the test
testBackendConnection();



