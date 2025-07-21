import { join } from "node:path";
import type { Config, GeneratedOutput, ParsedRule } from "../../types/index.js";
import { loadIgnorePatterns } from "../../utils/ignore.js";
import { generateIgnoreFile } from "./shared-helpers.js";

export async function generateCursorConfig(
  rules: ParsedRule[],
  config: Config,
  baseDir?: string,
): Promise<GeneratedOutput[]> {
  const outputs: GeneratedOutput[] = [];

  // Generate rule files
  for (const rule of rules) {
    const content = generateCursorMarkdown(rule);
    const outputDir = baseDir
      ? join(baseDir, config.outputPaths.cursor)
      : config.outputPaths.cursor;
    const filepath = join(outputDir, `${rule.filename}.mdc`);

    outputs.push({
      tool: "cursor",
      filepath,
      content,
    });
  }

  // Generate .cursorignore if .rulesyncignore exists
  const ignorePatterns = await loadIgnorePatterns(baseDir);
  if (ignorePatterns.patterns.length > 0) {
    const cursorIgnorePath = baseDir ? join(baseDir, ".cursorignore") : ".cursorignore";

    const cursorIgnoreContent = generateIgnoreFile(ignorePatterns.patterns, "cursor");

    outputs.push({
      tool: "cursor",
      filepath: cursorIgnorePath,
      content: cursorIgnoreContent,
    });
  }

  return outputs;
}

function generateCursorMarkdown(rule: ParsedRule): string {
  const lines: string[] = [];

  // Determine rule type based on four kinds of .mdc files
  const ruleType = determineCursorRuleType(rule.frontmatter);

  // Add MDC header for Cursor
  lines.push("---");

  switch (ruleType) {
    case "always":
      // 1. always: description and globs are empty, alwaysApply: true
      lines.push("description:");
      lines.push("globs:");
      lines.push("alwaysApply: true");
      break;

    case "manual":
      // 2. manual: keep original empty values, alwaysApply: false
      lines.push("description:");
      lines.push("globs:");
      lines.push("alwaysApply: false");
      break;

    case "specificFiles":
      // 3. specificFiles: empty description, globs from original (comma-separated), alwaysApply: false
      lines.push("description:");
      lines.push(`globs: ${rule.frontmatter.globs.join(",")}`);
      lines.push("alwaysApply: false");
      break;

    case "intelligently":
      // 4. intelligently: description from original, empty globs, alwaysApply: false
      lines.push(`description: ${rule.frontmatter.description}`);
      lines.push("globs:");
      lines.push("alwaysApply: false");
      break;
  }

  lines.push("---");
  lines.push("");
  lines.push(rule.content);

  return lines.join("\n");
}

/**
 * Determine Cursor rule type
 * Order of checking: 1. always → 2. manual → 3. specificFiles → 4. intelligently
 * If cursorRuleType is explicitly specified, use that; otherwise use fallback logic
 */
function determineCursorRuleType(
  frontmatter: import("../../types/index.js").RuleFrontmatter,
): string {
  // If cursorRuleType is explicitly specified, use it
  if (frontmatter.cursorRuleType) {
    return frontmatter.cursorRuleType;
  }

  // Fallback logic when cursorRuleType is not specified (section 5 of specification)
  const isDescriptionEmpty = !frontmatter.description || frontmatter.description.trim() === "";
  const isGlobsEmpty = frontmatter.globs.length === 0;
  const isGlobsExactlyAllFiles = frontmatter.globs.length === 1 && frontmatter.globs[0] === "**/*";

  // 1. always: globs is exactly ["**/*"]
  if (isGlobsExactlyAllFiles) {
    return "always";
  }

  // 2. manual: description is empty/undefined AND globs is empty/undefined
  if (isDescriptionEmpty && isGlobsEmpty) {
    return "manual";
  }

  // 3. specificFiles: description is empty/undefined AND globs is non-empty (but not ["**/*"])
  if (isDescriptionEmpty && !isGlobsEmpty) {
    return "specificFiles";
  }

  // 4. intelligently: description is non-empty AND globs is empty/undefined
  if (!isDescriptionEmpty && isGlobsEmpty) {
    return "intelligently";
  }

  // Edge case: description is non-empty AND globs is non-empty (but not ["**/*"])
  // According to specification order, this should be treated as "intelligently"
  // because it doesn't match 1, 2, or 3, so it falls to 4
  return "intelligently";
}
