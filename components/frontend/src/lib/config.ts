// Simple API configuration - no runtime complexity
// Frontend calls its own API routes, which proxy to backend

/**
 * Gets the API base URL - always points to our own Next.js API routes
 */
export function getApiUrl(): string {
  // Frontend always calls its own API routes (e.g., /api/research-sessions)
  // These routes proxy to the internal backend service
  return '/api';
}
