package handlers

import (
	"strings"
	"testing"
)

// TestIsValidKubernetesName tests the isValidKubernetesName function
// This is a security-critical validation function that prevents injection attacks
// by ensuring namespace and service account names follow Kubernetes DNS-1123 label rules
func TestIsValidKubernetesName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
		reason   string
	}{
		// Valid cases - single character
		{
			name:     "single lowercase letter",
			input:    "a",
			expected: true,
			reason:   "single char is valid",
		},
		{
			name:     "single digit",
			input:    "0",
			expected: true,
			reason:   "single digit is valid",
		},

		// Valid cases - simple names
		{
			name:     "simple lowercase name",
			input:    "test",
			expected: true,
			reason:   "simple lowercase is valid",
		},
		{
			name:     "name with digit",
			input:    "test1",
			expected: true,
			reason:   "alphanumeric is valid",
		},
		{
			name:     "name starting with digit",
			input:    "1test",
			expected: true,
			reason:   "can start with digit",
		},

		// Valid cases - with hyphens
		{
			name:     "name with hyphen",
			input:    "test-namespace",
			expected: true,
			reason:   "hyphen in middle is valid",
		},
		{
			name:     "name with multiple hyphens",
			input:    "test-name-space",
			expected: true,
			reason:   "multiple hyphens are valid",
		},
		{
			name:     "production environment",
			input:    "prod-env-1",
			expected: true,
			reason:   "production naming pattern",
		},
		{
			name:     "consecutive hyphens",
			input:    "test--name",
			expected: true,
			reason:   "consecutive hyphens are allowed",
		},

		// Valid cases - edge of length limit
		{
			name:     "exactly 63 characters",
			input:    strings.Repeat("a", 63),
			expected: true,
			reason:   "63 chars is at the limit",
		},
		{
			name:     "63 chars with hyphens",
			input:    "a" + strings.Repeat("-b", 31), // 1 + 62 = 63
			expected: true,
			reason:   "63 chars with hyphens is valid",
		},

		// Invalid cases - empty and length violations
		{
			name:     "empty string",
			input:    "",
			expected: false,
			reason:   "empty string prevents injection",
		},
		{
			name:     "exceeds 63 characters",
			input:    strings.Repeat("a", 64),
			expected: false,
			reason:   "64 chars exceeds limit",
		},
		{
			name:     "way over 63 characters",
			input:    "over-63-characters-loooooooooooooooooooooooooooooooooooooooooong",
			expected: false,
			reason:   "long strings are rejected",
		},

		// Invalid cases - starts or ends with hyphen
		{
			name:     "starts with hyphen",
			input:    "-invalid",
			expected: false,
			reason:   "cannot start with hyphen",
		},
		{
			name:     "ends with hyphen",
			input:    "invalid-",
			expected: false,
			reason:   "cannot end with hyphen",
		},
		{
			name:     "only hyphen",
			input:    "-",
			expected: false,
			reason:   "hyphen alone is invalid",
		},
		{
			name:     "starts and ends with hyphen",
			input:    "-test-",
			expected: false,
			reason:   "cannot start/end with hyphen",
		},

		// Invalid cases - uppercase
		{
			name:     "uppercase letters",
			input:    "UPPERCASE",
			expected: false,
			reason:   "must be lowercase",
		},
		{
			name:     "mixed case",
			input:    "Test",
			expected: false,
			reason:   "must be lowercase",
		},
		{
			name:     "camelCase",
			input:    "testNamespace",
			expected: false,
			reason:   "camelCase not allowed",
		},

		// Invalid cases - special characters
		{
			name:     "underscore",
			input:    "test_namespace",
			expected: false,
			reason:   "underscore not allowed",
		},
		{
			name:     "dot",
			input:    "test.namespace",
			expected: false,
			reason:   "dot not allowed",
		},
		{
			name:     "slash",
			input:    "test/namespace",
			expected: false,
			reason:   "slash prevents path traversal",
		},
		{
			name:     "backslash",
			input:    "test\\namespace",
			expected: false,
			reason:   "backslash prevents injection",
		},
		{
			name:     "space",
			input:    "test namespace",
			expected: false,
			reason:   "space not allowed",
		},
		{
			name:     "tab",
			input:    "test\tnamespace",
			expected: false,
			reason:   "tab not allowed",
		},
		{
			name:     "newline",
			input:    "test\nnamespace",
			expected: false,
			reason:   "newline prevents injection",
		},

		// Invalid cases - special symbols
		{
			name:     "exclamation mark",
			input:    "test!",
			expected: false,
			reason:   "special chars not allowed",
		},
		{
			name:     "at symbol",
			input:    "test@domain",
			expected: false,
			reason:   "at symbol not allowed",
		},
		{
			name:     "dollar sign",
			input:    "test$var",
			expected: false,
			reason:   "dollar prevents injection",
		},
		{
			name:     "semicolon",
			input:    "test;cmd",
			expected: false,
			reason:   "semicolon prevents command injection",
		},
		{
			name:     "pipe",
			input:    "test|cmd",
			expected: false,
			reason:   "pipe prevents command chaining",
		},
		{
			name:     "ampersand",
			input:    "test&cmd",
			expected: false,
			reason:   "ampersand prevents background execution",
		},
		{
			name:     "backtick",
			input:    "test`cmd`",
			expected: false,
			reason:   "backtick prevents command substitution",
		},
		{
			name:     "single quote",
			input:    "test'cmd",
			expected: false,
			reason:   "quote prevents SQL injection",
		},
		{
			name:     "double quote",
			input:    "test\"cmd",
			expected: false,
			reason:   "quote prevents injection",
		},

		// Invalid cases - brackets and parentheses
		{
			name:     "parentheses",
			input:    "test(1)",
			expected: false,
			reason:   "parentheses not allowed",
		},
		{
			name:     "square brackets",
			input:    "test[0]",
			expected: false,
			reason:   "brackets not allowed",
		},
		{
			name:     "curly braces",
			input:    "test{var}",
			expected: false,
			reason:   "braces prevent injection",
		},
		{
			name:     "angle brackets",
			input:    "test<tag>",
			expected: false,
			reason:   "angle brackets prevent XSS",
		},

		// Invalid cases - path-like inputs
		{
			name:     "relative path parent",
			input:    "../etc",
			expected: false,
			reason:   "prevents directory traversal",
		},
		{
			name:     "absolute path",
			input:    "/etc/passwd",
			expected: false,
			reason:   "prevents absolute path access",
		},
		{
			name:     "windows path",
			input:    "c:\\windows",
			expected: false,
			reason:   "prevents windows path access",
		},

		// Invalid cases - injection attempts
		{
			name:     "command injection semicolon",
			input:    "test;rm -rf /",
			expected: false,
			reason:   "prevents command injection",
		},
		{
			name:     "command injection pipe",
			input:    "test|whoami",
			expected: false,
			reason:   "prevents command chaining",
		},
		{
			name:     "sql injection",
			input:    "test' OR '1'='1",
			expected: false,
			reason:   "prevents SQL injection",
		},
		{
			name:     "xss attempt",
			input:    "test<script>alert(1)</script>",
			expected: false,
			reason:   "prevents XSS injection",
		},

		// Valid cases - common namespace patterns
		{
			name:     "default namespace",
			input:    "default",
			expected: true,
			reason:   "common namespace name",
		},
		{
			name:     "kube-system style",
			input:    "kube-system",
			expected: true,
			reason:   "kubernetes standard namespace",
		},
		{
			name:     "environment with number",
			input:    "dev-env-123",
			expected: true,
			reason:   "environment naming pattern",
		},
		{
			name:     "user namespace",
			input:    "user-alice",
			expected: true,
			reason:   "user namespace pattern",
		},
		{
			name:     "app with version",
			input:    "myapp-v2",
			expected: true,
			reason:   "app versioning pattern",
		},

		// Edge cases - numeric
		{
			name:     "all digits",
			input:    "12345",
			expected: true,
			reason:   "all digits is valid",
		},
		{
			name:     "leading zero",
			input:    "0test",
			expected: true,
			reason:   "leading zero is valid",
		},

		// Edge cases - hyphen combinations
		{
			name:     "three hyphens in row",
			input:    "a---b",
			expected: true,
			reason:   "multiple consecutive hyphens allowed",
		},
		{
			name:     "alternating hyphen digit",
			input:    "1-2-3-4",
			expected: true,
			reason:   "alternating pattern is valid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidKubernetesName(tt.input)
			if result != tt.expected {
				t.Errorf("isValidKubernetesName(%q) = %v, expected %v (reason: %s)",
					tt.input, result, tt.expected, tt.reason)
			}
		})
	}
}

