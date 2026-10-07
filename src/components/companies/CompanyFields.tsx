import type { CompanyProfile } from "../../types";
import type { Dispatch, SetStateAction } from "react";
export function CompanyFields({
  draft,
  setDraft,
  readOnly = false,
}: {
  draft: Partial<CompanyProfile>;
  setDraft: Dispatch<SetStateAction<Partial<CompanyProfile>>>;
  readOnly?: boolean;
}) {
  const fields: {
    key: keyof CompanyProfile;
    label: string;
    type?: string;
    max: number;
    wide?: boolean;
  }[] = [
    { key: "name", label: "Razón social", max: 255 },
    { key: "commercialName", label: "Nombre comercial", max: 255 },
    { key: "rncOrId", label: "RNC o identificación fiscal", max: 32 },
    { key: "phone", label: "Teléfono", type: "tel", max: 100 },
    { key: "email", label: "Correo de la empresa", type: "email", max: 255 },
    { key: "website", label: "Sitio web", max: 255 },
    { key: "address", label: "Dirección", max: 500, wide: true },
  ];
  return (
    <div className="company-fields">
      {fields.map((field) => (
        <label
          key={field.key}
          className={field.wide ? "company-field-wide" : ""}
        >
          <span>
            {field.label}
            {field.key === "name" ? " *" : ""}
          </span>
          <input
            value={String(draft[field.key] || "")}
            type={field.type || "text"}
            maxLength={field.max}
            required={field.key === "name"}
            readOnly={readOnly}
            autoComplete="off"
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                [field.key]: event.target.value,
              }))
            }
          />
        </label>
      ))}
    </div>
  );
}
