module git-init-container

go 1.23

replace ambient-code-backend => ../backend

require ambient-code-backend v0.0.0

// Match backend's dependencies for git operations
require (
	k8s.io/apimachinery v0.31.4
	k8s.io/client-go v0.31.4
)
