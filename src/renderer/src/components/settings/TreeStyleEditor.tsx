import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type {
  TreeEdgeDash,
  TreeEdgeStyle,
  TreeNodeStyle,
  TreeStylePreferences
} from '@shared/types'
import { DEFAULT_TREE_STYLE } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { UI_FONT_PRESETS } from '../../theme/fonts'
import { ColorField, FontPicker, RangeField, SelectField } from './controls'

const NODE_KINDS: Array<{ id: 'root' | 'child' | 'cluster'; label: string }> = [
  { id: 'root', label: '根节点' },
  { id: 'child', label: '普通节点' },
  { id: 'cluster', label: '主题簇' }
]

const EDGE_KINDS: Array<{ id: 'normal' | 'main' | 'current'; label: string }> = [
  { id: 'normal', label: '普通连线' },
  { id: 'main', label: '主分支连线' },
  { id: 'current', label: '当前路径连线' }
]

const WEIGHT_OPTIONS = [
  { value: '0', label: '默认' },
  { value: '400', label: '常规' },
  { value: '500', label: '中等' },
  { value: '600', label: '半粗' },
  { value: '700', label: '加粗' }
]

const DASH_OPTIONS: Array<{ value: TreeEdgeDash; label: string }> = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' }
]

export function TreeStyleEditor() {
  const preferences = useAppStore((state) => state.preferences)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const [nodeKind, setNodeKind] = useState<'root' | 'child' | 'cluster'>('root')
  const tree = preferences.tree
  const style = tree.style

  const updateStyle = (patch: Partial<TreeStylePreferences>) => {
    void setPreferences({ tree: { ...tree, style: { ...style, ...patch } } })
  }

  const nodeStyle = style[nodeKind]
  const updateNode = (patch: Partial<TreeNodeStyle>) => {
    updateStyle({ [nodeKind]: { ...nodeStyle, ...patch } })
  }
  const updateEdge = (kind: 'normal' | 'main' | 'current', patch: Partial<TreeEdgeStyle>) => {
    updateStyle({ edges: { ...style.edges, [kind]: { ...style.edges[kind], ...patch } } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {NODE_KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              onClick={() => setNodeKind(kind.id)}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                nodeKind === kind.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-fg-muted hover:bg-card-muted'
              }`}
            >
              {kind.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="背景色"
            value={nodeStyle.background}
            onChange={(background) => updateNode({ background })}
          />
          <ColorField
            label="边框色"
            value={nodeStyle.border}
            onChange={(border) => updateNode({ border })}
          />
          <ColorField
            label="文字色"
            value={nodeStyle.text}
            onChange={(text) => updateNode({ text })}
          />
          <div className="flex items-end">
            <SelectField
              label="字重"
              value={String(nodeStyle.fontWeight)}
              options={WEIGHT_OPTIONS}
              onChange={(value) => updateNode({ fontWeight: Number(value) })}
            />
          </div>
          <FontPicker
            label="节点字体"
            presets={UI_FONT_PRESETS}
            value={nodeStyle.fontFamily}
            emptyLabel="跟随界面字体"
            onChange={(fontFamily) => updateNode({ fontFamily })}
          />
          <div className="flex items-end">
            <RangeField
              label="字号"
              value={nodeStyle.fontSize}
              min={0}
              max={24}
              format={(value) => (value === 0 ? '默认 (12)' : `${value}px`)}
              onChange={(fontSize) => updateNode({ fontSize })}
            />
          </div>
          <RangeField
            label="节点透明度"
            value={nodeStyle.opacity}
            min={20}
            max={100}
            format={(value) => `${value}%`}
            onChange={(opacity) => updateNode({ opacity })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-fg-muted">高亮样式</span>
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="主分支节点边框"
            value={style.mainNode.border}
            onChange={(border) => updateStyle({ mainNode: { border } })}
          />
          <ColorField
            label="当前节点描边"
            value={style.currentNode.border}
            onChange={(border) => updateStyle({ currentNode: { border } })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-fg-muted">连线样式</span>
        {EDGE_KINDS.map((kind) => {
          const edge = style.edges[kind.id]
          return (
            <div key={kind.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <ColorField
                label={kind.label}
                value={edge.color}
                onChange={(color) => updateEdge(kind.id, { color })}
              />
              <RangeField
                label="粗细"
                value={edge.width}
                min={0}
                max={8}
                format={(value) => (value === 0 ? '默认' : `${value}px`)}
                onChange={(width) => updateEdge(kind.id, { width })}
              />
              <SelectField
                label=""
                value={edge.dash}
                options={DASH_OPTIONS}
                onChange={(dash) => updateEdge(kind.id, { dash })}
              />
            </div>
          )
        })}
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            void setPreferences({
              tree: {
                ...tree,
                style: {
                  ...DEFAULT_TREE_STYLE,
                  root: { ...DEFAULT_TREE_STYLE.root },
                  child: { ...DEFAULT_TREE_STYLE.child },
                  cluster: { ...DEFAULT_TREE_STYLE.cluster },
                  edges: {
                    normal: { ...DEFAULT_TREE_STYLE.edges.normal },
                    main: { ...DEFAULT_TREE_STYLE.edges.main },
                    current: { ...DEFAULT_TREE_STYLE.edges.current }
                  }
                }
              }
            })
          }}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-card-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置树样式
        </button>
      </div>
    </div>
  )
}
