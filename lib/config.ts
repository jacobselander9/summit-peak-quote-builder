// App-wide settings. The Claude model lives here and only here.

/** Model used to read the tech's notes. */
export const CLAUDE_MODEL = "claude-opus-5-5";

/**
 * How hard the model thinks. "low" is fastest, "high" most careful.
 * Reading notes is a short extraction job, so "medium" is a good balance.
 */
export const CLAUDE_EFFORT = "medium" as const;
