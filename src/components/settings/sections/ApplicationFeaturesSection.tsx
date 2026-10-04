import React, { useEffect } from 'react';
import { LockKeyhole, RefreshCw } from 'lucide-react';
import { APPLICATION_FEATURES, featureScope } from '../../../../shared/applicationFeatures';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { effectiveFeatureSettings } from '../../../features/application/featurePolicy';

export function ApplicationFeaturesSection() {
  const state = useSimulationStore();
  const user = state.syncSettings.currentUser;
  const scope = user ? featureScope(state.syncSettings.serverUrl, user.organizationId) : null;
  const policy = scope ? state.organizationFeaturePolicies[scope] : undefined;
  const request = state.featurePolicyRequest?.scope === scope ? state.featurePolicyRequest : null;
  const settings = effectiveFeatureSettings(state);
  const busy = request?.status === 'loading' || request?.status === 'saving';
  const canEdit = !user || (user.role === 'ADMIN' && !!policy && !busy && request?.status === 'ready');
  useEffect(() => {
    if (user) void state.loadOrganizationFeaturePolicy();
  }, [user?.id, user?.organizationId, state.syncSettings.serverUrl]);

  return <section id="sec-funciones" className="space-y-6">
    <div>
      <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Funciones de la aplicación</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-zinc-400">Elige qué funciones forman parte de tu simulador. Su clasificación indica el estado de desarrollo; activar una función puede cambiar los resultados de los proyectos.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-4 text-sm dark:border-zinc-800">
      <div>
        <p className="font-medium text-slate-800 dark:text-zinc-200">{user ? `Configuración de ${user.organizationName || 'la organización'}` : 'Configuración local'}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{user ? (policy ? `Última configuración confirmada · versión ${policy.version}` : 'Modo clásico hasta consultar la política de la empresa.') : 'Guardada en este equipo y disponible sin conexión.'}</p>
      </div>
      {user && <button type="button" onClick={() => void state.loadOrganizationFeaturePolicy()} disabled={busy} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Consultando…' : 'Actualizar'}</button>}
    </div>
    {user && user.role !== 'ADMIN' && <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-zinc-400"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />El administrador define las funciones para todos los miembros de la organización.</p>}
    {request?.status === 'error' && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{request.error} {policy ? 'Se mantiene la última configuración confirmada.' : 'Se mantiene el modo clásico.'}</p>}
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {APPLICATION_FEATURES.map((feature) => <div key={feature.id} className="flex items-start justify-between gap-6 p-5">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2"><h4 id={`feature-title-${feature.id}`} className="text-sm font-semibold text-slate-900 dark:text-white">{feature.title}</h4><span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{({ stable: 'Estable', beta: 'Beta', experimental: 'Experimental' })[feature.stage]}</span></div>
          <p id={`feature-description-${feature.id}`} className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">{feature.description}</p>
          <p className="mt-3 text-xs text-slate-500 dark:text-zinc-400">Desactivada: cálculo clásico de autoconsumo (75% sin baterías, 90% con baterías), sin perfil diurno en los parámetros.</p>
        </div>
        <button type="button" role="switch" aria-checked={settings[feature.id]} aria-labelledby={`feature-title-${feature.id}`} aria-describedby={`feature-description-${feature.id}`} disabled={!canEdit || !feature.available}
          onClick={() => {
            const next = { ...settings, [feature.id]: !settings[feature.id] };
            if (user) void state.saveOrganizationFeaturePolicy(next); else state.setLocalFeatureSettings(next);
          }} className={`mt-1 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${settings[feature.id] ? 'bg-emerald-700' : 'bg-slate-300 ring-1 ring-slate-500 dark:bg-zinc-600 dark:ring-zinc-400'}`}><span className={`h-5 w-5 rounded-full bg-white transition-transform ${settings[feature.id] ? 'translate-x-5' : ''}`} /></button>
      </div>)}
    </div>
  </section>;
}
