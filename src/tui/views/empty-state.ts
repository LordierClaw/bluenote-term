export interface EmptyStateViewModel {
  title: string
  message: string
  hint?: string
}

export function renderEmptyState(view: EmptyStateViewModel): string {
  return [view.title, "", view.message, ...(view.hint ? [view.hint] : [])].join("\n")
}
