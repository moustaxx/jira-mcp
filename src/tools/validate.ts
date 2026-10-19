// Minimal check of tool arguments against the JSON schemas used by the tools: the low-level MCP
// Server does not validate `arguments`, so a missing or mistyped value would otherwise reach Jira.
interface PropSchema {
  type?: "string" | "number" | "array" | "object";
  enum?: unknown[];
  items?: PropSchema;
}

interface ObjectSchema {
  properties?: Record<string, PropSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

function typeOk(type: PropSchema["type"], v: unknown): boolean {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "array":
      return Array.isArray(v);
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
    default:
      return true;
  }
}

export function validateArgs(schema: object, args: Record<string, unknown>): void {
  const { properties = {}, required = [], additionalProperties } = schema as ObjectSchema;
  for (const name of required) {
    if (args[name] === undefined || args[name] === null) {
      throw new Error(`Missing required argument \`${name}\`.`);
    }
  }
  for (const [name, value] of Object.entries(args)) {
    const prop = properties[name];
    if (!prop) {
      if (additionalProperties === false) throw new Error(`Unknown argument \`${name}\`.`);
      continue;
    }
    if (value === undefined) continue;
    if (!typeOk(prop.type, value)) throw new Error(`Argument \`${name}\` must be a ${prop.type}.`);
    if (prop.enum && !prop.enum.includes(value)) {
      throw new Error(`Argument \`${name}\` must be one of: ${prop.enum.join(", ")}.`);
    }
    if (prop.type === "array" && prop.items?.type) {
      const itemType = prop.items.type;
      if (!(value as unknown[]).every((item) => typeOk(itemType, item))) {
        throw new Error(`Argument \`${name}\` must be an array of ${itemType}s.`);
      }
    }
  }
}