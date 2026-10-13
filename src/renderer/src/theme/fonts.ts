export interface FontPreset {
  id: string
  label: string
  stack: string
}

export const UI_FONT_PRESETS: FontPreset[] = [
  {
    id: 'system',
    label: '系统默认',
    stack: "system-ui, 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif"
  },
  {
    id: 'noto',
    label: '思源黑体 / Noto Sans SC',
    stack: "'Noto Sans SC', 'Source Han Sans SC', system-ui, sans-serif"
  },
  {
    id: 'wenkai',
    label: '霞鹜文楷 LXGW WenKai',
    stack: "'LXGW WenKai', 'LXGW WenKai Screen', 'Noto Sans SC', system-ui, sans-serif"
  },
  {
    id: 'yahei',
    label: '微软雅黑 Microsoft YaHei',
    stack: "'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
  },
  {
    id: 'pingfang',
    label: '苹方 PingFang SC',
    stack: "'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
  }
]

export const CODE_FONT_PRESETS: FontPreset[] = [
  {
    id: 'mono',
    label: '系统等宽',
    stack: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace"
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack: "'JetBrains Mono', ui-monospace, monospace"
  },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    stack: "'Cascadia Code', ui-monospace, monospace"
  },
  {
    id: 'fira',
    label: 'Fira Code',
    stack: "'Fira Code', ui-monospace, monospace"
  },
  {
    id: 'sarasa',
    label: '更纱黑体 Sarasa Mono SC',
    stack: "'Sarasa Mono SC', 'Sarasa Mono HC', ui-monospace, monospace"
  }
]

export function findFontPreset(presets: FontPreset[], stack: string): FontPreset | undefined {
  return presets.find((preset) => preset.stack === stack)
}
