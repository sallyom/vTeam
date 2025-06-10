from llama_stack_client import BadRequestError, LlamaStackClient

MCP_ATLASSIAN_URL = "http://localhost:9000/sse"
LLAMA_STACK_URL = "http://localhost:8321"


def get_llama_stack_client():
    client = LlamaStackClient(base_url=LLAMA_STACK_URL)
    try:
        tg = client.toolgroups.get(toolgroup_id="mcp::atlassian")
        if tg:
            print("Unregistering toolgroup mcp::atlassian")
            client.toolgroups.unregister(toolgroup_id="mcp::atlassian")
    except BadRequestError as e:
        print("Toolgroup mcp::atlassian not found, skipping unregister.")
    # Register the MCP Atlassian tool group only once
    client.toolgroups.register(
        toolgroup_id="mcp::atlassian",
        provider_id="model-context-protocol",
        mcp_endpoint={"uri": MCP_ATLASSIAN_URL},
    )
    print("Toolgroup mcp::atlassian registered")
    return client
