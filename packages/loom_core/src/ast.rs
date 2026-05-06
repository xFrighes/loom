use serde::{Deserialize, Serialize};
use napi_derive::napi;

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcePosition {
    pub line: u32,
    pub column: u32,
    pub offset: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSpan {
    pub start: SourcePosition,
    pub end: SourcePosition,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoomFile {
    pub span: Option<SourceSpan>,
    pub generics: Option<String>,
    pub meta: Option<Vec<MetaEntry>>,
    pub schema: Option<SchemaZone>,
    pub server: Option<ServerZone>,
    pub tokens: Option<TokenZone>,
    pub props: Option<Vec<PropDecl>>,
    pub state: Option<Vec<StateDecl>>,
    pub computed: Option<Vec<ComputedDecl>>,
    pub on_mount: Option<Vec<LogicStatement>>,
    pub on_update: Option<Vec<LogicStatement>>,
    pub on_unmount: Option<Vec<LogicStatement>>,
    pub logic: Option<LogicZone>,
    pub markup: Option<Vec<MarkupNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaEntry {
    pub span: Option<SourceSpan>,
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaZone {
    pub span: Option<SourceSpan>,
    pub src: String,
    pub declarations: Vec<SchemaDecl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDecl {
    pub span: Option<SourceSpan>,
    pub name: String,
    pub expr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerZone {
    pub span: Option<SourceSpan>,
    pub src: String,
    pub statements: Vec<LogicStatement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenZone {
    pub span: Option<SourceSpan>,
    pub entries: Vec<DesignTokenEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignTokenEntry {
    pub span: Option<SourceSpan>,
    pub path: Vec<String>,
    pub value: String,
    pub theme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropDecl {
    pub span: Option<SourceSpan>,
    pub name: String,
    pub r#type: String,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDecl {
    pub span: Option<SourceSpan>,
    pub name: String,
    pub r#type: String,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputedDecl {
    pub span: Option<SourceSpan>,
    pub name: String,
    pub expr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicZone {
    pub span: Option<SourceSpan>,
    pub lang: String, // "ts" | "js"
    pub src: String,
    pub statements: Vec<LogicStatement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicStatement {
    pub kind: String, // "import" | "export" | "type" | "statement"
    pub src: String,
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MarkupNode {
    Element(ElementNode),
    Text(TextNode),
    If(IfNode),
    ElseIf(ElseIfNode),
    Else(ElseNode),
    Each(EachNode),
    #[serde(rename = "slot-def")]
    SlotDef(SlotDefNode),
    #[serde(rename = "slot-use")]
    SlotUse(SlotUseNode),
    Comment(CommentNode),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementNode {
    pub span: Option<SourceSpan>,
    pub tag: String,
    pub classes: Vec<String>,
    pub id: Option<String>,
    pub data: Option<Vec<DataAttr>>,
    pub styles: Option<Vec<StyleRule>>,
    pub behaviors: Option<Vec<BehaviorBlock>>,
    pub children: Vec<MarkupNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum DataAttr {
    Static {
        span: Option<SourceSpan>,
        name: String,
        value: String,
    },
    Dynamic {
        span: Option<SourceSpan>,
        name: String,
        expr: String,
    },
    Spread {
        span: Option<SourceSpan>,
        expr: String,
    },
    As {
        span: Option<SourceSpan>,
        expr: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StyleRule {
    Decl(CSSDecl),
    Nested(NestedRule),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CSSDecl {
    pub span: Option<SourceSpan>,
    pub prop: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NestedRule {
    pub span: Option<SourceSpan>,
    pub selector: String,
    pub rules: Vec<StyleRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorBlock {
    pub span: Option<SourceSpan>,
    pub event: String,
    pub modifiers: Vec<String>,
    pub body: Vec<LogicStatement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IfNode {
    pub span: Option<SourceSpan>,
    pub condition: String,
    pub consequent: Vec<MarkupNode>,
    pub alternate: Option<Box<MarkupNode>>, // Can be IfNode (ElseIf) or ElseNode
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElseIfNode {
    pub span: Option<SourceSpan>,
    pub condition: String,
    pub consequent: Vec<MarkupNode>,
    pub alternate: Option<Box<MarkupNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElseNode {
    pub span: Option<SourceSpan>,
    pub children: Vec<MarkupNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EachNode {
    pub span: Option<SourceSpan>,
    pub item: String,
    pub index: Option<String>,
    pub list: String,
    pub children: Vec<MarkupNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    pub span: Option<SourceSpan>,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotDefNode {
    pub span: Option<SourceSpan>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotUseNode {
    pub span: Option<SourceSpan>,
    pub name: Option<String>,
    pub children: Vec<MarkupNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentNode {
    pub span: Option<SourceSpan>,
    pub value: String,
}
