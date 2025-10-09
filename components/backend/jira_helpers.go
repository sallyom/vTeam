package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
)

const (
	// Annotation keys
	jiraLinksAnnotation     = "vteam.ambient-code/jiraLinks"
	lastJiraPushAnnotation  = "vteam.ambient-code/lastJiraPush"
)

// getJiraLinks parses the jiraLinks annotation from an AgenticSession CR
func getJiraLinks(cr *unstructured.Unstructured) ([]JiraLink, error) {
	annotations := cr.GetAnnotations()
	if annotations == nil {
		return []JiraLink{}, nil
	}

	linksJSON, ok := annotations[jiraLinksAnnotation]
	if !ok || linksJSON == "" {
		return []JiraLink{}, nil
	}

	var links []JiraLink
	if err := json.Unmarshal([]byte(linksJSON), &links); err != nil {
		return nil, fmt.Errorf("failed to parse jiraLinks annotation: %w", err)
	}

	return links, nil
}

// addJiraLink appends a new JiraLink to the annotation array
func addJiraLink(cr *unstructured.Unstructured, link JiraLink) error {
	// Get existing links
	links, err := getJiraLinks(cr)
	if err != nil {
		return err
	}

	// Append new link
	links = append(links, link)

	// Marshal back to JSON
	linksJSON, err := json.Marshal(links)
	if err != nil {
		return fmt.Errorf("failed to marshal jiraLinks: %w", err)
	}

	// Update annotations
	annotations := cr.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}

	annotations[jiraLinksAnnotation] = string(linksJSON)
	annotations[lastJiraPushAnnotation] = time.Now().Format(time.RFC3339)

	cr.SetAnnotations(annotations)

	return nil
}

// addMultipleJiraLinks appends multiple JiraLinks to the annotation array
func addMultipleJiraLinks(cr *unstructured.Unstructured, newLinks []JiraLink) error {
	// Get existing links
	links, err := getJiraLinks(cr)
	if err != nil {
		return err
	}

	// Append new links
	links = append(links, newLinks...)

	// Marshal back to JSON
	linksJSON, err := json.Marshal(links)
	if err != nil {
		return fmt.Errorf("failed to marshal jiraLinks: %w", err)
	}

	// Update annotations
	annotations := cr.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}

	annotations[jiraLinksAnnotation] = string(linksJSON)
	annotations[lastJiraPushAnnotation] = time.Now().Format(time.RFC3339)

	cr.SetAnnotations(annotations)

	return nil
}

// updateSessionAnnotations updates the AgenticSession CR in Kubernetes
func updateSessionAnnotations(ctx context.Context, client dynamic.Interface, cr *unstructured.Unstructured) error {
	namespace := cr.GetNamespace()
	name := cr.GetName()

	// Get the GVR for AgenticSession
	gvr := agenticSessionGVR()

	// Update the resource
	_, err := client.Resource(gvr).Namespace(namespace).Update(ctx, cr, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update AgenticSession annotations: %w", err)
	}

	return nil
}

// getAgenticSessionCR retrieves an AgenticSession CR from Kubernetes
func getAgenticSessionCR(ctx context.Context, client dynamic.Interface, namespace, name string) (*unstructured.Unstructured, error) {
	gvr := agenticSessionGVR()

	cr, err := client.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get AgenticSession: %w", err)
	}

	return cr, nil
}

// getSessionStateDir extracts the stateDir from AgenticSession status
func getSessionStateDir(cr *unstructured.Unstructured) (string, error) {
	status, found, err := unstructured.NestedString(cr.Object, "status", "stateDir")
	if err != nil {
		return "", fmt.Errorf("failed to get stateDir: %w", err)
	}

	if !found || status == "" {
		return "", fmt.Errorf("stateDir not found in AgenticSession status")
	}

	return status, nil
}

// getSessionPhase extracts the phase from AgenticSession status
func getSessionPhase(cr *unstructured.Unstructured) (string, error) {
	phase, found, err := unstructured.NestedString(cr.Object, "status", "phase")
	if err != nil {
		return "", fmt.Errorf("failed to get phase: %w", err)
	}

	if !found {
		return "", fmt.Errorf("phase not found in AgenticSession status")
	}

	return phase, nil
}

// buildSessionComment creates a formatted comment for Jira with session metadata
func buildSessionComment(cr *unstructured.Unstructured, artifacts []string, vteamURL string) (string, error) {
	namespace := cr.GetNamespace()
	name := cr.GetName()

	// Get session metadata
	prompt, _ := unstructured.NestedString(cr.Object, "spec", "prompt")
	phase, _ := getSessionPhase(cr)
	model, _ := unstructured.NestedString(cr.Object, "spec", "llmSettings", "model")
	cost, _, _ := unstructured.NestedFloat64(cr.Object, "status", "total_cost_usd")
	turns, _, _ := unstructured.NestedInt64(cr.Object, "status", "num_turns")

	// Truncate prompt if too long
	if len(prompt) > 200 {
		prompt = prompt[:197] + "..."
	}

	// Build comment
	comment := fmt.Sprintf("🤖 vTeam AgenticSession: %s\n\n", name)
	comment += fmt.Sprintf("**Prompt**: %s\n", prompt)
	if model != "" {
		comment += fmt.Sprintf("**Model**: %s\n", model)
	}
	comment += fmt.Sprintf("**Phase**: %s\n", phase)
	if cost > 0 {
		comment += fmt.Sprintf("**Cost**: $%.4f\n", cost)
	}
	if turns > 0 {
		comment += fmt.Sprintf("**Turns**: %d\n", turns)
	}
	comment += "\n"

	// Add vTeam link
	if vteamURL != "" {
		sessionURL := fmt.Sprintf("%s/projects/%s/sessions/%s", vteamURL, namespace, name)
		comment += fmt.Sprintf("[View Session in vTeam](%s)\n\n", sessionURL)
	}

	// List artifacts
	if len(artifacts) > 0 {
		comment += fmt.Sprintf("Artifacts attached: %d files\n", len(artifacts))
		for i, artifact := range artifacts {
			if i < 10 { // Limit to first 10 artifacts in comment
				comment += fmt.Sprintf("- %s\n", artifact)
			}
		}
		if len(artifacts) > 10 {
			comment += fmt.Sprintf("... and %d more\n", len(artifacts)-10)
		}
	}

	return comment, nil
}
