// Minimal JSON Schema subset validator and Gemini adapter for agent tool inputs. Pure, no dependencies.
import type { AgentToolDefinition, JsonSchema } from './types';

const typeOf = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;

/** Returns human-readable (Spanish) validation errors; an empty list means the value is valid. */
export function validateJsonSchema(schema: JsonSchema, value: unknown, path = 'entrada'): string[] {
  if (value === null || value === undefined) return schema.nullable ? [] : [`${path}: falta el valor.`];
  const actual = typeOf(value);
  if (schema.type) {
    const ok = schema.type === actual || (schema.type === 'number' && actual === 'integer');
    if (!ok) return [`${path}: se esperaba ${schema.type}.`];
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return [`${path}: número no válido.`];
  const errors: string[] = [];
  if (schema.enum && !schema.enum.includes(value as string | number)) errors.push(`${path}: valor no permitido.`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: mínimo ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: máximo ${schema.maximum}.`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: texto demasiado corto.`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: máximo ${schema.maxLength} caracteres.`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: máximo ${schema.maxItems} elementos.`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateJsonSchema(schema.items!, item, `${path}[${i}]`)));
  }
  if (actual === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of schema.required || []) if (record[key] === undefined) errors.push(`${path}.${key}: es obligatorio.`);
    for (const [key, child] of Object.entries(record)) {
      const childSchema = schema.properties?.[key];
      if (!childSchema) {
        if (schema.additionalProperties === false) errors.push(`${path}.${key}: campo no permitido.`);
        continue;
      }
      if (child === undefined) continue;
      errors.push(...validateJsonSchema(childSchema, child, `${path}.${key}`));
    }
  }
  return errors;
}

/** Gemini function declarations use an OpenAPI-like dialect with upper-case types and no additionalProperties. */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (schema.type) out.type = schema.type.toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum.map(String);
  if (schema.nullable) out.nullable = true;
  if (schema.minimum !== undefined) out.minimum = schema.minimum;
  if (schema.maximum !== undefined) out.maximum = schema.maximum;
  if (schema.maxItems !== undefined) out.maxItems = String(schema.maxItems);
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (schema.required?.length) out.required = [...schema.required];
  }
  return out;
}

export function toGeminiFunctionDeclarations(definitions: readonly AgentToolDefinition[]) {
  return definitions.map((d) => ({
    name: d.name,
    description: d.description,
    // Gemini rejects an OBJECT without properties; omit parameters for argument-less tools.
    ...(d.inputSchema.properties && Object.keys(d.inputSchema.properties).length ? { parameters: toGeminiSchema(d.inputSchema) } : {}),
  }));
}
