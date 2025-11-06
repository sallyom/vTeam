package sessions

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"ambient-code-backend/handlers"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// pushSessionRepo proxies a push request for a given session repo to the per-job content service.
// POST /api/projects/:projectName/agentic-sessions/:sessionName/github/push
// Body: { repoIndex: number, commitMessage?: string, branch?: string }
func PushSessionRepo(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")

	var body struct {
		RepoIndex     int    `json:"repoIndex"`
		CommitMessage string `json:"commitMessage"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}
	log.Printf("pushSessionRepo: request project=%s session=%s repoIndex=%d commitLen=%d", project, session, body.RepoIndex, len(strings.TrimSpace(body.CommitMessage)))

	// Try temp service first (for completed sessions), then regular service
	serviceName := fmt.Sprintf("temp-content-%s", session)
	reqK8s, _ := handlers.GetK8sClientsForRequest(c)
	if reqK8s != nil {
		if _, err := reqK8s.CoreV1().Services(project).Get(c.Request.Context(), serviceName, v1.GetOptions{}); err != nil {
			serviceName = fmt.Sprintf("ambient-content-%s", session)
		}
	} else {
		serviceName = fmt.Sprintf("ambient-content-%s", session)
	}
	endpoint := fmt.Sprintf("http://%s.%s.svc:8080", serviceName, project)
	log.Printf("pushSessionRepo: using service %s", serviceName)

	// Simplified: 1) get session; 2) compute repoPath from INPUT repo folder; 3) get output url/branch; 4) proxy
	resolvedRepoPath := ""
	// default branch when not defined on output
	resolvedBranch := fmt.Sprintf("sessions/%s", session)
	resolvedOutputURL := ""
	if _, reqDyn := handlers.GetK8sClientsForRequest(c); reqDyn != nil {
		gvr := handlers.GetAgenticSessionV1Alpha1Resource()
		obj, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), session, v1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read session"})
			return
		}
		spec, _ := obj.Object["spec"].(map[string]interface{})
		repos, _ := spec["repos"].([]interface{})
		if body.RepoIndex < 0 || body.RepoIndex >= len(repos) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo index"})
			return
		}
		rm, _ := repos[body.RepoIndex].(map[string]interface{})
		// Derive repoPath from input URL folder name
		if in, ok := rm["input"].(map[string]interface{}); ok {
			if urlv, ok2 := in["url"].(string); ok2 && strings.TrimSpace(urlv) != "" {
				folder := handlers.DeriveRepoFolderFromURL(strings.TrimSpace(urlv))
				if folder != "" {
					resolvedRepoPath = fmt.Sprintf("/sessions/%s/workspace/%s", session, folder)
				}
			}
		}
		if out, ok := rm["output"].(map[string]interface{}); ok {
			if urlv, ok2 := out["url"].(string); ok2 && strings.TrimSpace(urlv) != "" {
				resolvedOutputURL = strings.TrimSpace(urlv)
			}
			if bs, ok2 := out["branch"].(string); ok2 && strings.TrimSpace(bs) != "" {
				resolvedBranch = strings.TrimSpace(bs)
			} else if bv, ok2 := out["branch"].(*string); ok2 && bv != nil && strings.TrimSpace(*bv) != "" {
				resolvedBranch = strings.TrimSpace(*bv)
			}
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no dynamic client"})
		return
	}
	// If input URL missing or unparsable, fall back to numeric index path (last resort)
	if strings.TrimSpace(resolvedRepoPath) == "" {
		if body.RepoIndex >= 0 {
			resolvedRepoPath = fmt.Sprintf("/sessions/%s/workspace/%d", session, body.RepoIndex)
		} else {
			resolvedRepoPath = fmt.Sprintf("/sessions/%s/workspace", session)
		}
	}
	if strings.TrimSpace(resolvedOutputURL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing output repo url"})
		return
	}
	log.Printf("pushSessionRepo: resolved repoPath=%q outputUrl=%q branch=%q", resolvedRepoPath, resolvedOutputURL, resolvedBranch)

	payload := map[string]interface{}{
		"repoPath":      resolvedRepoPath,
		"commitMessage": body.CommitMessage,
		"branch":        resolvedBranch,
		"outputRepoUrl": resolvedOutputURL,
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, endpoint+"/content/github/push", strings.NewReader(string(b)))
	if v := c.GetHeader("Authorization"); v != "" {
		req.Header.Set("Authorization", v)
	}
	if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
		req.Header.Set("X-Forwarded-Access-Token", v)
	}
	req.Header.Set("Content-Type", "application/json")

	// Attach short-lived GitHub token for one-shot authenticated push
	if reqK8s, reqDyn := handlers.GetK8sClientsForRequest(c); reqK8s != nil {
		// Load session to get authoritative userId
		gvr := handlers.GetAgenticSessionV1Alpha1Resource()
		obj, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), session, v1.GetOptions{})
		if err == nil {
			spec, _ := obj.Object["spec"].(map[string]interface{})
			userId := ""
			if spec != nil {
				if uc, ok := spec["userContext"].(map[string]interface{}); ok {
					if v, ok := uc["userId"].(string); ok {
						userId = strings.TrimSpace(v)
					}
				}
			}
			if userId != "" {
				if tokenStr, err := handlers.GetGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userId); err == nil && strings.TrimSpace(tokenStr) != "" {
					req.Header.Set("X-GitHub-Token", tokenStr)
					log.Printf("pushSessionRepo: attached short-lived GitHub token for project=%s session=%s", project, session)
				} else if err != nil {
					log.Printf("pushSessionRepo: failed to resolve GitHub token: %v", err)
				}
			} else {
				log.Printf("pushSessionRepo: session %s/%s missing userContext.userId; proceeding without token", project, session)
			}
		} else {
			log.Printf("pushSessionRepo: failed to read session for token attach: %v", err)
		}
	}

	log.Printf("pushSessionRepo: proxy push project=%s session=%s repoIndex=%d repoPath=%s endpoint=%s", project, session, body.RepoIndex, resolvedRepoPath, endpoint+"/content/github/push")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("pushSessionRepo: content returned status=%d body.snip=%q", resp.StatusCode, func() string {
			s := string(bodyBytes)
			if len(s) > 1500 {
				return s[:1500] + "..."
			}
			return s
		}())
		c.Data(resp.StatusCode, "application/json", bodyBytes)
		return
	}
	if _, reqDyn := handlers.GetK8sClientsForRequest(c); reqDyn != nil {
		log.Printf("pushSessionRepo: setting repo status to 'pushed' for repoIndex=%d", body.RepoIndex)
		if err := setRepoStatus(reqDyn, project, session, body.RepoIndex, "pushed"); err != nil {
			log.Printf("pushSessionRepo: setRepoStatus failed project=%s session=%s repoIndex=%d err=%v", project, session, body.RepoIndex, err)
		}
	} else {
		log.Printf("pushSessionRepo: no dynamic client; cannot set repo status project=%s session=%s", project, session)
	}
	log.Printf("pushSessionRepo: content push succeeded status=%d body.len=%d", resp.StatusCode, len(bodyBytes))
	c.Data(http.StatusOK, "application/json", bodyBytes)
}

// abandonSessionRepo instructs sidecar to discard local changes for a repo
func AbandonSessionRepo(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	var body struct {
		RepoIndex int    `json:"repoIndex"`
		RepoPath  string `json:"repoPath"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}

	// Try temp service first (for completed sessions), then regular service
	serviceName := fmt.Sprintf("temp-content-%s", session)
	reqK8s, _ := handlers.GetK8sClientsForRequest(c)
	if reqK8s != nil {
		if _, err := reqK8s.CoreV1().Services(project).Get(c.Request.Context(), serviceName, v1.GetOptions{}); err != nil {
			serviceName = fmt.Sprintf("ambient-content-%s", session)
		}
	} else {
		serviceName = fmt.Sprintf("ambient-content-%s", session)
	}
	endpoint := fmt.Sprintf("http://%s.%s.svc:8080", serviceName, project)
	log.Printf("AbandonSessionRepo: using service %s", serviceName)
	repoPath := strings.TrimSpace(body.RepoPath)
	if repoPath == "" {
		if body.RepoIndex >= 0 {
			repoPath = fmt.Sprintf("/sessions/%s/workspace/%d", session, body.RepoIndex)
		} else {
			repoPath = fmt.Sprintf("/sessions/%s/workspace", session)
		}
	}
	payload := map[string]interface{}{
		"repoPath": repoPath,
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, endpoint+"/content/github/abandon", strings.NewReader(string(b)))
	if v := c.GetHeader("Authorization"); v != "" {
		req.Header.Set("Authorization", v)
	}
	if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
		req.Header.Set("X-Forwarded-Access-Token", v)
	}
	req.Header.Set("Content-Type", "application/json")
	log.Printf("abandonSessionRepo: proxy abandon project=%s session=%s repoIndex=%d repoPath=%s", project, session, body.RepoIndex, repoPath)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("abandonSessionRepo: content returned status=%d body=%s", resp.StatusCode, string(bodyBytes))
		c.Data(resp.StatusCode, "application/json", bodyBytes)
		return
	}
	if _, reqDyn := handlers.GetK8sClientsForRequest(c); reqDyn != nil {
		if err := setRepoStatus(reqDyn, project, session, body.RepoIndex, "abandoned"); err != nil {
			log.Printf("abandonSessionRepo: setRepoStatus failed project=%s session=%s repoIndex=%d err=%v", project, session, body.RepoIndex, err)
		}
	} else {
		log.Printf("abandonSessionRepo: no dynamic client; cannot set repo status project=%s session=%s", project, session)
	}
	c.Data(http.StatusOK, "application/json", bodyBytes)
}

