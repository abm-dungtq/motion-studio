// Keeps one failing part from taking the rest down (the guard of public/panels.js:362-363): the part
// shows the Fail text (or its own fallback) and everything else keeps running. resetKey: a new
// value (a new project, a new pick) tries the part again.
import { Component, type ReactNode } from "react";
import { Fail } from "./states.tsx";

interface Props { what: string; children: ReactNode; resetKey?: unknown; fallback?: (error: Error) => ReactNode }
interface State { error: Error | null; key: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return Object.is(props.resetKey, state.key) ? null : { error: null, key: props.resetKey };
  }

  componentDidCatch(error: unknown): void {
    console.error(this.props.what, error);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return this.props.fallback ? this.props.fallback(error) : <Fail error={error} />;
  }
}
