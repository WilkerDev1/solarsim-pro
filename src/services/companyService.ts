import { fetchWithSessionRetry } from "./syncService";
import type { AuthResponse } from "./syncService";
import type { CompanyProfile, UserRole } from "../types";

export interface OrganizationSummary {
  id: string;
  name: string;
  rnc: string | null;
  role: UserRole;
  version: number;
}
export interface OrganizationInvitation {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}
export interface CompanyResult {
  success: boolean;
  error?: string;
  status?: number;
  organizations?: OrganizationSummary[];
  organization?: OrganizationSummary;
  organizationId?: string;
  profile?: Partial<CompanyProfile>;
  version?: number;
  invitations?: OrganizationInvitation[];
  code?: string;
}
async function request(
  server: string,
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<CompanyResult & AuthResponse> {
  try {
    const response = await fetchWithSessionRetry(
      server.trim().replace(/\/+$/, "") + "/api/" + path,
      {
        method,
        headers: {
          Authorization: "Bearer " + token,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success)
      return {
        success: false,
        status: response.status,
        error:
          response.status === 404 || response.status === 405
            ? "Este servidor todavía no admite la gestión de organizaciones. Se requiere actualizar la API."
            : data?.error ||
              "No se pudo completar la operación (HTTP " +
                response.status +
                ").",
      };
    return { ...data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo conectar al servidor.",
    };
  }
}
export const CompanyService = {
  list: (s: string, t: string) => request(s, t, "organizations"),
  create: (s: string, t: string, name: string) =>
    request(s, t, "organizations", "POST", { name }),
  switch: (s: string, t: string, organizationId: string) =>
    request(s, t, "auth/switch-organization", "POST", { organizationId }),
  profile: (s: string, t: string) => request(s, t, "organization/profile"),
  saveProfile: (
    s: string,
    t: string,
    profile: Partial<CompanyProfile>,
    baseVersion: number,
  ) => request(s, t, "organization/profile", "PATCH", { profile, baseVersion }),
  invitations: (s: string, t: string) =>
    request(s, t, "organization/invitations"),
  invite: (s: string, t: string, email: string, role: UserRole) =>
    request(s, t, "organization/invitations", "POST", { email, role }),
  revokeInvitation: (s: string, t: string, id: string) =>
    request(
      s,
      t,
      "organization/invitations/" + encodeURIComponent(id),
      "DELETE",
    ),
  acceptInvitation: (s: string, t: string, code: string) =>
    request(s, t, "auth/accept-invitation", "POST", { code }),
};
