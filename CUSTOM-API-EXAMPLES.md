# Custom API Examples for LLAMA Stack

This guide provides specific examples for connecting common hosted LLM APIs to LLAMA Stack on OpenShift.

## 🎯 Quick Reference

Most modern LLM APIs are **OpenAI-compatible**, meaning they can use the OpenAI provider with a custom `base_url`. Here are common patterns:

### API Compatibility Test

First, test if your API is OpenAI-compatible:

```bash
./test-api-compatibility.sh "https://your-api-endpoint.com"
```

## 📋 Common API Examples

### 1. Red Hat AI Services (RHOAI) Models

For APIs like your Mistral endpoint:
```
https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443
```

**Configuration:**
- **API Base URL**: `https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443`
- **API Key**: Usually not required for internal RHOAI services, or provided separately
- **Model Name**: `mistral-small` (for LLAMA Stack)
- **Model ID**: Often same as model name or `auto`

**Deploy Command:**
```bash
./deploy-to-openshift.sh custom
```

**Example Values During Deployment:**
```
API base URL: https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443
API key: [leave empty if not required]
Model name for LLAMA Stack: mistral-small
Actual model ID: mistral-small
```

### 2. Google Gemini via API

For company-hosted Gemini models:

**Configuration:**
- **API Base URL**: `https://your-gemini-proxy.company.com/v1`
- **API Key**: Your Gemini API key
- **Model Name**: `gemini-pro` (for LLAMA Stack)
- **Model ID**: `gemini-1.5-pro` (actual Gemini model ID)

### 3. Anthropic Claude via API Gateway

**Configuration:**
- **API Base URL**: `https://your-claude-gateway.company.com/v1`
- **API Key**: Your Claude API key
- **Model Name**: `claude-3-sonnet` (for LLAMA Stack)
- **Model ID**: `claude-3-sonnet-20240229`

### 4. Self-Hosted vLLM/TGI

For your own hosted inference servers:

**Configuration:**
- **API Base URL**: `https://your-vllm-server.company.com/v1`
- **API Key**: [usually not required]
- **Model Name**: `llama2-7b-chat` (for LLAMA Stack)
- **Model ID**: `meta-llama/Llama-2-7b-chat-hf`

### 5. Hugging Face Inference Endpoints

**Configuration:**
- **API Base URL**: `https://your-endpoint.endpoints.huggingface.cloud/v1`
- **API Key**: Your HF token
- **Model Name**: `custom-model` (for LLAMA Stack)
- **Model ID**: The model deployed on your endpoint

## 🔧 Manual Configuration

If you prefer manual configuration over the script:

### 1. Create Secrets

```bash
# For APIs with authentication
oc create secret generic llama-stack-secrets-custom \
  --from-literal=CUSTOM_API_BASE_URL="https://your-api.com" \
  --from-literal=CUSTOM_API_KEY="your-api-key" \
  --from-literal=CUSTOM_MODEL_NAME="your-model" \
  --from-literal=CUSTOM_MODEL_ID="actual-model-id" \
  -n llama-stack

# For APIs without authentication (remove API_KEY)
oc create secret generic llama-stack-secrets-custom \
  --from-literal=CUSTOM_API_BASE_URL="https://your-api.com" \
  --from-literal=CUSTOM_MODEL_NAME="your-model" \
  --from-literal=CUSTOM_MODEL_ID="actual-model-id" \
  -n llama-stack
```

### 2. Deploy Configuration

```bash
oc apply -f openshift-deployment-custom-api.yaml
```

## 🛠️ Advanced Configuration

### Custom Headers

Some APIs require custom headers. Edit the ConfigMap:

```yaml
providers:
  inference:
    - provider_id: custom-api
      provider_type: remote::openai
      config:
        api_key: ${env.CUSTOM_API_KEY}
        base_url: ${env.CUSTOM_API_BASE_URL}
        extra_headers:
          X-Custom-Header: ${env.CUSTOM_HEADER_VALUE}
          Authorization: "Bearer ${env.CUSTOM_API_KEY}"
```

### Multiple Models

To support multiple models from the same API:

```yaml
models:
  - metadata: {}
    model_id: model-1
    provider_id: custom-api
    provider_model_id: actual-model-1-id
    model_type: llm
  - metadata: {}
    model_id: model-2
    provider_id: custom-api
    provider_model_id: actual-model-2-id
    model_type: llm
```

### Custom Timeouts

For slower APIs, adjust timeouts:

```yaml
providers:
  inference:
    - provider_id: custom-api
      provider_type: remote::openai
      config:
        api_key: ${env.CUSTOM_API_KEY}
        base_url: ${env.CUSTOM_API_BASE_URL}
        timeout: 120  # 2 minutes
        max_retries: 3
```

## 🔍 Troubleshooting

### Common Issues

1. **404 Not Found**
   - Check if API URL includes `/v1` suffix
   - Try with and without `/v1`
   - Verify the full endpoint path

2. **Authentication Errors**
   - Verify API key format
   - Check if key should be in headers vs query params
   - Some APIs use different auth schemes

3. **Model Not Found**
   - List available models: `curl https://your-api.com/v1/models`
   - Use exact model ID from the API
   - Some APIs use different model naming

4. **Timeout Errors**
   - Increase timeout values
   - Check network connectivity
   - Monitor API response times

### Debug Mode

To enable debug logging, add to the deployment:

```yaml
env:
- name: LLAMA_STACK_LOG_LEVEL
  value: "DEBUG"
```

### Testing Your Configuration

Once deployed, test with:

```bash
# Get the route URL
ROUTE_URL=$(oc get route llama-stack-route-custom -n llama-stack -o jsonpath='{.spec.host}')

# Test health
curl http://$ROUTE_URL/v1/health

# Test models list
curl http://$ROUTE_URL/v1/models

# Test inference
curl -X POST http://$ROUTE_URL/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }'
```

## 📚 API Format Requirements

For an API to work with LLAMA Stack's OpenAI provider, it should support:

### Required Endpoints

1. **Models**: `GET /v1/models`
   ```json
   {
     "data": [
       {"id": "model-name", "object": "model"}
     ]
   }
   ```

2. **Chat Completions**: `POST /v1/chat/completions`
   ```json
   {
     "model": "model-name",
     "messages": [{"role": "user", "content": "Hello"}]
   }
   ```

### Response Format

Chat completions should return:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Response text"
      },
      "finish_reason": "stop"
    }
  ]
}
```

## 🤝 Getting Help

- **API not working?** Use the compatibility test script first
- **Authentication issues?** Check API documentation for auth format
- **Model errors?** Verify model names with the provider's model list
- **Performance issues?** Monitor logs and adjust timeouts

Most hosted LLM services that claim "OpenAI compatibility" should work with minimal configuration! 