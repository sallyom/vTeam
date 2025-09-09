"""
Tests for AI client validation logic
Focus on testing the validation functions without complex mocking
"""

import pytest
from ai_models.anthropic_client import (
    validate_vertex_config,
    validate_model_name,
    SUPPORTED_VERTEX_MODELS
)


class TestVertexAIValidation:
    """Test Vertex AI configuration validation"""
    
    def test_validate_vertex_config_valid_combinations(self):
        """Test validation with valid project ID and region combinations"""
        valid_combinations = [
            ("test-project-123", "us-east5"),
            ("my-gcp-project", "us-central1"),
            ("project-with-numbers-123", "europe-west1"),
            ("another-project", "asia-southeast1"),
        ]
        
        for project_id, region in valid_combinations:
            result = validate_vertex_config(project_id, region)
            assert result is None, f"Valid combination {project_id}, {region} should pass validation"
    
    def test_validate_vertex_config_missing_values(self):
        """Test validation with missing values"""
        test_cases = [
            (None, "us-east5", "Missing ANTHROPIC_VERTEX_PROJECT_ID"),
            ("", "us-east5", "Missing ANTHROPIC_VERTEX_PROJECT_ID"),
            ("test-project", None, "Missing CLOUD_ML_REGION"),
            ("test-project", "", "Missing CLOUD_ML_REGION"),
            (None, None, "Missing ANTHROPIC_VERTEX_PROJECT_ID"),
        ]
        
        for project_id, region, expected_error in test_cases:
            result = validate_vertex_config(project_id, region)
            assert result is not None, f"Should fail for {project_id}, {region}"
            assert expected_error in result, f"Error should contain '{expected_error}' for {project_id}, {region}"
    
    def test_validate_vertex_config_invalid_project_id_formats(self):
        """Test validation with invalid project ID formats"""
        invalid_project_ids = [
            ("Test-Project", "contains uppercase"),
            ("ab", "too short (minimum 6 characters)"),
            ("project_with_underscores", "contains underscores"),
            ("project-with-special-chars!", "contains special characters"),
            ("a" * 31, "too long (maximum 30 characters)"),
            ("123-start-with-number", "starts with number"),
            ("project-end-with-hyphen-", "ends with hyphen"),
            ("-start-with-hyphen", "starts with hyphen"),
        ]
        
        for invalid_id, reason in invalid_project_ids:
            result = validate_vertex_config(invalid_id, "us-east5")
            assert result is not None, f"Should fail for project ID: {invalid_id} ({reason})"
            assert "Invalid project ID format" in result, f"Should mention invalid format for {invalid_id}"
    
    def test_validate_vertex_config_invalid_region_formats(self):
        """Test validation with invalid region formats"""
        invalid_regions = [
            ("us_east5", "contains underscores"),
            ("us-east", "missing number"),
            ("useast5", "missing hyphen"),
            ("US-EAST5", "uppercase letters"),
            ("invalid-region-name", "invalid format"),
            ("123-invalid", "starts with number"),
            ("us-", "incomplete"),
        ]
        
        for invalid_region, reason in invalid_regions:
            result = validate_vertex_config("test-project-123", invalid_region)
            assert result is not None, f"Should fail for region: {invalid_region} ({reason})"
            assert "Invalid region format" in result, f"Should mention invalid format for {invalid_region}"
            
        # Test empty string separately since it gives a different error
        result = validate_vertex_config("test-project-123", "")
        assert result is not None
        assert "Missing CLOUD_ML_REGION" in result
    
    def test_validate_vertex_config_unsupported_regions(self):
        """Test validation with regions that may not support Claude models"""
        # Test with a fictional region that follows the format but isn't in our supported list
        result = validate_vertex_config("test-project-123", "mars-base1")
        assert result is not None
        assert "may not support Claude models" in result
        assert "Supported regions:" in result


