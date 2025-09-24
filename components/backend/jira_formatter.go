package main

import (
	"fmt"
	"regexp"
	"strings"
)

// convertMarkdownToJiraWiki converts Markdown content to Jira Wiki markup for better formatting
func convertMarkdownToJiraWiki(markdown string) string {
	content := markdown

	// Pre-process: Clean up common markdown artifacts
	// Remove or fix malformed list markers and stray characters
	content = strings.ReplaceAll(content, "\r\n", "\n") // Normalize line endings
	content = strings.ReplaceAll(content, "\r", "\n")   // Handle old Mac line endings

	// Convert headers (# -> h1., ## -> h2., etc.)
	re := regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)
	content = re.ReplaceAllStringFunc(content, func(match string) string {
		parts := re.FindStringSubmatch(match)
		level := len(parts[1])
		text := parts[2]
		return fmt.Sprintf("h%d. %s", level, text)
	})

	// Convert code blocks (```lang -> {code:lang} ... {code})
	reCodeBlock := regexp.MustCompile("(?s)```(\\w*)\n(.*?)\n```")
	content = reCodeBlock.ReplaceAllStringFunc(content, func(match string) string {
		parts := reCodeBlock.FindStringSubmatch(match)
		lang := parts[1]
		code := parts[2]
		if lang != "" {
			return fmt.Sprintf("{code:%s}\n%s\n{code}", lang, code)
		}
		return fmt.Sprintf("{code}\n%s\n{code}", code)
	})

	// Convert inline code (`code` -> {{code}})
	reInlineCode := regexp.MustCompile("`([^`]+)`")
	content = reInlineCode.ReplaceAllString(content, "{{$1}}")

	// Convert bold (**text** -> *text*)
	reBold := regexp.MustCompile(`\*\*([^*]+)\*\*`)
	content = reBold.ReplaceAllString(content, "*$1*")

	// Convert italic (*text* -> _text_, but avoid conflicts with bold)
	reItalic := regexp.MustCompile(`(?:^|[^*])\*([^*]+)\*(?:[^*]|$)`)
	content = reItalic.ReplaceAllStringFunc(content, func(match string) string {
		if strings.Contains(match, "**") {
			return match // Skip if it's part of bold formatting
		}
		return strings.Replace(match, "*", "_", -1)
	})

	// Convert links ([text](url) -> [text|url])
	reLink := regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	content = reLink.ReplaceAllString(content, "[$1|$2]")

	// Convert lists using Jira-specific rules
	// Jira requires lists to start in first column with proper nesting syntax

	// Convert unordered lists (- item -> * item)
	reUnorderedList := regexp.MustCompile(`(?m)^(\s*)-\s+(.+)$`)
	content = reUnorderedList.ReplaceAllStringFunc(content, func(match string) string {
		parts := reUnorderedList.FindStringSubmatch(match)
		indent := parts[1]
		text := parts[2]
		// Convert indentation to Jira nested bullet syntax
		nestLevel := len(indent) / 2 // Assume 2 spaces per indent level
		if nestLevel > 4 { nestLevel = 4 } // Jira supports up to 4 levels
		bullets := strings.Repeat("*", nestLevel + 1)
		return bullets + " " + text
	})

	// Convert other bullet markers (∅, ○, ●, etc. -> *) - Handle both leading and embedded
	reBulletMarkers := regexp.MustCompile(`(?m)^(\s*)[∅○●•]\s+(.+)$`)
	content = reBulletMarkers.ReplaceAllStringFunc(content, func(match string) string {
		parts := reBulletMarkers.FindStringSubmatch(match)
		indent := parts[1]
		text := parts[2]
		nestLevel := len(indent) / 2
		if nestLevel > 4 { nestLevel = 4 }
		bullets := strings.Repeat("*", nestLevel + 1)
		return bullets + " " + text
	})

	// Also handle bullet markers that appear mid-line (not at start)
	reInlineBullets := regexp.MustCompile(`(\s+)[∅○●•]\s+`)
	content = reInlineBullets.ReplaceAllString(content, "$1* ")

	// Convert ordered lists (1. item -> # item)
	reOrderedList := regexp.MustCompile(`(?m)^(\s*)\d+\.\s+(.+)$`)
	content = reOrderedList.ReplaceAllStringFunc(content, func(match string) string {
		parts := reOrderedList.FindStringSubmatch(match)
		indent := parts[1]
		text := parts[2]
		// Convert indentation to Jira nested number syntax
		nestLevel := len(indent) / 2
		if nestLevel > 4 { nestLevel = 4 }
		numbers := strings.Repeat("#", nestLevel + 1)
		return numbers + " " + text
	})

	// Post-process cleanup: Fix common artifacts that cause display issues
	// Remove standalone "?" characters that appear from malformed conversions
	reStrayQuestions := regexp.MustCompile(`(?m)^\s*\?\s*$`)
	content = reStrayQuestions.ReplaceAllString(content, "")

	// Remove stray question marks in lists
	reListQuestions := regexp.MustCompile(`(\*\s+.*?)\?\s*(\n|$)`)
	content = reListQuestions.ReplaceAllString(content, "$1$2")

	// Final cleanup: Replace any remaining ∅ symbols with proper bullets
	reRemainingBullets := regexp.MustCompile(`[∅○●•]`)
	content = reRemainingBullets.ReplaceAllString(content, "*")

	// Clean up multiple consecutive newlines
	reMultiNewlines := regexp.MustCompile(`\n{3,}`)
	content = reMultiNewlines.ReplaceAllString(content, "\n\n")

	// Clean up any remaining markdown artifacts
	// Remove empty list items
	reEmptyListItems := regexp.MustCompile(`(?m)^[\*#]\s*$`)
	content = reEmptyListItems.ReplaceAllString(content, "")

	// Ensure proper list formatting - fix indentation and spacing
	reListSpacing := regexp.MustCompile(`(?m)^(\s*[\*#])\s*(.+)$`)
	content = reListSpacing.ReplaceAllString(content, "$1 $2")

	// Fix spacing around headers
	reHeaderSpacing := regexp.MustCompile(`\n(h[1-6]\.)`)
	content = reHeaderSpacing.ReplaceAllString(content, "\n\n$1")

	// Convert horizontal rules (--- -> -----)
	reHR := regexp.MustCompile(`(?m)^---+$`)
	content = reHR.ReplaceAllString(content, "-----")

	// Convert blockquotes (> text -> bq. text)
	reBlockquote := regexp.MustCompile(`(?m)^>\s+(.+)$`)
	content = reBlockquote.ReplaceAllString(content, "bq. $1")

	// Convert strikethrough (~~text~~ -> -text-)
	reStrikethrough := regexp.MustCompile(`~~([^~]+)~~`)
	content = reStrikethrough.ReplaceAllString(content, "-$1-")

	return content
}

// extractTitleFromJiraWiki extracts title from Jira wiki content (for completeness)
func extractTitleFromJiraWiki(content string) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "h1. ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "h1. "))
		}
	}
	return ""
}