// TestIsValidKubernetesNameSecurityCases specifically tests security-critical cases
func TestIsValidKubernetesNameSecurityCases(t *testing.T) {
	// Security-critical test cases that MUST be blocked
	securityTests := []struct {
		name        string
		input       string
		attackType  string
		description string
	}{
		{
			name:        "command injection with semicolon",
			input:       "ns;cat /etc/passwd",
			attackType:  "command_injection",
			description: "prevents command execution via semicolon",
		},
		{
			name:        "command injection with pipe",
			input:       "ns|whoami",
			attackType:  "command_injection",
			description: "prevents command chaining via pipe",
		},
		{
			name:        "command injection with ampersand",
			input:       "ns&id",
			attackType:  "command_injection",
			description: "prevents background command execution",
		},
		{
			name:        "command substitution with backticks",
			input:       "ns`id`",
			attackType:  "command_injection",
			description: "prevents command substitution",
		},
		{
			name:        "command substitution with dollar paren",
			input:       "ns$(whoami)",
			attackType:  "command_injection",
			description: "prevents command substitution with $()",
		},
		{
			name:        "path traversal with parent directory",
			input:       "../../../etc/passwd",
			attackType:  "path_traversal",
			description: "prevents directory traversal",
		},
		{
			name:        "path traversal with encoded dots",
			input:       "..%2f..%2fetc",
			attackType:  "path_traversal",
			description: "prevents URL-encoded traversal",
		},
		{
			name:        "absolute path to system directory",
			input:       "/etc/shadow",
			attackType:  "path_traversal",
			description: "prevents absolute path access",
		},
		{
			name:        "SQL injection with quotes",
			input:       "ns' OR '1'='1",
			attackType:  "sql_injection",
			description: "prevents SQL injection",
		},
		{
			name:        "SQL injection with comment",
			input:       "ns--",
			attackType:  "sql_injection",
			description: "blocks SQL comment syntax (but also invalid K8s name)",
		},
		{
			name:        "XSS with script tag",
			input:       "<script>alert(1)</script>",
			attackType:  "xss",
			description: "prevents XSS injection",
		},
		{
			name:        "XSS with event handler",
			input:       "ns<img src=x onerror=alert(1)>",
			attackType:  "xss",
			description: "prevents XSS via event handlers",
		},
		{
			name:        "null byte injection",
			input:       "ns\x00admin",
			attackType:  "null_byte_injection",
			description: "prevents null byte attacks",
		},
		{
			name:        "CRLF injection",
			input:       "ns\r\nAdmin: true",
			attackType:  "crlf_injection",
			description: "prevents HTTP header injection",
		},
		{
			name:        "unicode homoglyph attack",
			input:       "аdmin", // Cyrillic 'а' instead of Latin 'a'
			attackType:  "homoglyph",
			description: "prevents unicode homoglyph spoofing",
		},
		{
			name:        "empty string bypass",
			input:       "",
			attackType:  "empty_string",
			description: "prevents empty string injection",
		},
		{
			name:        "whitespace only",
			input:       "   ",
			attackType:  "whitespace",
			description: "prevents whitespace-only names",
		},
	}

	for _, tt := range securityTests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidKubernetesName(tt.input)
			if result {
				t.Errorf("SECURITY VIOLATION: isValidKubernetesName(%q) = true, expected false\n"+
					"Attack Type: %s\n"+
					"Description: %s\n"+
					"This indicates a potential security vulnerability!",
					tt.input, tt.attackType, tt.description)
			}
		})
	}
}

