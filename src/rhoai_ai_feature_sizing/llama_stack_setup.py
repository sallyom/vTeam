import os
from llama_stack_client import LlamaStackClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

LLAMA_STACK_URL = os.getenv("LLAMA_STACK_URL")
MCP_ATLASSIAN_URL = os.getenv("MCP_ATLASSIAN_URL")
CONFIGURE_TOOLGROUPS = os.getenv("CONFIGURE_TOOLGROUPS", "false")


def get_llama_stack_client():
    """
    Get a client connected to the Llama Stack server.

    This connects to a running Llama Stack server that handles all provider
    and toolgroup configuration via run.yaml. The setup is K8s-ready.

    If DEV_MODE is false, the client will be created without toolgroup registration.
    """
    print(f"Creating client for {LLAMA_STACK_URL}")
    client = LlamaStackClient(base_url=LLAMA_STACK_URL)

    if CONFIGURE_TOOLGROUPS == "true":
        try:
            # First, try to unregister any existing toolgroup to clear old config
            try:
                client.toolgroups.unregister(toolgroup_id="mcp::atlassian")
                print("Unregistered existing mcp::atlassian toolgroup")
            except Exception as unregister_err:
                print(
                    f"No existing toolgroup to unregister (this is fine): {unregister_err}"
                )

            # Register the MCP Atlassian tool group with correct endpoint
            client.toolgroups.register(
                toolgroup_id="mcp::atlassian",
                provider_id="model-context-protocol",
                mcp_endpoint={"uri": MCP_ATLASSIAN_URL},
            )
            print("Toolgroup mcp::atlassian registered with correct endpoint")

        except Exception as e:
            print(f"Error registering toolgroup mcp::atlassian: {e}")
    return client
