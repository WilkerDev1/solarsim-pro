export interface BuiltMcpApp {
  type: string;
  file: string;
  html: string;
}
/** Builds one self-contained HTML document per MCP App card type into `outDir`. */
export function buildMcpApps(outDir: string): Promise<BuiltMcpApp[]>;
