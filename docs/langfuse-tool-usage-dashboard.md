# Langfuse Tool Usage Dashboard Guide

This guide explains how to create custom dashboards in Langfuse to track tool usage statistics.

## Prerequisites

- Langfuse instance with tool observations being tracked
- Tool spans tagged with `tool:{tool_name}` and metadata `tool_id`, `tool_name`

## Creating a Tool Usage Dashboard

### 1. Access Custom Dashboards

1. Log into Langfuse UI
2. Navigate to **Dashboards** in the left sidebar
3. Click **"New Dashboard"** or **"Create Dashboard"**
4. Name it: "Tool Usage Analytics"

### 2. Add Visualization Widgets

#### Widget: Most Frequently Used Tools

**Configuration:**
- **Chart Type**: Bar Chart (Horizontal)
- **Data Source**: Observations
- **Filters**:
  - `name` starts with `tool_` OR
  - `tags` contains `tool:*` (if using wildcard filtering)
- **Group By**: `metadata.tool_name`
- **Metric**: Count
- **Sort**: Descending by count
- **Limit**: Top 10 or 20

**What it shows**: Which tools are being called most frequently

---

#### Widget: Tool Error Rate Analysis

**Configuration:**
- **Chart Type**: Pivot Table
- **Data Source**: Observations
- **Filters**: Same as above (tool observations only)
- **Rows**: `metadata.tool_name`
- **Columns**: `level` (ERROR, DEFAULT)
- **Metric**: Count
- **Additional Calculated Field**: Error percentage

**What it shows**: Success vs error counts for each tool type

---

#### Widget: Tool Usage Over Time

**Configuration:**
- **Chart Type**: Line Chart or Time Series
- **Data Source**: Observations
- **Filters**: Tool observations
- **Group By**:
  - Time bucket (hourly, daily, weekly)
  - `metadata.tool_name` (for multiple lines)
- **Metric**: Count
- **Time Range**: Last 7 days (or custom)

**What it shows**: Trends in tool usage over time

---

#### Widget: Tool Distribution (Pie Chart)

**Configuration:**
- **Chart Type**: Pie Chart or Donut Chart
- **Data Source**: Observations
- **Filters**: Tool observations
- **Group By**: `metadata.tool_name`
- **Metric**: Count (percentage)

**What it shows**: Percentage breakdown of tool usage

---

#### Widget: Slowest Tools (by duration)

**Configuration:**
- **Chart Type**: Bar Chart
- **Data Source**: Observations
- **Filters**: Tool observations
- **Group By**: `metadata.tool_name`
- **Metric**: Average or P95 of `duration_ms`
- **Sort**: Descending by duration

**What it shows**: Which tools take the longest to execute

---

## Alternative: Using Tags for Filtering

If you want to analyze a specific tool type:

1. Create a widget with filter: `tags` contains `tool:Read`
2. This will show only Read tool observations
3. Duplicate and modify for other tools (Bash, Write, etc.)

## Programmatic Access via Metrics API

For custom analysis beyond UI dashboards, use the Langfuse Metrics API:

```python
from langfuse import Langfuse

client = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST")
)

# Query tool usage metrics
# Note: Exact API depends on Langfuse version, see docs
# https://langfuse.com/changelog/2025-05-12-custom-metrics-api
```

## Filtering in Observations View

Quick ad-hoc analysis without creating dashboards:

1. Go to **Observations** view
2. Add metadata filter: `tool_name` EXISTS (or specific value)
3. Add tag filter: `tool:Read`, `tool:Bash`, etc.
4. Sort by timestamp, duration, or level
5. Export results if needed

## Tips

- **Use wildcards**: If Langfuse supports wildcard filtering, use `tool:*` to match all tool tags
- **Combine filters**: Use both metadata and tags for robust filtering
- **Time-based analysis**: Compare weekday vs weekend tool usage
- **Session-based**: Group by `session_id` to see tool usage per session
- **User-based**: Group by `user_id` to see which users use which tools most

## Resources

- [Langfuse Custom Dashboards Documentation](https://langfuse.com/docs/metrics/features/custom-dashboards)
- [Metrics API Changelog](https://langfuse.com/changelog/2025-05-12-custom-metrics-api)
- [Pivot Tables Feature](https://langfuse.com/changelog/2025-07-01-pivot-tables-custom-dashboards)
- [Histogram Charts](https://langfuse.com/changelog/2025-06-30-histogram-charts-custom-dashboards)

## Example Dashboard Layout

```
+----------------------------------+----------------------------------+
|  Most Frequently Used Tools      |  Tool Usage Over Time           |
|  (Bar Chart)                     |  (Line Chart)                   |
+----------------------------------+----------------------------------+
|  Tool Error Rates                |  Tool Distribution              |
|  (Pivot Table)                   |  (Pie Chart)                    |
+----------------------------------+----------------------------------+
|  Average Tool Duration           |  Recent Tool Errors             |
|  (Bar Chart)                     |  (Table)                        |
+----------------------------------+----------------------------------+
```

## Troubleshooting

**Issue**: No observations showing up when filtering by `tool_name`

**Solution**:
- Verify tool observations have `metadata.tool_name` field
- Check if using correct filter syntax (exact match vs contains)
- Try filtering by tags instead: `tool:*`

**Issue**: Cost/usage data not showing for tool observations

**Solution**:
- Tool spans intentionally don't have usage data (to avoid inflation)
- Costs are tracked at the trace level (parent `claude_interaction`)
- To see costs, view the parent trace instead of individual tool observations
