import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled React error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#121214] text-zinc-100 min-h-full">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            {this.props.fallbackTitle || 'Ocurrió un error al cargar la vista'}
          </h2>

          <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
            Se produjo un error inesperado en el renderizado de la interfaz. Los datos de tus proyectos están a salvo.
          </p>

          {this.state.error && (
            <div className="w-full max-w-lg p-3.5 mb-6 rounded-xl bg-[#181820] border border-rose-900/40 text-left overflow-auto max-h-40">
              <p className="text-xs font-mono font-bold text-rose-400 mb-1">
                {this.state.error.name}: {this.state.error.message}
              </p>
              {this.state.error.stack && (
                <pre className="text-[10px] font-mono text-zinc-400 whitespace-pre-wrap">
                  {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center gap-2 shadow-md cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>

            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              className="px-4 py-2 rounded-xl border border-[#3f3f46] hover:bg-[#27272a] text-zinc-200 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              Reiniciar App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
