package contract

import (
	"github.com/gin-gonic/gin"
	// Import actual backend packages when available
	// "github.com/ambient-computing/vteam/components/backend/routes"
	// "github.com/ambient-computing/vteam/components/backend/server"
)

// SetupContractTestRouter creates a router with all routes registered for contract testing
func SetupContractTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)

	// TODO: Import and use actual router setup
	// This is a placeholder that will fail tests as expected for TDD
	//
	// The actual implementation should be:
	// router := server.NewRouter()
	// routes.RegisterAllRoutes(router)
	// return router

	// For now, return empty router to ensure tests fail
	router := gin.New()
	return router
}

// MockAuthMiddleware provides authentication context for testing
func MockAuthMiddleware(project, user string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if project != "" {
			c.Set("project", project)
		}
		if user != "" {
			c.Set("user", user)
		}
		c.Next()
	}
}