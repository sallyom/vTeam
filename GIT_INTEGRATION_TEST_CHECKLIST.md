# Git Integration Test Checklist

## Automated Tests

### 1. Run the Test Script
```bash
./test-git-integration.sh
```

### 2. Run Individual Component Tests

#### Python Git Integration Tests
```bash
cd components/runners/claude-code-runner
python3 test_git_integration.py
```

#### Go Backend Tests
```bash
cd components/backend
go test -v -run TestGit
```

#### Frontend Tests (if Jest is configured)
```bash
cd components/frontend
npm test -- --testPathPattern=git-form.test.ts
```

## Manual Integration Tests

### 1. Build New Images
```bash
# Claude Runner
cd components/runners/claude-code-runner
podman build -t quay.io/sallyom/vteam:claude-runner-git-test .

# Backend
cd ../backend
podman build -t quay.io/sallyom/vteam:backend-git-test .

# Frontend
cd ../frontend
podman build -t quay.io/sallyom/vteam:frontend-git-test .

# Operator (unchanged but for completeness)
cd ../operator
podman build -t quay.io/sallyom/vteam:operator-git-test .
```

### 2. Push Images
```bash
podman push quay.io/sallyom/vteam:claude-runner-git-test
podman push quay.io/sallyom/vteam:backend-git-test
podman push quay.io/sallyom/vteam:frontend-git-test
podman push quay.io/sallyom/vteam:operator-git-test
```

### 3. Deploy with New Images
Update image tags in deployment scripts and run:
```bash
./deploy.sh
```

### 4. Test Frontend Git Configuration

#### Basic Git User Configuration
1. Open frontend: `http://your-frontend-url/new`
2. Fill in basic session details:
   - Prompt: "Test Git integration"
   - Website URL: "https://example.com"
3. Fill in Git configuration:
   - Git User Name: "Test User"
   - Git User Email: "test@example.com"
   - Git Repository URL: "https://github.com/git/git.git" (public repo)
4. Submit form
5. Verify session is created successfully

#### Verify Backend Processing
Check that the backend correctly processes Git configuration:
```bash
kubectl logs -l app=vteam-backend -n your-namespace
```

#### Verify Operator Processing
Check that the operator correctly passes Git environment variables:
```bash
kubectl logs -l app=vteam-operator -n your-namespace
```

### 5. Test AgenticSession with Git Config

#### Create Test Session via API
```bash
curl -X POST http://your-backend-url/api/agentic-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test Git integration functionality",
    "websiteURL": "https://example.com",
    "gitConfig": {
      "user": {
        "name": "Test User",
        "email": "test@example.com"
      },
      "repositories": [
        {
          "url": "https://github.com/git/git.git",
          "branch": "main"
        }
      ]
    }
  }'
```

#### Verify Job Creation
```bash
kubectl get jobs -n your-namespace
kubectl describe job <job-name> -n your-namespace
```

#### Check Environment Variables in Job
```bash
kubectl get job <job-name> -o yaml | grep -A 20 "env:"
```

Should see:
- `GIT_USER_NAME: Test User`
- `GIT_USER_EMAIL: test@example.com`
- `GIT_REPOSITORIES: [{"url":"https://github.com/git/git.git","branch":"main"}]`

### 6. Test Container Git Integration

#### Check Pod Logs
```bash
kubectl logs <pod-name> -n your-namespace
```

Look for:
- Git configuration setup messages
- Repository cloning attempts
- Git user configuration

#### Exec into Running Pod (if available)
```bash
kubectl exec -it <pod-name> -n your-namespace -- /bin/bash

# Check Git configuration
git config --global user.name
git config --global user.email

# Test Git operations
cd /tmp
git clone https://github.com/git/git.git test-repo
cd test-repo
git log --oneline -5
```

### 7. Test Error Handling

#### Invalid Git Configuration
Test with invalid configurations:
- Invalid email format
- Invalid repository URL
- Missing required fields

#### Network Issues
Test behavior when Git repositories are unreachable.

### 8. Test CRD Schema Validation

#### Valid Git Configuration
```bash
kubectl apply -f - <<EOF
apiVersion: vteam.ambient-code/v1
kind: AgenticSession
metadata:
  name: test-git-session
  namespace: your-namespace
spec:
  prompt: "Test Git integration"
  websiteURL: "https://example.com"
  gitConfig:
    user:
      name: "Test User"
      email: "test@example.com"
    repositories:
    - url: "https://github.com/git/git.git"
      branch: "main"
EOF
```

#### Invalid Git Configuration
Test that invalid configurations are rejected by the CRD schema.

## Expected Test Results

### ✅ Success Indicators
- [ ] All automated tests pass
- [ ] Frontend form accepts Git configuration
- [ ] Backend API processes Git configuration correctly
- [ ] Operator creates jobs with Git environment variables
- [ ] Claude runner container has Git integration class available
- [ ] Git commands work in container environment
- [ ] AgenticSession CRD accepts Git configuration

### ❌ Failure Indicators
- Python import errors for git_integration module
- TypeScript compilation errors in frontend
- Go compilation errors in backend
- Kubernetes schema validation failures
- Missing environment variables in job pods
- Git command failures in container

## Troubleshooting

### Common Issues

1. **Import Error for git_integration**
   - Verify `git_integration.py` is copied to container
   - Check Dockerfile COPY statements

2. **Frontend TypeScript Errors**
   - Verify Git types are properly imported
   - Check form schema validation

3. **Backend Git Config Not Parsed**
   - Check JSON marshaling/unmarshaling
   - Verify struct tags are correct

4. **Job Missing Git Environment Variables**
   - Check operator Git config extraction
   - Verify environment variable setting in job spec

5. **Git Commands Fail in Container**
   - Check Git dependencies in requirements.txt
   - Verify OpenShift compatibility (filesystem permissions)

### Debug Commands

```bash
# Check CRD schema
kubectl explain agenticsession.spec.gitConfig

# Get AgenticSession details
kubectl get agenticsession <name> -o yaml

# Check job environment
kubectl get job <job-name> -o jsonpath='{.spec.template.spec.containers[0].env}'

# Pod troubleshooting
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous  # If pod restarted
```