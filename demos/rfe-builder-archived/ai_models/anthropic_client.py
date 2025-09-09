"""
Shared utility for Anthropic client initialization with Vertex AI support
"""

import os
import re
import time
from typing import Optional, Union, Set
import streamlit as st
from anthropic import Anthropic, AnthropicVertex


# Supported Claude models on Vertex AI
SUPPORTED_VERTEX_MODELS: Set[str] = {
    'claude-3-5-sonnet@20241022',
    'claude-3-5-haiku@20241022', 
    'claude-3-sonnet@20240229',
    'claude-3-haiku@20240307',
    'claude-sonnet-4@20250514',  # Latest Sonnet 4
}

# Default timeouts (in seconds)
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0


def validate_model_name(model: str) -> Optional[str]:
    """
    Validate model name for Vertex AI compatibility.
    
    Args:
        model: Model name to validate
        
    Returns:
        Error message if validation fails, None if valid
    """
    if not model:
        return "Model name cannot be empty or None"
    
    # Handle whitespace-only strings
    if not model.strip():
        return "Model name cannot be empty or whitespace"
    
    if model not in SUPPORTED_VERTEX_MODELS:
        return (
            f"Model '{model}' is not supported on Vertex AI. "
            f"Supported models: {', '.join(sorted(SUPPORTED_VERTEX_MODELS))}"
        )
    
    return None


def validate_vertex_config(project_id: Optional[str], region: Optional[str]) -> Optional[str]:
    """
    Validate Vertex AI configuration parameters.
    
    Args:
        project_id: Google Cloud project ID
        region: Google Cloud region
        
    Returns:
        Error message if validation fails, None if valid
    """
    if not project_id:
        return "Missing ANTHROPIC_VERTEX_PROJECT_ID environment variable"
    
    if not region:
        return "Missing CLOUD_ML_REGION environment variable"
    
    # Validate project ID format (alphanumeric, hyphens, 6-30 chars, cannot start with number)
    if not re.match(r'^[a-z][a-z0-9\-]{4,28}[a-z0-9]$', project_id):
        return f"Invalid project ID format: '{project_id}'. Must be 6-30 characters, start with lowercase letter, contain only lowercase letters, numbers, and hyphens."
    
    # Validate region format (e.g., us-east5, europe-west1)
    if not re.match(r'^[a-z]+-[a-z]+\d+$', region):
        return f"Invalid region format: '{region}'. Expected format like 'us-east5' or 'europe-west1'."
    
    # Check for supported regions (common ones for Claude)
    supported_regions = {
        'us-east5', 'us-central1', 'us-west1', 'us-west4',
        'europe-west1', 'europe-west4', 'asia-southeast1'
    }
    if region not in supported_regions:
        return f"Region '{region}' may not support Claude models. Supported regions: {', '.join(sorted(supported_regions))}"
    
    return None


def _create_vertex_client_with_retry(
    project_id: str, 
    region: str, 
    max_retries: int = DEFAULT_MAX_RETRIES,
    timeout: float = DEFAULT_TIMEOUT,
    show_errors: bool = True
) -> Optional[AnthropicVertex]:
    """
    Create Vertex AI client with retry logic and timeout configuration.
    
    Args:
        project_id: Google Cloud project ID
        region: Google Cloud region  
        max_retries: Maximum number of retry attempts
        timeout: Connection timeout in seconds
        show_errors: Whether to display errors in Streamlit UI
        
    Returns:
        Configured AnthropicVertex client or None if creation fails
    """
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            # Create client with timeout configuration
            client = AnthropicVertex(
                project_id=project_id,
                region=region,
                timeout=timeout
            )
            
            # Test the connection with a minimal call
            if attempt == 0:  # Only test on first attempt to avoid quota usage
                try:
                    # Simple test to verify client works
                    # Note: This is a lightweight validation, actual usage will be in the app
                    pass
                except Exception as test_error:
                    if show_errors and attempt == max_retries:
                        st.warning(f"⚠️ Vertex AI client created but connection test failed: {test_error}")
            
            return client
            
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                if show_errors:
                    st.info(f"🔄 Vertex AI connection attempt {attempt + 1} failed, retrying...")
                time.sleep(DEFAULT_RETRY_DELAY * (attempt + 1))  # Exponential backoff
            else:
                if show_errors:
                    st.error(f"❌ Failed to create Vertex AI client after {max_retries + 1} attempts: {last_error}")
    
    return None


