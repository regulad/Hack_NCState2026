# LLM Prompt Library

## Project: Deporia

### 1. AI Content Detection Prompt

**Purpose:** Detect AI-generated web content.

**System Prompt:**
You are an AI content analysis assistant...

**User Prompt Template:**
Analyze the following webpage content and determine if it appears AI-generated:
{{content}}

**Output Format:**
- Confidence score (0–1)
- Explanation