// Package server provides HTTP server setup, middleware, and routing configuration.
package server

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	authnv1 "k8s.io/api/authentication/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// RouterFunc is a function that can register routes on a Gin router
type RouterFunc func(r *gin.Engine)

// Run starts the server with the provided route registration function
func Run(registerRoutes RouterFunc) error {
	// Setup Gin router with custom logger that redacts tokens
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		// Redact token from query string
		path := param.Path
		if strings.Contains(param.Request.URL.RawQuery, "token=") {
			path = strings.Split(path, "?")[0] + "?token=[REDACTED]"
		}
		return fmt.Sprintf("[GIN] %s | %3d | %s | %s\n",
			param.Method,
			param.StatusCode,
			param.ClientIP,
			path,
		)
	}))

	// Middleware to populate user context from forwarded headers
	r.Use(forwardedIdentityMiddleware())

	// Configure CORS
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	r.Use(cors.New(config))

	// Register routes
	registerRoutes(r)

	// Get port from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	log.Printf("Using namespace: %s", Namespace)

	if err := r.Run(":" + port); err != nil {
		return fmt.Errorf("failed to start server: %v", err)
	}

	return nil
}

// forwardedIdentityMiddleware populates Gin context from common OAuth proxy headers.
// Fallback: if OAuth headers are not present, performs TokenReview on Authorization Bearer token.
func forwardedIdentityMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try OAuth proxy headers first (production with oauth-proxy)
		if v := c.GetHeader("X-Forwarded-User"); v != "" {
			c.Set("userID", v)
		}
		// Prefer preferred username; fallback to user id
		name := c.GetHeader("X-Forwarded-Preferred-Username")
		if name == "" {
			name = c.GetHeader("X-Forwarded-User")
		}
		if name != "" {
			c.Set("userName", name)
		}
		if v := c.GetHeader("X-Forwarded-Email"); v != "" {
			c.Set("userEmail", v)
		}
		if v := c.GetHeader("X-Forwarded-Groups"); v != "" {
			c.Set("userGroups", strings.Split(v, ","))
		}

		// Fallback: if no OAuth headers, try TokenReview on Authorization token
		// This enables development/testing without oauth-proxy and service account auth
		if c.GetString("userID") == "" {
			if auth := c.GetHeader("Authorization"); auth != "" {
				parts := strings.SplitN(auth, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
					token := strings.TrimSpace(parts[1])
					if token != "" {
						// Check if K8sClient is initialized
						if K8sClient == nil {
							log.Printf("Warning: K8sClient not initialized, cannot perform TokenReview")
							c.Next()
							return
						}

						// Perform TokenReview on every request (no caching)
						// Rationale:
						// - Security: Validates token hasn't been revoked or expired
						// - Simplicity: Avoids complex cache invalidation logic
						// - Performance: TokenReview is lightweight (~5-10ms) and runs only in fallback path
						//   (production uses oauth-proxy with X-Forwarded-* headers, bypassing this code)
						// - Short-lived tokens: ServiceAccount tokens can be rotated frequently
						// If TokenReview becomes a bottleneck, consider adding TTL-based cache with 1-minute expiry
						tr := &authnv1.TokenReview{Spec: authnv1.TokenReviewSpec{Token: token}}
						rv, err := K8sClient.AuthenticationV1().TokenReviews().Create(c.Request.Context(), tr, v1.CreateOptions{})
						if err != nil {
							// Log TokenReview API error with context for debugging
							log.Printf("TokenReview API call failed (token len=%d): %v", len(token), err)
						} else if !rv.Status.Authenticated {
							// Log authentication failure with reason
							log.Printf("TokenReview authentication failed: authenticated=false, error=%q, audiences=%v",
								rv.Status.Error, rv.Status.Audiences)
						} else if rv.Status.Error != "" {
							// Log authentication error from Kubernetes
							log.Printf("TokenReview returned error: %q (authenticated=%v)", rv.Status.Error, rv.Status.Authenticated)
						}
						if err == nil && rv.Status.Authenticated && rv.Status.Error == "" {
							username := strings.TrimSpace(rv.Status.User.Username)
							if username != "" {
								// Parse username: "system:serviceaccount:namespace:sa-name" or regular username
								if strings.HasPrefix(username, "system:serviceaccount:") {
									// ServiceAccount: extract namespace and SA name
									parts := strings.Split(username, ":")
									if len(parts) >= 4 {
										namespace := parts[2]
										saName := parts[3]
										// Use namespace/sa-name as userID for uniqueness
										c.Set("userID", fmt.Sprintf("%s/%s", namespace, saName))
										c.Set("userName", saName)
									}
								} else {
									// Regular user from OAuth/OIDC
									c.Set("userID", username)
									c.Set("userName", username)
								}

								// Extract groups if available
								if len(rv.Status.User.Groups) > 0 {
									c.Set("userGroups", rv.Status.User.Groups)
								}
							}
						}
					}
				}
			}
		}

		// Also expose access token if present
		auth := c.GetHeader("Authorization")
		if auth != "" {
			c.Set("authorizationHeader", auth)
		}
		if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
			c.Set("forwardedAccessToken", v)
		}
		c.Next()
	}
}

// RunContentService starts the server in content service mode
func RunContentService(registerContentRoutes RouterFunc) error {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		path := param.Path
		if strings.Contains(param.Request.URL.RawQuery, "token=") {
			path = strings.Split(path, "?")[0] + "?token=[REDACTED]"
		}
		return fmt.Sprintf("[GIN] %s | %3d | %s | %s\n",
			param.Method,
			param.StatusCode,
			param.ClientIP,
			path,
		)
	}))

	// Register content service routes
	registerContentRoutes(r)

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Content service starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		return fmt.Errorf("failed to start content service: %v", err)
	}
	return nil
}
