"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { title: string; children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-lg font-semibold tracking-tight">{this.props.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        {process.env.NODE_ENV === "development" && (
          <pre className="mt-4 overflow-auto rounded-xl border bg-card p-4 font-mono text-[11px]">{error.stack}</pre>
        )}
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  }
}
