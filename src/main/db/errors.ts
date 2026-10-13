export class BranchPointProtectedError extends Error {
  readonly branchCardTitle: string

  constructor(branchCardTitle: string) {
    super(`该轮对话是分支卡片「${branchCardTitle}」的分支点，无法删除`)
    this.name = 'BranchPointProtectedError'
    this.branchCardTitle = branchCardTitle
  }
}