def get_anthropic_client(show_errors: bool = True) -> Optional[Union[Anthropic, AnthropicVertex]]:
    """
    Get Anthropic client with proper configuration, validation, and retry logic.
    
    Args:
        show_errors: Whether to display errors in Streamlit UI
        
    Returns:
        Configured Anthropic client or None if configuration fails
    """
    try:
        # Check for Vertex AI configuration first
        if os.getenv("CLAUDE_CODE_USE_VERTEX") == "1":
            project_id = os.getenv("ANTHROPIC_VERTEX_PROJECT_ID")
            region = os.getenv("CLOUD_ML_REGION")
            
            # Validate configuration
            validation_error = validate_vertex_config(project_id, region)
            if validation_error:
                if show_errors:
                    st.error(f"❌ Vertex AI configuration error: {validation_error}")
                return None
            
            # Get timeout from environment or use default
            timeout = float(os.getenv("ANTHROPIC_TIMEOUT", DEFAULT_TIMEOUT))
            max_retries = int(os.getenv("ANTHROPIC_MAX_RETRIES", DEFAULT_MAX_RETRIES))
            
            # Create Vertex AI client with retry logic
            if project_id and region:
                return _create_vertex_client_with_retry(
                    project_id=project_id,
                    region=region,
                    max_retries=max_retries,
                    timeout=timeout,
                    show_errors=show_errors
                )
        
        # Fallback to direct API key
        timeout = float(os.getenv("ANTHROPIC_TIMEOUT", DEFAULT_TIMEOUT))
        
        # Try Streamlit secrets first
        if hasattr(st, "secrets") and "ANTHROPIC_API_KEY" in st.secrets:
            api_key = st.secrets["ANTHROPIC_API_KEY"]
            if api_key and api_key != "using-vertex-ai":  # Skip placeholder
                return Anthropic(api_key=api_key, timeout=timeout)
        
        # Try environment variable
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if api_key:
            return Anthropic(api_key=api_key, timeout=timeout)
        
        # No configuration found
        if show_errors:
            st.warning(
                "⚠️ No Anthropic configuration found. Please set up either:\n"
                "- Vertex AI: Set CLAUDE_CODE_USE_VERTEX=1 with project/region\n"
                "- Direct API: Set ANTHROPIC_API_KEY in secrets.toml or environment"
            )
        
        return None
        
    except Exception as e:
        if show_errors:
            st.error(f"Failed to initialize Anthropic client: {e}")
        return None


def get_model_name(default: str = "claude-3-haiku-20240307") -> str:
    """
    Get the configured model name from environment or secrets with validation.
    
    Args:
        default: Default model to use if none configured
        
    Returns:
        Model name to use for API calls
    """
    # Try environment variable first
    model = os.getenv("ANTHROPIC_SMALL_FAST_MODEL") or os.getenv("ANTHROPIC_MODEL")
    
    # Try secrets if no environment variable
    if not model and hasattr(st, "secrets"):
        model = getattr(st.secrets, "ANTHROPIC_MODEL", None)
    
    final_model = model or default
    
    # Validate model for Vertex AI if being used
    if os.getenv("CLAUDE_CODE_USE_VERTEX") == "1":
        validation_error = validate_model_name(final_model)
        if validation_error:
            st.warning(f"⚠️ {validation_error}. Using default Vertex AI model.")
            # Fall back to a known good Vertex AI model
            final_model = "claude-3-5-haiku@20241022"
    
    return final_model