class TestModelValidation:
    """Test model name validation"""
    
    def test_validate_model_name_all_supported_models(self):
        """Test validation with all supported model names"""
        for model in SUPPORTED_VERTEX_MODELS:
            result = validate_model_name(model)
            assert result is None, f"Supported model {model} should pass validation"
    
    def test_validate_model_name_none_and_empty_values(self):
        """Test validation with None, empty, and whitespace model names"""
        test_cases = [
            (None, "Model name cannot be empty or None"),
            ("", "Model name cannot be empty or None"),
            ("   ", "Model name cannot be empty or whitespace"),
            ("\t\n", "Model name cannot be empty or whitespace"),
        ]
        
        for model, expected_error in test_cases:
            result = validate_model_name(model)
            assert result is not None, f"Should fail for model: {repr(model)}"
            assert expected_error in result, f"Error should contain '{expected_error}' for {repr(model)}"
    
    def test_validate_model_name_unsupported_models(self):
        """Test validation with unsupported model names"""
        unsupported_models = [
            "gpt-4",
            "gpt-3.5-turbo", 
            "claude-2",
            "claude-instant",
            "palm-2",
            "gemini-pro",
            "invalid-model-name",
        ]
        
        for model in unsupported_models:
            result = validate_model_name(model)
            assert result is not None, f"Unsupported model {model} should fail validation"
            assert "is not supported on Vertex AI" in result
            assert "Supported models:" in result


class TestModelListCompleteness:
    """Test that our supported models list is reasonable"""
    
    def test_supported_models_not_empty(self):
        """Test that we have at least some supported models"""
        assert len(SUPPORTED_VERTEX_MODELS) > 0, "Should have at least one supported model"
    
    def test_supported_models_format(self):
        """Test that all supported models follow expected format"""
        for model in SUPPORTED_VERTEX_MODELS:
            assert isinstance(model, str), f"Model {model} should be a string"
            assert len(model) > 0, f"Model {model} should not be empty"
            # Most Vertex AI Claude models follow the pattern: claude-*@YYYYMMDD
            assert "@" in model, f"Model {model} should contain version separator '@'"
    
    def test_has_expected_claude_models(self):
        """Test that we include the main Claude models"""
        expected_model_families = ["claude-3-5-haiku", "claude-3-5-sonnet", "claude-sonnet-4"]
        
        for family in expected_model_families:
            matching_models = [m for m in SUPPORTED_VERTEX_MODELS if family in m]
            assert len(matching_models) > 0, f"Should have at least one model from {family} family"


class TestValidationEdgeCases:
    """Test edge cases and boundary conditions"""
    
    def test_project_id_boundary_lengths(self):
        """Test project IDs at minimum and maximum allowed lengths"""
        # Test minimum length (6 characters)
        min_valid = "a" + "b" * 4 + "c"  # 6 chars: abbbbc
        result = validate_vertex_config(min_valid, "us-east5")
        assert result is None, "6-character project ID should be valid"
        
        # Test maximum length (30 characters) 
        max_valid = "a" + "b" * 28 + "c"  # 30 chars
        result = validate_vertex_config(max_valid, "us-east5")
        assert result is None, "30-character project ID should be valid"
        
        # Test just under minimum (5 characters)
        too_short = "a" + "b" * 3 + "c"  # 5 chars
        result = validate_vertex_config(too_short, "us-east5")
        assert result is not None, "5-character project ID should be invalid"
        
        # Test just over maximum (31 characters)
        too_long = "a" + "b" * 29 + "c"  # 31 chars
        result = validate_vertex_config(too_long, "us-east5")
        assert result is not None, "31-character project ID should be invalid"
    
    def test_region_format_variations(self):
        """Test various region format edge cases"""
        # Only test regions that are actually in our supported list
        supported_regions = [
            "us-east5", 
            "us-central1",
            "us-west1",
            "us-west4",
            "europe-west1",
            "europe-west4",
            "asia-southeast1",
        ]
        
        for region in supported_regions:
            result = validate_vertex_config("test-project-123", region)
            assert result is None, f"Region {region} should be valid"
            
        # Test a region with correct format but not in supported list
        result = validate_vertex_config("test-project-123", "us-east1")
        assert result is not None
        assert "may not support Claude models" in result
    
    def test_case_sensitivity(self):
        """Test that validation is case-sensitive"""
        # Project IDs must be lowercase
        result = validate_vertex_config("Test-Project-123", "us-east5")
        assert result is not None, "Project ID with uppercase should be invalid"
        
        # Regions must be lowercase
        result = validate_vertex_config("test-project-123", "US-EAST5")
        assert result is not None, "Region with uppercase should be invalid"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])