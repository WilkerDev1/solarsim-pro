import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Plus,
  Users,
  UserRound,
  Check,
  Download,
} from "lucide-react";
import { useSimulationStore } from "../../store/useSimulationStore";
import { DEFAULT_LOCAL_COMPANY, CompanyProfile } from "../../types";
import { CompanyFields } from "./CompanyFields";
import { OrganizationManagement } from "./OrganizationManagement";
import "./company-center.css";

type Section = "profiles" | "organization" | "consultant";
export function CompanyProfileHubView() {
  const store = useSimulationStore();
  const {
    companies,
    activeCompanyId,
    localUserProfile,
    sidebarTheme,
    sessionGeneration,
  } = store;
  const [section, setSection] = useState<Section>("profiles");
  const [selected, setSelected] = useState(activeCompanyId);
  const [creating, setCreating] = useState(false);
  const initial =
    companies.find((company) => company.id === activeCompanyId) || companies[0];
  const [draft, setDraft] = useState<Partial<CompanyProfile>>({ ...initial });
  const [consultant, setConsultant] = useState({ ...localUserProfile });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const draftEpoch = useRef(0);
  const organizationLeaveGuard = useRef<(() => boolean) | null>(null);
  const consultantDirty =
    JSON.stringify(consultant) !== JSON.stringify(localUserProfile);
  const allowActiveLeave = () =>
    section === "profiles"
      ? allowLeave()
      : section === "organization"
        ? (organizationLeaveGuard.current?.() ?? true)
        : !consultantDirty ||
          window.confirm(
            "El perfil del consultor tiene cambios sin guardar. ¿Descartarlos?",
          );
  const importInput = useRef<HTMLInputElement>(null);
  const original = companies.find((company) => company.id === selected);
  const dirty = creating || JSON.stringify(draft) !== JSON.stringify(original);
  const allowLeave = () =>
    !dirty ||
    window.confirm(
      "Tienes cambios sin guardar en este membrete. ¿Descartarlos?",
    );
  useEffect(() => {
    const current =
      companies.find((c) => c.id === activeCompanyId) || companies[0];
    draftEpoch.current++;
    setSelected(current.id);
    setDraft({ ...current });
    setCreating(false);
    setConsultant({ ...localUserProfile });
    setMessage("");
    setError("");
  }, [sessionGeneration]);
  const select = (company: CompanyProfile) => {
    if (!allowLeave()) return;
    draftEpoch.current++;
    setSelected(company.id);
    setCreating(false);
    setDraft({ ...company });
    setMessage("");
    setError("");
  };
  const changeSection = (next: Section) => {
    if (next !== section && !allowActiveLeave()) return;
    if (next !== section) setConsultant({ ...localUserProfile });
    if (next !== "profiles" && original) {
      setDraft({ ...original });
      setCreating(false);
    }
    setSection(next);
    setMessage("");
    setError("");
  };
  const upload = (
    file: File | undefined,
    field: "logoBase64" | "signatureSealBase64",
  ) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Usa una imagen PNG, JPEG o WebP de hasta 2 MB.");
      return;
    }
    const captured = selected,
      generation = sessionGeneration,
      uploadEpoch = ++draftEpoch.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (
        useSimulationStore.getState().sessionGeneration !== generation ||
        draftEpoch.current !== uploadEpoch
      )
        return;
      setDraft((previous) =>
        previous.id === captured || (!previous.id && creating)
          ? { ...previous, [field]: String(reader.result) }
          : previous,
      );
    };
    reader.onerror = () => setError("No se pudo leer la imagen.");
    reader.readAsDataURL(file);
  };
  const save = () => {
    if (!draft.name?.trim()) {
      setError("Completa la razón social para guardar.");
      return;
    }
    const saved = {
      ...draft,
      name: draft.name.trim(),
      rncOrId: draft.rncOrId || "",
      phone: draft.phone || "",
      email: draft.email || "",
      address: draft.address || "",
      isDefault: !!draft.isDefault,
    };
    if (creating) {
      const id = store.addCompany(
        saved as Omit<CompanyProfile, "id" | "createdAt" | "updatedAt">,
      );
      setSelected(id);
      setCreating(false);
      setDraft({
        ...useSimulationStore.getState().companies.find((c) => c.id === id)!,
      });
    } else {
      store.updateCompany(selected, saved);
      setDraft({
        ...useSimulationStore
          .getState()
          .companies.find((c) => c.id === selected)!,
      });
    }
    setError("");
    setMessage(
      "Membrete guardado. Las propuestas existentes conservan sus datos.",
    );
  };
  const exportProfiles = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "solarsim-company-profiles",
            version: 1,
            companies,
            localUserProfile,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "solarsim-membretes.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importProfiles = async (file?: File) => {
    if (!file) return;
    const generation = sessionGeneration;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("El respaldo supera 20 MB.");
      const data = JSON.parse(await file.text());
      if (
        !data ||
        data.format !== "solarsim-company-profiles" ||
        data.version !== 1 ||
        !Array.isArray(data.companies) ||
        data.companies.length > 50
      )
        throw new Error("Selecciona un respaldo de membretes compatible.");
      if (generation !== useSimulationStore.getState().sessionGeneration)
        return;
      const validated = data.companies.map((company: any) => {
        if (
          !company ||
          typeof company.name !== "string" ||
          !company.name.trim() ||
          company.name.length > 255
        )
          throw new Error("El respaldo contiene un perfil inválido.");
        const safe: any = { name: company.name, isDefault: false };
        for (const key of [
          "commercialName",
          "rncOrId",
          "phone",
          "email",
          "address",
          "website",
          "defaultPaymentTerms",
          "defaultWarrantyNotes",
        ]) {
          if (
            company[key] !== undefined &&
            (typeof company[key] !== "string" || company[key].length > 3000)
          )
            throw new Error("Campo inválido en el respaldo.");
          safe[key] = company[key] || "";
        }
        for (const key of ["logoBase64", "signatureSealBase64"]) {
          if (
            company[key] &&
            (typeof company[key] !== "string" ||
              company[key].length > 2800000 ||
              !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
                company[key],
              ))
          )
            throw new Error("Imagen inválida en el respaldo.");
          safe[key] = company[key] || "";
        }
        for (const key of ["primaryColor", "accentColor"]) {
          if (
            company[key] &&
            (typeof company[key] !== "string" ||
              !/^#[0-9a-f]{6}$/i.test(company[key]))
          )
            throw new Error("Color inválido en el respaldo.");
          safe[key] = company[key];
        }
        return safe;
      });
      validated.forEach((company: any) => store.addCompany(company));
      setMessage(
        validated.length +
          " membretes importados como copias. Los existentes se conservaron.",
      );
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo leer el respaldo.",
      );
    }
  };
  return (
    <div className="company-center" data-theme={sidebarTheme}>
      <header>
        <button
          aria-label="Volver a propuestas"
          onClick={() => {
            if (allowActiveLeave()) store.setActiveView("dashboard");
          }}
        >
          <ArrowLeft size={16} />
          Propuestas
        </button>
        <Building2 size={20} className="cc-status" />
        <h1>Centro empresarial</h1>
      </header>
      <div className="company-center-body">
        <aside>
          <h3>Gestión empresarial</h3>
          <nav aria-label="Centro empresarial">
            <button
              aria-current={section === "profiles" ? "page" : undefined}
              onClick={() => changeSection("profiles")}
            >
              <Building2 size={18} />
              Membretes y marcas
            </button>
            <button
              aria-current={section === "organization" ? "page" : undefined}
              onClick={() => changeSection("organization")}
            >
              <Users size={18} />
              Organizaciones y equipo
            </button>
            <button
              aria-current={section === "consultant" ? "page" : undefined}
              onClick={() => changeSection("consultant")}
            >
              <UserRound size={18} />
              Perfil del consultor
            </button>
          </nav>
          {section === "profiles" && (
            <>
              <div className="cc-aside-divider" />
              <div
                className="cc-inline"
                style={{
                  justifyContent: "space-between",
                  padding: "0 8px 12px",
                }}
              >
                <strong>Membretes</strong>
                <button
                  aria-label="Crear membrete"
                  onClick={() => {
                    if (!allowLeave()) return;
                    draftEpoch.current++;
                    setCreating(true);
                    setDraft({
                      ...DEFAULT_LOCAL_COMPANY,
                      id: undefined,
                      name: "",
                      isDefault: false,
                    });
                    setError("");
                    setMessage("");
                  }}
                >
                  <Plus size={16} />
                  Nuevo
                </button>
              </div>
              <nav aria-label="Membretes disponibles">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    aria-current={
                      !creating && selected === company.id ? "page" : undefined
                    }
                    onClick={() => select(company)}
                  >
                    <span>
                      <strong>{company.commercialName || company.name}</strong>
                      <small>
                        {company.id === activeCompanyId
                          ? "En uso para nuevas propuestas"
                          : company.isDefault
                            ? "Predeterminado"
                            : company.rncOrId || "Datos fiscales sin completar"}
                      </small>
                    </span>
                  </button>
                ))}
              </nav>
            </>
          )}
        </aside>
        <main>
          <div className="cc-content">
            {section === "organization" ? (
              <OrganizationManagement
                key={sessionGeneration}
                registerLeaveGuard={(guard) => {
                  organizationLeaveGuard.current = guard;
                }}
              />
            ) : section === "consultant" ? (
              <>
                <h2>Perfil del consultor</h2>
                <p>
                  Identidad profesional guardada en este dispositivo. Los
                  permisos de acceso los determina tu cuenta de la organización.
                </p>
                {store.syncSettings.currentUser && (
                  <div className="cc-notice">
                    Cuenta conectada: {store.syncSettings.currentUser.name} ·{" "}
                    {store.syncSettings.currentUser.email}
                  </div>
                )}
                <form
                  className="cc-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    store.updateLocalUserProfile(consultant);
                    setMessage("Perfil del consultor guardado.");
                  }}
                >
                  <div className="company-fields">
                    {(["name", "roleTitle", "email", "phone"] as const).map(
                      (key, index) => (
                        <label key={key}>
                          {
                            [
                              "Nombre",
                              "Cargo profesional",
                              "Correo",
                              "Teléfono",
                            ][index]
                          }
                          <input
                            value={consultant[key] || ""}
                            type={key === "email" ? "email" : "text"}
                            maxLength={255}
                            onChange={(event) =>
                              setConsultant((previous) => ({
                                ...previous,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                  <div className="cc-actions">
                    <button
                      type="button"
                      disabled={!consultantDirty}
                      onClick={() => setConsultant({ ...localUserProfile })}
                    >
                      Descartar cambios
                    </button>
                    <button
                      className="cc-primary"
                      type="submit"
                      disabled={!consultantDirty}
                    >
                      Guardar perfil
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div
                  className="cc-inline"
                  style={{ justifyContent: "space-between" }}
                >
                  <h2>
                    {creating
                      ? "Nuevo membrete"
                      : original?.commercialName ||
                        original?.name ||
                        "Membrete de empresa"}
                  </h2>
                  {!creating && selected === activeCompanyId && (
                    <span className="cc-status">
                      <Check size={14} style={{ display: "inline" }} /> En uso
                    </span>
                  )}
                </div>
                <p>
                  Define la identidad que se copiará a las nuevas propuestas.
                  Activar un membrete no cambia de organización ni modifica
                  documentos anteriores.
                </p>
                <form
                  className="cc-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save();
                  }}
                >
                  <h3>Identidad y contacto</h3>
                  <CompanyFields draft={draft} setDraft={setDraft} />
                  <section className="cc-section">
                    <h3>Logo y recursos de marca</h3>
                    <p>
                      El logo se incorpora a las nuevas propuestas. El sello y
                      los colores se conservan como recursos del perfil.
                    </p>
                    {(["logoBase64", "signatureSealBase64"] as const).map(
                      (field, index) => (
                        <div className="cc-upload" key={field}>
                          {draft[field] && (
                            <img
                              className="cc-logo"
                              src={draft[field]}
                              alt={
                                index === 0
                                  ? "Logo de empresa"
                                  : "Sello de empresa"
                              }
                            />
                          )}
                          <label>
                            {index === 0 ? "Logo" : "Sello o firma"}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(event) => {
                                upload(event.target.files?.[0], field);
                                event.target.value = "";
                              }}
                            />
                          </label>
                          {draft[field] && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((previous) => ({
                                  ...previous,
                                  [field]: "",
                                }))
                              }
                            >
                              Quitar {index === 0 ? "logo" : "sello"}
                            </button>
                          )}
                        </div>
                      ),
                    )}
                    <div className="cc-inline">
                      {(["primaryColor", "accentColor"] as const).map(
                        (key, index) => (
                          <label key={key}>
                            {index === 0
                              ? "Color principal"
                              : "Color de acento"}
                            <input
                              type="color"
                              value={
                                draft[key] ||
                                (index === 0 ? "#059669" : "#0284c7")
                              }
                              onChange={(event) =>
                                setDraft((previous) => ({
                                  ...previous,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </section>
                  <section className="cc-section">
                    <h3>Condiciones de la empresa</h3>
                    <p>
                      Notas internas del membrete. Las condiciones de cada
                      propuesta se revisan en su documento.
                    </p>
                    <div className="company-fields">
                      <label>
                        Condiciones de pago
                        <textarea
                          maxLength={1500}
                          value={draft.defaultPaymentTerms || ""}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              defaultPaymentTerms: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Notas de garantías y servicio
                        <textarea
                          maxLength={1500}
                          value={draft.defaultWarrantyNotes || ""}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              defaultWarrantyNotes: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </section>
                  <div className="cc-section cc-inline">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!draft.isDefault}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            isDefault: event.target.checked,
                          }))
                        }
                      />
                      Membrete predeterminado
                    </label>
                  </div>
                  {error && (
                    <div className="cc-notice cc-error" role="alert">
                      {error}
                    </div>
                  )}
                  <div className="cc-actions">
                    {!creating && companies.length > 1 && (
                      <button
                        type="button"
                        className="cc-danger"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "¿Eliminar este membrete del dispositivo? Las propuestas existentes se conservan.",
                            )
                          )
                            return;
                          store.deleteCompany(selected);
                          const next = useSimulationStore
                            .getState()
                            .companies.find(
                              (c) =>
                                c.id ===
                                useSimulationStore.getState().activeCompanyId,
                            )!;
                          setSelected(next.id);
                          setDraft({ ...next });
                          setMessage(
                            "Membrete eliminado; las propuestas se conservaron.",
                          );
                        }}
                      >
                        Eliminar membrete
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!dirty}
                      onClick={() => {
                        draftEpoch.current++;
                        setCreating(false);
                        setDraft({ ...original });
                        setError("");
                      }}
                    >
                      Descartar cambios
                    </button>
                    <button
                      className="cc-primary"
                      type="submit"
                      disabled={!dirty}
                    >
                      Guardar membrete
                    </button>
                  </div>
                </form>
                {!creating && selected !== activeCompanyId && (
                  <div className="cc-actions">
                    <button
                      disabled={dirty}
                      onClick={() => {
                        store.setActiveCompany(selected);
                        setMessage(
                          "Este membrete se usará en las nuevas propuestas.",
                        );
                      }}
                    >
                      Usar para nuevas propuestas
                    </button>
                  </div>
                )}
                <section className="cc-section">
                  <h3>Respaldo de membretes</h3>
                  <p>
                    Exporta los perfiles de este espacio. Al importar se crean
                    copias; no se reemplazan propuestas, cuentas ni permisos.
                  </p>
                  <div className="cc-inline">
                    <button onClick={exportProfiles}>
                      <Download size={16} />
                      Exportar membretes
                    </button>
                    <button onClick={() => importInput.current?.click()}>
                      Importar copias
                    </button>
                    <input
                      ref={importInput}
                      hidden
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) => {
                        void importProfiles(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>
                </section>
              </>
            )}
            {message && section !== "organization" && (
              <div className="cc-notice" role="status">
                {message}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
