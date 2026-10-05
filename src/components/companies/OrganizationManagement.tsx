import { useEffect, useState } from "react";
import {
  CompanyService,
  OrganizationSummary,
} from "../../services/companyService";
import { useSimulationStore } from "../../store/useSimulationStore";
import { CompanyFields } from "./CompanyFields";
import type { CompanyProfile } from "../../types";
import { OrganizationSection } from "../settings/sections/OrganizationSection";

export function OrganizationManagement({
  registerLeaveGuard,
}: {
  registerLeaveGuard?: (guard: (() => boolean) | null) => void;
}) {
  const { syncSettings, sessionGeneration, switchOrganization } =
    useSimulationStore();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [draft, setDraft] = useState<Partial<CompanyProfile>>({});
  const [savedDraft, setSavedDraft] = useState<Partial<CompanyProfile>>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const allowDiscard = () =>
    !dirty ||
    window.confirm(
      "El perfil compartido tiene cambios sin guardar. ¿Descartarlos?",
    );
  useEffect(() => {
    registerLeaveGuard?.(allowDiscard);
    return () => registerLeaveGuard?.(null);
  }, [dirty, registerLeaveGuard]);
  const [version, setVersion] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"profile" | "team" | "other">("profile");
  const user = syncSettings.currentUser;
  const valid = () =>
    useSimulationStore.getState().sessionGeneration === sessionGeneration;
  const load = async () => {
    if (!syncSettings.authToken) return;
    const [list, profile] = await Promise.all([
      CompanyService.list(syncSettings.serverUrl, syncSettings.authToken),
      CompanyService.profile(syncSettings.serverUrl, syncSettings.authToken),
    ]);
    if (!valid()) return;
    if (list.success && profile.success && profile.profile && profile.version) {
      setOrganizations(list.organizations || []);
      setDraft(profile.profile);
      setSavedDraft(profile.profile);
      setVersion(profile.version);
      setLoaded(true);
    } else {
      setLoaded(false);
      setMessage(
        list.error || profile.error || "No se pudieron consultar las empresas.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [sessionGeneration]);
  const run = async (
    operation: () => Promise<{ success: boolean; error?: string }>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    const result = await operation();
    if (!valid()) return;
    setBusy(false);
    setMessage(
      result.success
        ? success
        : result.error || "No se pudo completar la operación.",
    );
  };
  if (!user || !syncSettings.authToken)
    return (
      <>
        <h2>Organizaciones y equipo</h2>
        <p>
          Inicia sesión para gestionar organizaciones independientes. Cada
          organización mantiene sus propuestas, catálogo, configuración y
          permisos separados.
        </p>
        <button
          onClick={() =>
            useSimulationStore.getState().openSettingsModal("sync")
          }
        >
          Ir a cuenta y perfiles
        </button>
      </>
    );
  const token = syncSettings.authToken;
  return (
    <>
      <h2>Organizaciones y equipo</h2>
      <p>
        Estás trabajando en{" "}
        <strong>{user.organizationName || "tu organización"}</strong> con
        permisos de {user.role}. Al cambiar, se conserva el trabajo pendiente de
        cada empresa.
      </p>
      {message && (
        <div className="cc-notice" role="status">
          {message}
        </div>
      )}
      <div className="cc-inline">
        <label>
          Organización activa{" "}
          <select
            value={user.organizationId}
            disabled={!loaded || busy}
            onChange={(event) => {
              if (allowDiscard())
                void run(
                  () => switchOrganization(event.target.value),
                  "Organización cambiada.",
                );
            }}
          >
            {!loaded && (
              <option value={user.organizationId}>
                {user.organizationName || user.organizationId}
              </option>
            )}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} · {org.role}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() => {
            if (allowDiscard()) void load();
          }}
        >
          Actualizar datos
        </button>
      </div>
      {loaded && (
        <>
          <nav className="cc-tabs" aria-label="Gestión de la organización">
            {(
              [
                ["profile", "Datos de empresa"],
                ["team", "Equipo e invitaciones"],
                ["other", "Otras organizaciones"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {view === "profile" && (
            <form
              className="cc-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!version) return;
                void run(async () => {
                  const result = await CompanyService.saveProfile(
                    syncSettings.serverUrl,
                    token,
                    draft,
                    version,
                  );
                  if (valid() && result.success && result.version) {
                    setVersion(result.version);
                    setDraft(result.profile || draft);
                    setSavedDraft(result.profile || draft);
                  }
                  return result;
                }, "Perfil de organización guardado.");
              }}
            >
              <h3>Perfil compartido de la organización</h3>
              <p>
                Estos datos pertenecen a la organización del servidor. Los
                membretes del dispositivo se gestionan por separado.
              </p>
              <CompanyFields
                draft={draft}
                setDraft={setDraft}
                readOnly={user.role !== "ADMIN" || busy}
              />
              {user.role === "ADMIN" && (
                <div className="cc-actions">
                  <button
                    type="button"
                    disabled={busy || !dirty}
                    onClick={() => setDraft({ ...savedDraft })}
                  >
                    Descartar cambios
                  </button>
                  <button
                    type="submit"
                    className="cc-primary"
                    disabled={busy || !dirty}
                  >
                    {busy ? "Guardando…" : "Guardar perfil compartido"}
                  </button>
                </div>
              )}
            </form>
          )}
          {view === "team" && (
            <section className="cc-section">
              <OrganizationSection key={sessionGeneration} />
            </section>
          )}
          {view === "other" && (
            <section className="cc-section">
              <h3>Otras organizaciones</h3>
              {user.role === "ADMIN" && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const result = await CompanyService.create(
                        syncSettings.serverUrl,
                        token,
                        name.trim(),
                      );
                      if (result.success && valid()) {
                        setName("");
                        await load();
                      }
                      return result;
                    }, "Organización creada. Puedes seleccionarla arriba; empieza sin propuestas ni miembros adicionales.");
                  }}
                >
                  <label>
                    Nombre de la nueva organización
                    <input
                      required
                      maxLength={255}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <div className="cc-actions">
                    <button disabled={busy}>
                      Crear organización independiente
                    </button>
                  </div>
                </form>
              )}
              <form
                className="cc-section"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    const result = await CompanyService.acceptInvitation(
                      syncSettings.serverUrl,
                      token,
                      code.trim(),
                    );
                    if (result.success && valid()) {
                      setCode("");
                      await load();
                    }
                    return result;
                  }, "Invitación aceptada. Selecciona la organización para empezar a trabajar.");
                }}
              >
                <h3>Unirse mediante invitación</h3>
                <p>
                  Usa un código facilitado por su administrador. Debe estar
                  destinado al correo de tu cuenta: {user.email}.
                </p>
                <label>
                  Código de invitación
                  <input
                    required
                    autoComplete="off"
                    value={code}
                    minLength={64}
                    maxLength={64}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
                <div className="cc-actions">
                  <button disabled={busy}>Aceptar invitación</button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </>
  );
}
