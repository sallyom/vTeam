"""
Cost tracking and optimization for AI API usage
"""

import time
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, Optional

import tiktoken
from data.rfe_models import AgentRole


@dataclass
class APIUsage:
    """Track individual API call usage"""

    timestamp: datetime
    agent_role: str
    task: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_estimate: float
    response_time: float
    rfe_id: Optional[str] = None


class CostTracker:
    """Track and optimize AI API costs"""

    # Anthropic Claude pricing (as of 2024 - update as needed)
    CLAUDE_PRICING = {
        "claude-3-haiku": {"input": 0.00025, "output": 0.00125},  # per 1K tokens
        "claude-3-sonnet": {"input": 0.003, "output": 0.015},
        "claude-3-opus": {"input": 0.015, "output": 0.075},
    }

    def __init__(self, model_name: str = "claude-3-haiku"):
        self.model_name = model_name
        self.usage_log = []
        self.cache = {}  # Simple response cache
        self.tokenizer = tiktoken.get_encoding("cl100k_base")  # Approximate

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken (approximate for Claude)"""
        return len(self.tokenizer.encode(text))

    def estimate_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Estimate cost based on token usage"""
        if self.model_name not in self.CLAUDE_PRICING:
            return 0.0  # Unknown model

        pricing = self.CLAUDE_PRICING[self.model_name]
        input_cost = (prompt_tokens / 1000) * pricing["input"]
        output_cost = (completion_tokens / 1000) * pricing["output"]
        return input_cost + output_cost

    def check_cache(self, cache_key: str) -> Optional[Any]:
        """Check if response is cached to avoid API call"""
        return self.cache.get(cache_key)

    def cache_response(self, cache_key: str, response: Any, ttl_seconds: int = 3600):
        """Cache response with optional TTL"""
        self.cache[cache_key] = {
            "response": response,
            "timestamp": time.time(),
            "ttl": ttl_seconds,
        }

        # Simple cache cleanup - remove expired entries
        current_time = time.time()
        expired_keys = [
            key
            for key, value in self.cache.items()
            if current_time - value["timestamp"] > value["ttl"]
        ]
        for key in expired_keys:
            del self.cache[key]

    def generate_cache_key(
        self, agent: AgentRole, task: str, context: Dict[str, Any]
    ) -> str:
        """Generate cache key for identical requests"""
        # Create deterministic key from agent, task, and key context elements
        key_elements = [
            agent.value,
            task,
            str(sorted(context.items())),  # Ensure consistent ordering
        ]
        return "|".join(key_elements)

    def log_usage(
        self,
        agent_role: AgentRole,
        task: str,
        prompt_tokens: int,
        completion_tokens: int,
        response_time: float,
        rfe_id: Optional[str] = None,
    ) -> APIUsage:
        """Log API usage for cost tracking"""

        total_tokens = prompt_tokens + completion_tokens
        cost_estimate = self.estimate_cost(prompt_tokens, completion_tokens)

        usage = APIUsage(
            timestamp=datetime.now(),
            agent_role=agent_role.value,
            task=task,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_estimate=cost_estimate,
            response_time=response_time,
            rfe_id=rfe_id,
        )

        self.usage_log.append(usage)
        return usage

    def get_usage_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Get usage summary for the last N hours"""
        cutoff_time = datetime.now().timestamp() - (hours * 3600)
        recent_usage = [
            usage
            for usage in self.usage_log
            if usage.timestamp.timestamp() > cutoff_time
        ]

        if not recent_usage:
            return {"total_calls": 0, "total_cost": 0.0, "total_tokens": 0}

        summary = {
            "total_calls": len(recent_usage),
            "total_cost": sum(usage.cost_estimate for usage in recent_usage),
            "total_tokens": sum(usage.total_tokens for usage in recent_usage),
            "avg_response_time": sum(usage.response_time for usage in recent_usage)
            / len(recent_usage),
            "by_agent": {},
            "by_task": {},
        }

        # Group by agent
        for usage in recent_usage:
            agent = usage.agent_role
            if agent not in summary["by_agent"]:
                summary["by_agent"][agent] = {"calls": 0, "cost": 0.0, "tokens": 0}
            summary["by_agent"][agent]["calls"] += 1
            summary["by_agent"][agent]["cost"] += usage.cost_estimate
            summary["by_agent"][agent]["tokens"] += usage.total_tokens

        # Group by task
        for usage in recent_usage:
            task = usage.task
            if task not in summary["by_task"]:
                summary["by_task"][task] = {"calls": 0, "cost": 0.0, "tokens": 0}
            summary["by_task"][task]["calls"] += 1
            summary["by_task"][task]["cost"] += usage.cost_estimate
            summary["by_task"][task]["tokens"] += usage.total_tokens

        return summary

    def optimize_prompt(self, prompt: str, max_tokens: int = 4000) -> str:
        """
        Optimize prompt for cost by truncating if necessary
        Keep the most important parts (system message + recent context)
        """
        token_count = self.count_tokens(prompt)

        if token_count <= max_tokens:
            return prompt

        # Simple optimization: truncate middle, keep beginning and end
        lines = prompt.split("\n")
        if len(lines) <= 3:
            # If very few lines, just truncate
            tokens_per_char = token_count / len(prompt)
            target_chars = int(max_tokens / tokens_per_char * 0.9)  # 90% safety margin
            return prompt[:target_chars] + "...[truncated for cost optimization]"

        # Keep first few and last few lines, truncate middle
        keep_start = len(lines) // 4
        keep_end = len(lines) // 4

        optimized_lines = (
            lines[:keep_start]
            + ["...[content truncated for cost optimization]..."]
            + lines[-keep_end:]
        )

        return "\n".join(optimized_lines)

    def export_usage_data(self) -> list:
        """Export usage data for analysis"""
        return [asdict(usage) for usage in self.usage_log]
