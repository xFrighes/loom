// ─── Top-level file ─────────────────────────────────────────────────────────

export type SourcePosition = {
  line: number
  column: number
  offset: number
}

export type SourceSpan = {
  start: SourcePosition
  end: SourcePosition
}

export type LoomFile = {
  span?: SourceSpan
  generics?: string // raw generic params, e.g. "<T extends Record<string, any>>"
  props?: PropDecl[]
  logic?: LogicZone
  markup?: MarkupNode[]
}

export type PropDecl = {
  span?: SourceSpan
  name: string
  type: string
  defaultValue?: string
}

export type LogicZone = {
  span?: SourceSpan
  lang: 'ts' | 'js'
  src: string
}

// ─── Markup nodes ────────────────────────────────────────────────────────────

export type MarkupNode =
  | ElementNode
  | TextNode
  | ControlNode
  | EachNode
  | SlotDefNode
  | SlotUseNode
  | CommentNode

export type ElementNode = {
  span?: SourceSpan
  kind: 'element'
  tag: string // 'div', 'element' (polymorphic), 'UserCard' (component), etc.
  classes: string[]
  id?: string
  data?: DataAttr[]
  styles?: StyleBlock
  behaviors?: BehaviorBlock[]
  children: MarkupNode[]
}

// ─── Data dimension (:) ──────────────────────────────────────────────────────

export type DataAttr =
  | { kind: 'static'; span?: SourceSpan; name: string; value: string }
  | { kind: 'dynamic'; span?: SourceSpan; name: string; expr: string }
  | { kind: 'spread'; span?: SourceSpan; expr: string }
  | { kind: 'as'; span?: SourceSpan; expr: string } // polymorphic element tag expression

// ─── Style dimension (::) ────────────────────────────────────────────────────

export type StyleBlock = StyleRule[]

export type StyleRule =
  | CSSDecl
  | NestedRule

/** A single CSS property declaration, e.g. `padding 1.5rem` */
export type CSSDecl = {
  span?: SourceSpan
  kind: 'decl'
  prop: string
  value: string
}

/** A nested rule block: `&:hover`, `@media (...)`, `:global(.cls)` etc. */
export type NestedRule = {
  span?: SourceSpan
  kind: 'nested'
  selector: string // e.g. "&:hover", "@media (max-width: 768px)", ":global(.dark-mode) &"
  rules: StyleRule[]
}

// ─── Behavior dimension (@) ──────────────────────────────────────────────────

export type BehaviorBlock = {
  span?: SourceSpan
  event: string // e.g. "click", "submit", "keyup"
  modifiers: string[] // e.g. ["prevent", "stop"], ["enter"] for keyup.enter
  body: string // raw JS/TS statements
}

// ─── Control flow ────────────────────────────────────────────────────────────

export type ControlNode =
  | IfNode
  | ElseIfNode
  | ElseNode

export type IfNode = {
  span?: SourceSpan
  kind: 'if'
  condition: string
  consequent: MarkupNode[]
  alternate?: ControlNode | ElseNode
}

export type ElseIfNode = {
  span?: SourceSpan
  kind: 'elseif'
  condition: string
  consequent: MarkupNode[]
  alternate?: ControlNode | ElseNode
}

export type ElseNode = {
  span?: SourceSpan
  kind: 'else'
  children: MarkupNode[]
}

export type EachNode = {
  span?: SourceSpan
  kind: 'each'
  item: string
  index?: string
  list: string
  children: MarkupNode[]
}

// ─── Leaf nodes ──────────────────────────────────────────────────────────────

/** Plain text / inline HTML text node */
export type TextNode = {
  span?: SourceSpan
  kind: 'text'
  value: string
}

/** `slot` or `slot:name` used inside a component definition as a render placeholder */
export type SlotDefNode = {
  span?: SourceSpan
  kind: 'slot-def'
  name?: string // undefined = default slot
}

/** `slot:name` used when *calling* a component — wraps content for a named slot */
export type SlotUseNode = {
  span?: SourceSpan
  kind: 'slot-use'
  name?: string // undefined = default children
  children: MarkupNode[]
}

export type CommentNode = {
  span?: SourceSpan
  kind: 'comment'
  value: string
}
