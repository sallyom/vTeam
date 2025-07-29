export const config = {
	// In production (when served by nginx), use /api proxy path
	// In development, fall back to localhost:8000
	apiUrl: process.env.NODE_ENV === 'production'
		? '/api'
		: (process.env.REACT_APP_API_URL || 'http://localhost:8000'),
}; 