/**
 * MCP server entry point — coming in v0.2.
 *
 * This will expose two MCP tools:
 *   - analyse_agent_file: Run agent-doctor on an instruction file
 *   - suggest_fix: Get a concrete fix for a specific issue
 *
 * To use agent-doctor from Claude Code today, run:
 *   npx agent-doctor <file>
 */
process.stderr.write('MCP server mode is coming in v0.2.\n');
process.exit(0);
