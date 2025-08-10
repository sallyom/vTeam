export const config = {
	// In production (when served by nginx), use /api proxy path
	// In development, use the simplified API on localhost:8001
	apiUrl: process.env.NODE_ENV === 'production'
		? '/api'
		: (process.env.REACT_APP_API_URL || 'http://localhost:8001'),
}; 