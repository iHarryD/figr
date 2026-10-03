import { Component, type ReactNode } from 'react';
import { report, type ReportContext } from '../utilities';

interface Props {
  children: ReactNode;
  label?: string;
  region?: ReportContext['region'];
  screenId?: string | null;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    const { region, screenId } = this.props;
    if (region) report(error, { region, screenId });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
          <span className="text-center text-xs text-panel-muted">
            {this.props.label ?? 'Render error'}
          </span>
          <button
            className="rounded bg-panel-border px-3 py-1.5 text-xs text-panel-text hover:bg-white/10"
            onClick={this.reset}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
