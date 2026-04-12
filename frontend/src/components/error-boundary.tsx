"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional custom fallback. If not given, a default "something went wrong" UI is shown. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches React render errors below this boundary so a bad component
 * doesn't crash the entire page to a blank screen.
 *
 * Scope: render-time errors only (React's documented boundary behaviour).
 * Async errors, event handlers, and errors in effects are NOT caught —
 * those are already handled at the call site with try/catch + toast.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console; Sentry on the backend side handles API errors.
    // Frontend Sentry could be added here later if needed.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 p-8">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-rose-500" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
            <p className="text-sm text-slate-500 mt-1">
              We hit an unexpected error rendering this page. Try refreshing — if it keeps happening, please let us know.
            </p>
            {process.env.NODE_ENV !== "production" && (
              <pre className="mt-4 text-left text-xs bg-slate-100 rounded p-3 overflow-auto max-h-40 text-rose-700">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.reset} className="gap-2">
              Try again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