// TestIsValidKubernetesNameBoundaryConditions tests boundary conditions
func TestIsValidKubernetesNameBoundaryConditions(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		// Exact boundary at 63 characters
		{"exactly 62 chars", strings.Repeat("a", 62), true},
		{"exactly 63 chars", strings.Repeat("a", 63), true},
		{"exactly 64 chars", strings.Repeat("a", 64), false},
		{"exactly 65 chars", strings.Repeat("a", 65), false},

		// Boundary with hyphen at limit
		{"62 chars ending with letter", strings.Repeat("a", 61) + "b", true},
		{"63 chars ending with letter", strings.Repeat("a", 62) + "b", true},
		{"63 chars ending with digit", strings.Repeat("a", 62) + "0", true},

		// Empty and single character
		{"empty string", "", false},
		{"single letter a", "a", true},
		{"single letter z", "z", true},
		{"single digit 0", "0", true},
		{"single digit 9", "9", true},
		{"single hyphen", "-", false},

		// Start/end character validation
		{"starts with hyphen, 2 chars", "-a", false},
		{"ends with hyphen, 2 chars", "a-", false},
		{"starts and ends with hyphen, 3 chars", "-a-", false},
		{"hyphen in middle only", "a-b", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidKubernetesName(tt.input)
			if result != tt.expected {
				t.Errorf("isValidKubernetesName(%q) [len=%d] = %v, expected %v",
					tt.input, len(tt.input), result, tt.expected)
			}
		})
	}
}

// TestKubernetesNameRegexDirect tests the regex pattern directly
func TestKubernetesNameRegexDirect(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		// These should match the regex (but may fail length check)
		{"a", true},
		{"abc", true},
		{"a1", true},
		{"1a", true},
		{"a-b", true},
		{"abc-123", true},

		// These should NOT match the regex
		{"-abc", false},
		{"abc-", false},
		{"ABC", false},
		{"a_b", false},
		{"a.b", false},
		{"a b", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := kubernetesNameRegex.MatchString(tt.input)
			if result != tt.expected {
				t.Errorf("kubernetesNameRegex.MatchString(%q) = %v, expected %v",
					tt.input, result, tt.expected)
			}
		})
	}
}
