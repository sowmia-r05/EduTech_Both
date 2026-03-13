/**
 * ErrorBoundary.jsx
 * ✅ Issue #7: Prevents blank white-screen crashes from unhandled React errors.
 * Place in: naplan-frontend/src/app/components/common/ErrorBoundary.jsx
 *
 * Usage in App.jsx:
 *   <ErrorBoundary>              — for parent routes
 *   <ErrorBoundary variant="child"> — for child routes (kid-friendly emoji UI)
 */
import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => this.setState({ hasError: false, error: null, errorInfo: null });
  handleGoHome = () => { this.setState({ hasError: false, error: null, errorInfo: null }); window.location.href = "/"; };
  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;
    const isChild = this.props.variant === "child";

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
          <div className={`px-6 py-5 text-center ${isChild ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-red-500 to-rose-600"}`}>
            <div className="text-4xl mb-2">{isChild ? "🙈" : "⚠️"}</div>
            <h1 className="text-xl font-bold text-white">{isChild ? "Oops! Something broke" : "Something went wrong"}</h1>
          </div>
          <div className="p-6 space-y-4 text-center">
            <p className="text-slate-600 text-sm">{isChild ? "Don't worry — nothing is lost! Let's try again." : "An unexpected error occurred. Your data is safe."}</p>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mt-3">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Error details (dev only)</summary>
                <pre className="mt-2 p-3 bg-slate-100 rounded-lg text-xs text-red-700 overflow-auto max-h-40 whitespace-pre-wrap">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack && `\n\nComponent Stack:${this.state.errorInfo.componentStack}`}
                </pre>
              </details>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={this.handleReset} className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">Try Again</button>
              <button onClick={this.handleReload} className="w-full px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50">Reload Page</button>
              <button onClick={this.handleGoHome} className="w-full px-4 py-2.5 text-slate-500 text-sm hover:text-slate-700">{isChild ? "Go to Login" : "Go to Home"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