// diffSessionRepo proxies diff counts for a given session repo to the content sidecar
// GET /api/projects/:projectName/agentic-sessions/:sessionName/github/diff?repoIndex=0&repoPath=...
func DiffSessionRepo(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	repoIndexStr := strings.TrimSpace(c.Query("repoIndex"))
	repoPath := strings.TrimSpace(c.Query("repoPath"))
	if repoPath == "" && repoIndexStr != "" {
		repoPath = fmt.Sprintf("/sessions/%s/workspace/%s", session, repoIndexStr)
	}
	if repoPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing repoPath/repoIndex"})
		return
	}

	// Try temp service first (for completed sessions), then regular service
	serviceName := fmt.Sprintf("temp-content-%s", session)
	reqK8s, _ := handlers.GetK8sClientsForRequest(c)
	if reqK8s != nil {
		if _, err := reqK8s.CoreV1().Services(project).Get(c.Request.Context(), serviceName, v1.GetOptions{}); err != nil {
			serviceName = fmt.Sprintf("ambient-content-%s", session)
		}
	} else {
		serviceName = fmt.Sprintf("ambient-content-%s", session)
	}
	endpoint := fmt.Sprintf("http://%s.%s.svc:8080", serviceName, project)
	log.Printf("DiffSessionRepo: using service %s", serviceName)
	url := fmt.Sprintf("%s/content/github/diff?repoPath=%s", endpoint, url.QueryEscape(repoPath))
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
	if v := c.GetHeader("Authorization"); v != "" {
		req.Header.Set("Authorization", v)
	}
	if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
		req.Header.Set("X-Forwarded-Access-Token", v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"files": gin.H{
				"added":   0,
				"removed": 0,
			},
			"total_added":   0,
			"total_removed": 0,
		})
		return
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), bodyBytes)
}
