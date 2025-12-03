# Git Init Container

This init container handles all git operations before the runner starts, making the architecture runner-agnostic.

## Purpose

The git-init-container:
- Clones repositories with enhanced options (base branch, feature branch, sync repo)
- Handles protected branch detection and working branch creation
- Configures upstream/sync remotes and rebases if needed
- Sets up git identity (user.name, user.email)
- Runs as an init container before the runner starts

## How It Works

1. **Operator creates Job** with init container using this image
2. **Init container runs** and sets up all git repositories in the workspace
3. **Runner starts** with pre-configured workspace (no git operations needed)

## Benefits

- **Runner-Agnostic**: Git logic is in Go, not Python (works with any runner)
- **Separation of Concerns**: Git setup is separate from code execution
- **Faster Runner Startup**: Repositories are already cloned when runner starts
- **Centralized Logic**: All git operations in one place (backend/git package)

## Configuration

The init container reads configuration from environment variables:

### Required
- `WORKSPACE_PATH`: Path where repositories will be cloned
- `SESSION_ID`: Session identifier for working branch naming

### Multi-Repo Mode
- `REPOS_JSON`: JSON array of repository configurations

Example:
```json
[
  {
    "name": "my-repo",
    "input": {
      "url": "https://github.com/org/repo",
      "baseBranch": "main",
      "featureBranch": "feature/my-work",
      "allowProtectedWork": false,
      "sync": {
        "url": "https://github.com/upstream/repo",
        "branch": "main"
      }
    }
  }
]
```

### Legacy Single-Repo Mode
- `INPUT_REPO_URL`: Repository URL
- `INPUT_BRANCH`: Branch to clone (default: main)

### Authentication
- `GITHUB_TOKEN`: GitHub personal access token for private repos

## Building

```bash
cd components/git-init-container
docker build -f Dockerfile -t git-init-container:latest ../..
```

## Integration with Operator

The operator's `sessions.go` needs to be updated to use this init container instead of the simple shell-based one:

```go
InitContainers: []corev1.Container{
    {
        Name:  "git-init",
        Image: appConfig.GitInitContainerImage,
        Env: []corev1.EnvVar{
            {Name: "WORKSPACE_PATH", Value: fmt.Sprintf("/workspace/sessions/%s/workspace", name)},
            {Name: "SESSION_ID", Value: name},
            {Name: "REPOS_JSON", Value: reposJSON},
            {Name: "GITHUB_TOKEN", ValueFrom: &corev1.EnvVarSource{...}},
        },
        VolumeMounts: []corev1.VolumeMount{
            {Name: "workspace", MountPath: "/workspace"},
        },
    },
},
```

## Runner Changes

The runner wrapper.py can be simplified to remove all git clone logic from `_prepare_workspace()`.
The workspace will already be set up when the runner starts.

## Testing

1. Build the image
2. Deploy to cluster
3. Create a session with repositories configured
4. Verify repositories are cloned correctly before runner starts
5. Verify runner can access repositories without git operations
