export type ShellEntry = {
  id: string
  agent: string
  title: string
  command: string
  output: string
  isDone: boolean
  isError: boolean
  isOpen: boolean
  isDescribed?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-shell': { entries: ShellEntry[] }
  }
}
