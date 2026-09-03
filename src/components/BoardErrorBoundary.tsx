import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class BoardErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Board UI crashed', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="centered error">
          <p>Ошибка на доске: {this.state.error.message}</p>
          <p className="muted">Обновите страницу. Если повторяется — сообщите преподавателю.</p>
        </div>
      )
    }

    return this.props.children
  }
}
