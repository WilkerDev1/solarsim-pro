import { useEffect, useState } from "react";
import { useSimulationStore } from "../../../store/useSimulationStore";
import { SyncService } from "../../../services/syncService";
import {
  CompanyService,
  OrganizationInvitation,
} from "../../../services/companyService";
import type { UserProfile, UserRole } from "../../../types";
import "../../../components/companies/company-center.css";

export function OrganizationSection() {
  const { syncSettings, sessionGeneration, sidebarTheme } =
    useSimulationStore();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [inviteState, setInviteState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("EDITOR");
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);
  const [mode, setMode] = useState<"none" | "invite" | "create" | "edit">(
    "none",
  );
  const user = syncSettings.currentUser;
  const isCurrent = (generation = sessionGeneration) =>
    useSimulationStore.getState().sessionGeneration === generation;
  const load = async () => {
    if (!syncSettings.authToken || user?.role !== "ADMIN") return;
    setInviteState("loading");
    setInvitations([]);
    setInviteError("");
    setError("");
    const [users, invites] = await Promise.all([
      SyncService.getCompanyUsers(
        syncSettings.serverUrl,
        syncSettings.authToken,
      ),
      CompanyService.invitations(
        syncSettings.serverUrl,
        syncSettings.authToken,
      ),
    ]);
    if (!isCurrent()) return;
    if (users.success) {
      setMembers(users.users);
      setError("");
    } else {
      setMembers([]);
      setError(users.error || "No se pudo consultar el equipo.");
    }
    if (invites.success) {
      setInvitations(invites.invitations || []);
      setInviteState("ready");
    } else {
      setInviteState("error");
      setInviteError(
        invites.error || "No se pudieron consultar las invitaciones.",
      );
    }
  };
  useEffect(() => {
    setMembers([]);
    setInvitations([]);
    setEditing(null);
    setPassword("");
    setMode("none");
    setInvitationCode("");
    setMessage("");
    setError("");
    setBusy(false);
    void load();
  }, [sessionGeneration, user?.role, syncSettings.authToken]);
  const resetForm = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("EDITOR");
    setActive(true);
    setMode("none");
  };
  const run = async (
    operation: () => Promise<{ success: boolean; error?: string }>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    setError("");
    const result = await operation();
    if (!isCurrent()) return;
    setBusy(false);
    if (result.success) {
      setMessage(success);
      setError("");
      resetForm();
      await load();
    } else {
      setError(result.error || "No se pudo completar la operación.");
      setMessage("");
    }
  };
  if (!user || !syncSettings.authToken)
    return (
      <div className="company-center" data-theme={sidebarTheme}>
        <h3>Equipo de {user?.organizationName || "tu organización"}</h3>
        <p>
          Inicia sesión con una cuenta de Administrador para consultar y gestionar el equipo de tu organización.
        </p>
        <button
          className="cc-primary"
          onClick={() => useSimulationStore.getState().openSettingsModal("sync")}
        >
          Ir a Cuenta y perfiles
        </button>
      </div>
    );
  if (user.role !== "ADMIN")
    return (
      <>
        <h3>Equipo de {user.organizationName || "tu organización"}</h3>
        <p>
          Tu rol es {user.role}. Un administrador gestiona miembros e
          invitaciones.
        </p>
      </>
    );
  const token = syncSettings.authToken!;
  const roles = (
    <>
      <option value="ADMIN">Administrador</option>
      <option value="EDITOR">Editor</option>
      <option value="LECTOR">Lector</option>
    </>
  );
  return (
    <div
      className="company-center"
      data-theme={sidebarTheme}
      style={{
        height: "auto",
        overflow: "visible",
        background: "transparent",
        display: "block",
      }}
    >
      <div className="cc-inline" style={{ justifyContent: "space-between" }}>
        <h3>Equipo de {user.organizationName || "tu organización"}</h3>
        <div className="cc-inline">
          <button
            disabled={busy}
            onClick={() => {
              resetForm();
              setMode("invite");
            }}
          >
            Invitar cuenta existente
          </button>
          <button
            disabled={busy}
            onClick={() => {
              resetForm();
              setMode("create");
            }}
          >
            Crear cuenta
          </button>
          <button disabled={busy} onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>
      <p>
        Administradores gestionan la empresa y el equipo. Editores crean y
        sincronizan propuestas. Lectores consultan los datos.
      </p>
      {message && (
        <div className="cc-notice" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="cc-notice cc-error" role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          {/no autorizad/i.test(error) && (
            <button
              style={{ padding: "4px 10px", minHeight: "auto", fontSize: 13 }}
              onClick={() => useSimulationStore.getState().openSettingsModal("sync")}
            >
              Iniciar sesión
            </button>
          )}
        </div>
      )}
      {invitationCode && (
        <div className="cc-notice">
          <strong>Invitación creada</strong>
          <p>
            No se envió un correo. Comparte este código con la persona invitada;
            vence en siete días.
          </p>
          <div className="cc-code">{invitationCode}</div>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invitationCode);
                setMessage("Código copiado.");
              } catch {
                setMessage("Selecciona el código y cópialo manualmente.");
              }
            }}
          >
            Copiar código
          </button>
          <button onClick={() => setInvitationCode("")}>Ocultar código</button>
        </div>
      )}
      {mode !== "none" && (
        <form
          className="cc-member-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "invite")
              void run(async () => {
                const result = await CompanyService.invite(
                  syncSettings.serverUrl,
                  token,
                  email.trim(),
                  role,
                );
                if (isCurrent() && result.code) setInvitationCode(result.code);
                return result;
              }, "Invitación preparada.");
            if (mode === "create")
              void run(
                () =>
                  SyncService.createCompanyUser(syncSettings.serverUrl, token, {
                    name: name.trim(),
                    email: email.trim(),
                    password,
                    role,
                  }),
                "Cuenta creada.",
              );
            if (mode === "edit" && editing)
              void run(
                () =>
                  SyncService.updateCompanyUser(
                    syncSettings.serverUrl,
                    token,
                    editing.id,
                    {
                      role,
                      isActive: active,
                      ...(editing.canEditIdentity !== false
                        ? {
                            name: name.trim(),
                            ...(password ? { password } : {}),
                          }
                        : {}),
                    },
                  ),
                "Permisos guardados.",
              );
          }}
        >
          <h3>
            {mode === "invite"
              ? "Invitar a una persona con cuenta"
              : mode === "create"
                ? "Crear una cuenta del equipo"
                : "Editar acceso al equipo"}
          </h3>
          {mode === "edit" && editing?.canEditIdentity === false && (
            <p>
              Esta cuenta pertenece a otras empresas. Aquí se modifica
              únicamente su acceso a esta organización.
            </p>
          )}
          <div className="company-fields">
            {mode !== "invite" && (
              <label>
                Nombre
                <input
                  required
                  maxLength={255}
                  value={name}
                  readOnly={
                    mode === "edit" && editing?.canEditIdentity === false
                  }
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            {mode !== "edit" && (
              <label>
                Correo
                <input
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}
            <label>
              Rol
              <select
                value={role === "VIEWER" ? "LECTOR" : role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                {roles}
              </select>
            </label>
            {mode !== "invite" &&
              (mode === "create" || editing?.canEditIdentity !== false) && (
                <label>
                  {mode === "create"
                    ? "Contraseña (mínimo 8 caracteres)"
                    : "Nueva contraseña (opcional, mínimo 8 caracteres)"}
                  <input
                    type="password"
                    required={mode === "create"}
                    minLength={8}
                    maxLength={200}
                    value={password}
                    autoComplete="new-password"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              )}
            {mode === "edit" && (
              <label className="cc-inline">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                Acceso activo a esta organización
              </label>
            )}
          </div>
          <div className="cc-actions">
            <button type="button" disabled={busy} onClick={resetForm}>
              Cancelar
            </button>
            <button type="submit" className="cc-primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : mode === "invite"
                  ? "Crear invitación"
                  : "Guardar"}
            </button>
          </div>
        </form>
      )}
      <div className="cc-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Rol</th>
              <th>Acceso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td>
                  <strong>{member.name}</strong>
                  <div className="cc-muted">{member.email}</div>
                </td>
                <td>{member.role}</td>
                <td>{member.isActive === false ? "Suspendido" : "Activo"}</td>
                <td>
                  <div className="cc-inline">
                    <button
                      disabled={busy}
                      onClick={() => {
                        resetForm();
                        setEditing(member);
                        setName(member.name);
                        setRole(member.role);
                        setActive(member.isActive !== false);
                        setMode("edit");
                      }}
                    >
                      Editar
                    </button>
                    {member.id !== user.id && (
                      <button
                        className="cc-danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Retirar el acceso de " +
                                member.name +
                                "? Sus propuestas se conservan.",
                            )
                          )
                            void run(
                              () =>
                                SyncService.deleteCompanyUser(
                                  syncSettings.serverUrl,
                                  token,
                                  member.id,
                                ),
                              "Acceso retirado.",
                            );
                        }}
                      >
                        Retirar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!members.length && (
        <p>Sin miembros cargados. Usa Actualizar para consultar el servidor.</p>
      )}
      {inviteState === "loading" && (
        <p role="status">Consultando invitaciones…</p>
      )}
      {inviteState === "error" && (
        <div className="cc-notice cc-error" role="alert">
          {inviteError}{" "}
          <button onClick={() => void load()}>Reintentar consulta</button>
        </div>
      )}
      {inviteState === "ready" && !invitations.length && (
        <p>No hay invitaciones registradas.</p>
      )}
      {invitations.length > 0 && (
        <section className="cc-section">
          <h3>Invitaciones</h3>
          <div className="cc-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invite) => {
                  const pending =
                    !invite.acceptedAt &&
                    !invite.revokedAt &&
                    new Date(invite.expiresAt).getTime() > Date.now();
                  return (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>{invite.role}</td>
                      <td>
                        {invite.acceptedAt
                          ? "Aceptada"
                          : invite.revokedAt
                            ? "Revocada"
                            : pending
                              ? "Pendiente · vence " +
                                new Date(invite.expiresAt).toLocaleDateString(
                                  "es-DO",
                                )
                              : "Caducada"}
                      </td>
                      <td>
                        {pending && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  CompanyService.revokeInvitation(
                                    syncSettings.serverUrl,
                                    token,
                                    invite.id,
                                  ),
                                "Invitación revocada.",
                              )
                            }
                          >
                            Revocar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
