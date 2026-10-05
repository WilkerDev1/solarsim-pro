import { DEFAULT_LOCAL_COMPANY } from "../../types/companyProfile";
import type { CompanyProfile } from "../../types/companyProfile";
const factory: Partial<CompanyProfile> = {
  rncOrId: "1-31-12345-6",
  phone: "809-555-0100",
  email: "contacto@electsun.com.do",
  address: "Av. Winston Churchill, Torre Empresarial, Santo Domingo, D.N.",
  website: "electsun.com.do",
  defaultPaymentTerms:
    "60% anticipo al ordenar, 30% contra entrega de equipos en sitio, 10% tras interconexión con distribuidora.",
  defaultWarrantyNotes:
    "25 años en paneles solares, 10 años en inversores híbridos, 10 años en baterías BESS y 1 año en mano de obra.",
};
/** Remove only exact factory examples. Never rewrite saved document snapshots. */
export function normalizeCompanyProfiles(
  input: CompanyProfile[],
  migrateFactory = false,
): CompanyProfile[] {
  const seen = new Set<string>();
  const profiles = (Array.isArray(input) ? input : [])
    .filter(
      (p) =>
        p && typeof p.id === "string" && !seen.has(p.id) && !!seen.add(p.id),
    )
    .map((p) => {
      const next = { ...p };
      if (migrateFactory && p.id === DEFAULT_LOCAL_COMPANY.id && !p.dataVersion)
        for (const key of Object.keys(factory) as (keyof CompanyProfile)[])
          if (next[key] === factory[key])
            Object.assign(next, { [key]: DEFAULT_LOCAL_COMPANY[key] });
      next.dataVersion = 1;
      return next;
    });
  if (!profiles.length) profiles.push({ ...DEFAULT_LOCAL_COMPANY });
  const preferred = profiles.find((p) => p.isDefault)?.id || profiles[0].id;
  return profiles.map((p) => ({ ...p, isDefault: p.id === preferred }));
}
