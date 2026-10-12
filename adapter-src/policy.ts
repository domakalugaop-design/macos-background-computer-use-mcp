import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const SAFE_TOOLS = new Set([
  "list_apps",
  "list_windows",
  "get_app_state",
  "click",
  "set_value",
  "health_report",
  "background_type_text_strict",
  "background_focus_field_strict",
]);

export const TOOL_ALLOWED_PARAMS: Record<string, Set<string>> = {
  list_apps: new Set(),
  list_windows: new Set(["app"]),
  get_app_state: new Set(["app", "window_title", "scope_element_id", "max_elements", "skeleton"]),
  click: new Set(["app", "element_id"]),
  set_value: new Set(["app", "element_id", "value"]),
  health_report: new Set(),
  background_type_text_strict: new Set(["app", "target_pid", "element_id", "text", "confirm"]),
  background_focus_field_strict: new Set(["app", "target_pid", "element_id", "ax_identifier", "confirm"]),
};

const TOOL_REQUIRED_PARAMS: Record<string, Set<string>> = {
  list_apps: new Set(),
  list_windows: new Set(["app"]),
  get_app_state: new Set(["app"]),
  click: new Set(["app", "element_id"]),
  set_value: new Set(["app", "element_id", "value"]),
  health_report: new Set(),
  background_type_text_strict: new Set(["app", "target_pid", "element_id", "text"]),
  background_focus_field_strict: new Set(["app", "target_pid", "element_id", "ax_identifier"]),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return a model-facing schema containing only the arguments the adapter enforces. */
export function sanitizeToolSchema(tool: Tool): Tool | null {
  if (!SAFE_TOOLS.has(tool.name) || !isRecord(tool.inputSchema)) return null;
  const sourceProperties = tool.inputSchema.properties;
  const properties = isRecord(sourceProperties) ? sourceProperties : {};
  const allowed = TOOL_ALLOWED_PARAMS[tool.name] ?? new Set<string>();
  const required = TOOL_REQUIRED_PARAMS[tool.name] ?? new Set<string>();
  const filteredProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowed.has(key)),
  );
  return {
    ...tool,
    ...(tool.name === "click" ? {
      description: "Press a current labeled accessibility element through its own AXPress action. No coordinates, focus changes, or fallback input are available.",
    } : {}),
    inputSchema: {
      ...tool.inputSchema,
      properties: filteredProperties,
      required: [...required],
      additionalProperties: false,
    },
  };
}

/** Validate every argument before it crosses the adapter/upstream boundary. */
export function validateToolArguments(
  name: string,
  value: unknown,
): { args?: Record<string, unknown>; error?: string } {
  if (!SAFE_TOOLS.has(name)) return { error: `Tool '${name}' is not available in background-only mode.` };
  if (!isRecord(value)) return { error: "Tool arguments must be an object." };
  const allowed = TOOL_ALLOWED_PARAMS[name] ?? new Set<string>();
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return { error: `Parameter '${key}' is not allowed for tool '${name}'.` };
  }
  const required = TOOL_REQUIRED_PARAMS[name] ?? new Set<string>();
  for (const key of required) {
    if (!(key in value)) return { error: `Parameter '${key}' is required for tool '${name}'.` };
  }
  if (value.app !== undefined && (typeof value.app !== "string" || value.app.length === 0)) {
    return { error: "app must be a non-empty string." };
  }
  if (typeof value.app === "string" && value.app.length > 512) return { error: "App identifier is too long." };
  if ((name === "get_app_state" || name === "click" || name === "set_value") && typeof value.app !== "string") {
    return { error: "app must be a string." };
  }
  if (typeof value.window_title === "string" && value.window_title.length > 1024) return { error: "Window title is too long." };
  if (value.window_title !== undefined && typeof value.window_title !== "string") return { error: "window_title must be a string." };
  if (typeof value.scope_element_id === "string" && value.scope_element_id.length > 256) return { error: "Element identifier is too long." };
  if (value.scope_element_id !== undefined && typeof value.scope_element_id !== "string") return { error: "scope_element_id must be a string." };
  if (value.max_elements !== undefined &&
      (typeof value.max_elements !== "number" || !Number.isInteger(value.max_elements) || value.max_elements < 1 || value.max_elements > 5000)) {
    return { error: "max_elements must be an integer from 1 to 5000." };
  }
  if (value.skeleton !== undefined && typeof value.skeleton !== "boolean") return { error: "skeleton must be a boolean." };
  if (name === "click" || name === "set_value" || name === "background_type_text_strict" || name === "background_focus_field_strict") {
    if (typeof value.element_id !== "string" || !/^e(?:0|[1-9][0-9]*)@s[1-9][0-9]*$/.test(value.element_id)) {
      return { error: "element_id must be a current accessibility id such as e12@s3." };
    }
  }
  if (name === "background_type_text_strict") {
    if (typeof value.target_pid !== "number" || !Number.isInteger(value.target_pid) || value.target_pid < 1) {
      return { error: "target_pid must be a positive integer." };
    }
    if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > 80) {
      return { error: "text must be a non-empty string of at most 80 characters." };
    }
    if (value.confirm !== undefined && typeof value.confirm !== "boolean") {
      return { error: "confirm must be boolean when provided." };
    }
  }
  if (name === "background_focus_field_strict") {
    if (typeof value.target_pid !== "number" || !Number.isInteger(value.target_pid) || value.target_pid < 1) {
      return { error: "target_pid must be a positive integer." };
    }
    if (typeof value.ax_identifier !== "string" || value.ax_identifier.length === 0 || value.ax_identifier.length > 256) {
      return { error: "ax_identifier must be a non-empty string of at most 256 characters." };
    }
    if (value.confirm !== undefined && typeof value.confirm !== "boolean") {
      return { error: "confirm must be boolean when provided." };
    }
  }
  if (name === "set_value") {
    if (typeof value.value !== "string" || Buffer.byteLength(value.value, "utf8") > 4096) {
      return { error: "value must be a string of at most 4096 UTF-8 bytes." };
    }
  }
  return { args: value };
}

/** Override optional upstream output controls so the adapter cannot capture pixels or echo changed UI state. */
export function upstreamArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "click":
      return { app: args.app, element_id: args.element_id };
    case "get_app_state":
      return { ...args, include_screenshot: false, ocr: false };
    case "set_value":
      return { ...args, include_screenshot: false, include_state: false };
    case "health_report":
      return { probe_capture_service: false };
    case "background_type_text_strict":
      return { app: args.app, target_pid: args.target_pid, element_id: args.element_id, text: args.text, ...(args.confirm === undefined ? {} : { confirm: args.confirm }) };
    case "background_focus_field_strict":
      return { app: args.app, target_pid: args.target_pid, element_id: args.element_id, ax_identifier: args.ax_identifier, ...(args.confirm === undefined ? {} : { confirm: args.confirm }) };
    default:
      return args;
  }
}
