use crate::ast::*;
use crate::expr::*;
use crate::lexer::{Token, TK};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub span: SourceSpan,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Line {}:{}: {}", self.span.start.line, self.span.start.column, self.message)
    }
}

impl std::error::Error for ParseError {}

struct TokenStream {
    tokens: Vec<Token>,
    pos: usize,
}

impl TokenStream {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self, offset: usize) -> &Token {
        let idx = std::cmp::min(self.pos + offset, self.tokens.len() - 1);
        &self.tokens[idx]
    }

    fn consume(&mut self) -> Token {
        let t = self.tokens[self.pos].clone();
        if self.pos < self.tokens.len() - 1 {
            self.pos += 1;
        }
        t
    }

    fn skip_newlines(&mut self) {
        while self.peek(0).r#type == TK::Newline {
            self.consume();
        }
    }

    fn is(&self, r#type: TK, offset: usize) -> bool {
        self.peek(offset).r#type == r#type
    }

    fn expect(&mut self, r#type: TK) -> Result<Token, ParseError> {
        let t = self.peek(0);
        if t.r#type != r#type {
            return Err(ParseError {
                message: format!("Expected {:?} but got {:?} (\"{}\")", r#type, t.r#type, t.value),
                span: t.span.clone(),
            });
        }
        Ok(self.consume())
    }
}

fn merge_spans(spans: Vec<Option<SourceSpan>>) -> Option<SourceSpan> {
    let defined: Vec<SourceSpan> = spans.into_iter().flatten().collect();
    if defined.is_empty() {
        return None;
    }

    let mut start = defined[0].start.clone();
    let mut end = defined[0].end.clone();

    for span in defined.iter().skip(1) {
        if span.start.offset < start.offset {
            start = span.start.clone();
        }
        if span.end.offset > end.offset {
            end = span.end.clone();
        }
    }

    Some(SourceSpan { start, end })
}

fn span_from_nodes<T: HasSpan>(nodes: &[T]) -> Option<SourceSpan> {
    merge_spans(nodes.iter().map(|n| n.span()).collect())
}

trait HasSpan {
    fn span(&self) -> Option<SourceSpan>;
}

impl HasSpan for MarkupNode {
    fn span(&self) -> Option<SourceSpan> {
        match self {
            MarkupNode::Element(n) => n.span.clone(),
            MarkupNode::Text(n) => n.span.clone(),
            MarkupNode::If(n) => n.span.clone(),
            MarkupNode::ElseIf(n) => n.span.clone(),
            MarkupNode::Else(n) => n.span.clone(),
            MarkupNode::Each(n) => n.span.clone(),
            MarkupNode::SlotDef(n) => n.span.clone(),
            MarkupNode::SlotUse(n) => n.span.clone(),
            MarkupNode::Comment(n) => n.span.clone(),
        }
    }
}

impl HasSpan for DataAttr {
    fn span(&self) -> Option<SourceSpan> {
        match self {
            DataAttr::Static { span, .. } => span.clone(),
            DataAttr::Dynamic { span, .. } => span.clone(),
            DataAttr::Spread { span, .. } => span.clone(),
            DataAttr::As { span, .. } => span.clone(),
        }
    }
}

impl HasSpan for StyleRule {
    fn span(&self) -> Option<SourceSpan> {
        match self {
            StyleRule::Decl(n) => n.span.clone(),
            StyleRule::Nested(n) => n.span.clone(),
        }
    }
}

impl HasSpan for BehaviorBlock { fn span(&self) -> Option<SourceSpan> { self.span.clone() } }
impl HasSpan for PropDecl { fn span(&self) -> Option<SourceSpan> { self.span.clone() } }
impl HasSpan for StateDecl { fn span(&self) -> Option<SourceSpan> { self.span.clone() } }
impl HasSpan for ComputedDecl { fn span(&self) -> Option<SourceSpan> { self.span.clone() } }
impl HasSpan for LogicStatement { fn span(&self) -> Option<SourceSpan> { self.span.clone() } }

// ─── Logic IR Parser ─────────────────────────────────────────────────────────

// For now, we'll implement a simplified version of parse_logic.
// Full TS parsing would require a Rust-based TS parser (like swc_ecma_parser),
// but we might just want to handle it as raw blocks for now if the goal is functional parity with TS
// and the TS version uses the TS compiler API.
// The prompt says "Implement diagnostic parity".
fn parse_logic(src: &str, _lang: &str, base_span: Option<SourceSpan>) -> Vec<LogicStatement> {
    if src.trim().is_empty() {
        return Vec::new();
    }
    
    let mut statements = Vec::new();
    let mut current_block = Vec::new();

    let mut flush = |block: &mut Vec<&str>| {
        if block.is_empty() { return; }
        let first_trimmed = block[0].trim();
        let kind = if first_trimmed.starts_with("import ") {
            "import"
        } else if first_trimmed.starts_with("export ") {
            "export"
        } else if first_trimmed.starts_with("type ") || first_trimmed.starts_with("interface ") {
            "type"
        } else {
            "statement"
        };

        statements.push(LogicStatement {
            kind: kind.to_string(),
            src: block.join("\n"),
            span: base_span.clone(),
        });
        block.clear();
    };

    for line_src in src.lines() {
        let trimmed = line_src.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            if !current_block.is_empty() {
                current_block.push(line_src);
            }
            continue;
        }

        if trimmed.starts_with("import ") || 
           trimmed.starts_with("export ") || 
           trimmed.starts_with("type ") || 
           trimmed.starts_with("interface ") {
            flush(&mut current_block);
            current_block.push(line_src);
            flush(&mut current_block);
        } else {
            current_block.push(line_src);
        }
    }

    flush(&mut current_block);
    statements
}

// ─── Public entry point ──────────────────────────────────────────────────────

pub fn parse(src: &str) -> Result<LoomFile, ParseError> {
    let lex_result = crate::tokenize(src);
    if !lex_result.errors.is_empty() {
        let err = &lex_result.errors[0];
        return Err(ParseError {
            message: err.message.clone(),
            span: err.span.clone().unwrap_or(SourceSpan {
                start: SourcePosition { line: err.line, column: 1, offset: 0 },
                end: SourcePosition { line: err.line, column: 1, offset: 0 },
            }),
        });
    }

    let mut stream = TokenStream::new(lex_result.tokens);
    parse_file(&mut stream)
}

fn parse_file(s: &mut TokenStream) -> Result<LoomFile, ParseError> {
    let mut file = LoomFile::default();
    let mut raw_zones: HashMap<String, Vec<Token>> = HashMap::new();

    while !s.is(TK::Eof, 0) {
        s.skip_newlines();
        if s.is(TK::Eof, 0) { break; }

        if s.is(TK::ContextSwitch, 0) {
            let switch_tok = s.consume();
            let zone_name = switch_tok.value.clone();

            if zone_name == "pug" {
                if file.markup.is_some() {
                    return Err(ParseError { message: format!("Duplicate top-level zone: {}", zone_name), span: switch_tok.span });
                }
                s.skip_newlines();
                if s.is(TK::Indent, 0) {
                    s.consume();
                    file.markup = Some(parse_markup_children(s, 0)?);
                    if s.is(TK::Dedent, 0) { s.consume(); }
                } else {
                    file.markup = Some(parse_markup_children(s, 0)?);
                }
            } else {
                let existing_logic_zone = if zone_name == "ts" { Some("js") } else if zone_name == "js" { Some("ts") } else { None };
                if raw_zones.contains_key(&zone_name) || (existing_logic_zone.is_some() && raw_zones.contains_key(existing_logic_zone.unwrap())) {
                     return Err(ParseError { message: format!("Duplicate top-level zone: {}", zone_name), span: switch_tok.span });
                }
                let mut lines = Vec::new();
                while !s.is(TK::Eof, 0) && !s.is(TK::ContextSwitch, 0) {
                    lines.push(s.consume());
                }
                raw_zones.insert(zone_name, lines);
            }
        } else {
            let markup = parse_markup_children(s, 0)?;
            if let Some(existing) = &mut file.markup {
                existing.extend(markup);
            } else {
                file.markup = Some(markup);
            }
        }
    }

    if let Some(tokens) = raw_zones.get("generics") {
        file.generics = Some(join_raw_zone(tokens).trim().to_string());
        file.span = merge_spans(vec![file.span.clone(), merge_spans(tokens.iter().map(|t| Some(t.span.clone())).collect())]);
    }

    if let Some(tokens) = raw_zones.get("props") {
        file.props = Some(parse_props_zone(tokens));
    }

    if let Some(tokens) = raw_zones.get("state") {
        file.state = Some(parse_state_zone(tokens));
    }

    if let Some(tokens) = raw_zones.get("computed") {
        file.computed = Some(parse_computed_zone(tokens)?);
    }

    if let Some(tokens) = raw_zones.get("onMount") {
        let trimmed = trim_trailing_blank_tokens(tokens);
        file.on_mount = Some(parse_logic(&join_raw_zone(trimmed), "ts", merge_spans(trimmed.iter().map(|t| Some(t.span.clone())).collect())));
    }
    
    if let Some(tokens) = raw_zones.get("onUpdate") {
        let trimmed = trim_trailing_blank_tokens(tokens);
        file.on_update = Some(parse_logic(&join_raw_zone(trimmed), "ts", merge_spans(trimmed.iter().map(|t| Some(t.span.clone())).collect())));
    }

    if let Some(tokens) = raw_zones.get("onUnmount") {
        let trimmed = trim_trailing_blank_tokens(tokens);
        file.on_unmount = Some(parse_logic(&join_raw_zone(trimmed), "ts", merge_spans(trimmed.iter().map(|t| Some(t.span.clone())).collect())));
    }

    if let Some(tokens) = raw_zones.get("ts") {
        let trimmed = trim_trailing_blank_tokens(tokens);
        let src = join_raw_zone(trimmed);
        let span = merge_spans(trimmed.iter().map(|t| Some(t.span.clone())).collect());
        file.logic = Some(LogicZone {
            lang: "ts".to_string(),
            src: src.clone(),
            statements: parse_logic(&src, "ts", span.clone()),
            span,
        });
    } else if let Some(tokens) = raw_zones.get("js") {
        let trimmed = trim_trailing_blank_tokens(tokens);
        let src = join_raw_zone(trimmed);
        let span = merge_spans(trimmed.iter().map(|t| Some(t.span.clone())).collect());
        file.logic = Some(LogicZone {
            lang: "js".to_string(),
            src: src.clone(),
            statements: parse_logic(&src, "js", span.clone()),
            span,
        });
    }

    file.span = merge_spans(vec![
        file.span,
        span_from_nodes(file.props.as_ref().unwrap_or(&vec![])),
        span_from_nodes(file.state.as_ref().unwrap_or(&vec![])),
        span_from_nodes(file.computed.as_ref().unwrap_or(&vec![])),
        file.logic.as_ref().and_then(|l| l.span.clone()),
        span_from_nodes(file.markup.as_ref().unwrap_or(&vec![])),
    ]);

    Ok(file)
}

fn trim_trailing_blank_tokens(lines: &[Token]) -> &[Token] {
    let mut end = lines.len();
    while end > 0 && lines[end - 1].value.trim().is_empty() {
        end -= 1;
    }
    &lines[..end]
}

fn join_raw_zone(lines: &[Token]) -> String {
    lines.iter().map(|t| t.value.as_str()).collect::<Vec<&str>>().join("\n")
}

// ─── State zone parser ────────────────────────────────────────────────────────

fn parse_state_zone(lines: &[Token]) -> Vec<StateDecl> {
    let mut states = Vec::new();
    for line in lines {
        let trimmed = line.value.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") { continue; }

        let eq_idx = find_top_level_equals(trimmed);
        let type_part;
        let mut default_value = None;

        if eq_idx != -1 {
            type_part = trimmed[..eq_idx as usize].trim();
            default_value = Some(trimmed[(eq_idx + 1) as usize..].trim().to_string());
        } else {
            type_part = trimmed;
        }

        let colon_idx_raw = crate::expr::find_top_level_colon(type_part);
        let colon_idx = if colon_idx_raw != -1 { Some(colon_idx_raw as usize) } else { None };
        if let Some(idx) = colon_idx {
            let name = type_part[..idx].trim().to_string();
            let r#type = type_part[idx + 1..].trim().to_string();
            states.push(StateDecl { span: Some(line.span.clone()), name, r#type, default_value });
        } else {
            states.push(StateDecl { span: Some(line.span.clone()), name: type_part.trim().to_string(), r#type: "any".to_string(), default_value });
        }
    }
    states
}

// ─── Computed zone parser ─────────────────────────────────────────────────────

fn parse_computed_zone(lines: &[Token]) -> Result<Vec<ComputedDecl>, ParseError> {
    let mut computed = Vec::new();
    for line in lines {
        let trimmed = line.value.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") { continue; }

        let eq_idx = find_top_level_equals(trimmed);
        let colon_idx = crate::expr::find_top_level_colon(trimmed) as i32;
        let split_idx = if eq_idx != -1 { eq_idx } else { colon_idx as isize };

        if split_idx == -1 {
            return Err(ParseError { message: format!("Malformed computed declaration: \"{}\"", trimmed), span: line.span.clone() });
        }

        let name = trimmed[..split_idx as usize].trim().to_string();
        let expr = trimmed[(split_idx + 1) as usize..].trim().to_string();
        computed.push(ComputedDecl { span: Some(line.span.clone()), name, expr });
    }
    Ok(computed)
}

// ─── Props zone parser ────────────────────────────────────────────────────────

fn parse_props_zone(lines: &[Token]) -> Vec<PropDecl> {
    let mut props = Vec::new();
    for line in lines {
        let trimmed = line.value.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") { continue; }

        let eq_idx = find_top_level_equals(trimmed);
        let type_part;
        let mut default_value = None;

        if eq_idx != -1 {
            type_part = trimmed[..eq_idx as usize].trim();
            default_value = Some(trimmed[(eq_idx + 1) as usize..].trim().to_string());
        } else {
            type_part = trimmed;
        }

        let colon_idx_raw = crate::expr::find_top_level_colon(type_part);
        let colon_idx = if colon_idx_raw != -1 { Some(colon_idx_raw as usize) } else { None };
        if let Some(idx) = colon_idx {
            let name = type_part[..idx].trim().to_string();
            let r#type = type_part[idx + 1..].trim().to_string();
            props.push(PropDecl { span: Some(line.span.clone()), name, r#type, default_value });
        } else {
            props.push(PropDecl { span: Some(line.span.clone()), name: type_part.trim().to_string(), r#type: "any".to_string(), default_value });
        }
    }
    props
}

// ─── Markup parser ────────────────────────────────────────────────────────────

fn parse_markup_children(s: &mut TokenStream, base_indent: u32) -> Result<Vec<MarkupNode>, ParseError> {
    parse_markup_children_with_options(s, base_indent, false)
}

fn parse_markup_children_with_options(
    s: &mut TokenStream,
    base_indent: u32,
    allow_control_continuation: bool,
) -> Result<Vec<MarkupNode>, ParseError> {
    let mut nodes = Vec::new();

    loop {
        s.skip_newlines();
        if s.is(TK::Eof, 0) || s.is(TK::ContextSwitch, 0) { break; }
        if s.is(TK::Dedent, 0) { break; }

        let tok = s.peek(0);
        if tok.indent < base_indent { break; }

        match tok.r#type {
            TK::Comment => {
                let t = s.consume();
                nodes.push(MarkupNode::Comment(CommentNode { value: t.value, span: Some(t.span) }));
            }
            TK::ControlIf => {
                nodes.push(parse_if(s)?);
            }
            TK::ControlElseIf | TK::ControlElse => {
                if allow_control_continuation { return Ok(nodes); }
                if tok.r#type == TK::ControlElseIf {
                    nodes.push(MarkupNode::ElseIf(parse_else_if(s)?));
                } else {
                    nodes.push(MarkupNode::Else(parse_else_node(s)?));
                }
            }
            TK::ControlEach => {
                nodes.push(parse_each(s)?);
            }
            TK::Slot => {
                nodes.push(parse_slot(s)?);
            }
            TK::Tag | TK::Component => {
                let node = parse_element(s)?;
                nodes.push(MarkupNode::Element(node));
            }
            TK::Text => {
                let t = s.consume();
                nodes.push(MarkupNode::Text(TextNode { value: t.value, span: Some(t.span) }));
            }
            _ => {
                s.consume();
            }
        }
    }

    Ok(nodes)
}

fn parse_element(s: &mut TokenStream) -> Result<ElementNode, ParseError> {
    let tag_tok = s.consume();
    let res = parse_tag_selector(&tag_tok.value, Some(tag_tok.span.clone()));
    let elem_indent = tag_tok.indent;

    let mut node = ElementNode {
        span: Some(tag_tok.span),
        tag: res.tag,
        classes: res.classes,
        id: res.id,
        data: None,
        styles: None,
        behaviors: None,
        children: Vec::new(),
    };

    if let Some(it) = res.inline_text {
        node.children.push(MarkupNode::Text(TextNode { value: it.value, span: Some(it.span) }));
    }

    s.skip_newlines();
    if s.is(TK::Indent, 0) {
        s.consume();
        parse_dimensions_and_children(s, &mut node, elem_indent)?;
        if s.is(TK::Dedent, 0) { s.consume(); }
    }

    node.span = merge_spans(vec![
        node.span,
        span_from_nodes(node.data.as_ref().unwrap_or(&vec![])),
        span_from_nodes(node.styles.as_ref().unwrap_or(&vec![])),
        span_from_nodes(node.behaviors.as_ref().unwrap_or(&vec![])),
        span_from_nodes(&node.children),
    ]);

    Ok(node)
}

fn parse_dimensions_and_children(s: &mut TokenStream, node: &mut ElementNode, _parent_indent: u32) -> Result<(), ParseError> {
    loop {
        s.skip_newlines();
        if s.is(TK::Eof, 0) || s.is(TK::Dedent, 0) || s.is(TK::ContextSwitch, 0) { break; }

        let tok = s.peek(0);
        match tok.r#type {
            TK::DimensionData => {
                s.consume();
                node.data = Some(parse_data_dimension(s)?);
            }
            TK::DimensionStyle => {
                s.consume();
                node.styles = Some(parse_style_dimension(s)?);
            }
            TK::DimensionBehavior => {
                if node.behaviors.is_none() { node.behaviors = Some(Vec::new()); }
                node.behaviors.as_mut().unwrap().push(parse_behavior_dimension(s)?);
            }
            _ => {
                let children = parse_markup_children(s, tok.indent)?;
                node.children.extend(children);
                break;
            }
        }
    }
    Ok(())
}

struct TagSelectorResult {
    tag: String,
    classes: Vec<String>,
    id: Option<String>,
    inline_text: Option<InlineText>,
}

struct InlineText {
    value: String,
    span: SourceSpan,
}

fn parse_tag_selector(raw: &str, line_span: Option<SourceSpan>) -> TagSelectorResult {
    let mut selector_end = raw.len();
    if let Some(idx) = raw.find(' ') {
        selector_end = idx;
    }

    let selector = &raw[..selector_end];
    let inline_text_raw = &raw[selector_end..];
    let inline_text_value = inline_text_raw.trim();
    
    let inline_text = if !inline_text_value.is_empty() && line_span.is_some() {
        let span = line_span.as_ref().unwrap();
        let start_idx = inline_text_raw.find(inline_text_value).unwrap();
        let offset = selector_end + start_idx;
        Some(InlineText {
            value: inline_text_value.to_string(),
            span: SourceSpan {
                start: SourcePosition {
                    line: span.start.line,
                    column: span.start.column + offset as u32,
                    offset: span.start.offset + offset as u32,
                },
                end: span.end.clone(),
            },
        })
    } else {
        None
    };

    // Simple split by . and #
    // This is a bit simplified compared to TS regex but should work for now
    let mut tag = String::new();
    let mut classes = Vec::new();
    let mut id = None;
    
    let mut current = String::new();
    let mut mode = 0; // 0: tag, 1: class, 2: id
    
    for c in selector.chars() {
        if c == '.' {
            match mode {
                0 => tag = current.clone(),
                1 => classes.push(current.clone()),
                2 => id = Some(current.clone()),
                _ => {}
            }
            current = String::new();
            mode = 1;
        } else if c == '#' {
            match mode {
                0 => tag = current.clone(),
                1 => classes.push(current.clone()),
                2 => id = Some(current.clone()),
                _ => {}
            }
            current = String::new();
            mode = 2;
        } else {
            current.push(c);
        }
    }
    
    match mode {
        0 => tag = current,
        1 => classes.push(current),
        2 => id = Some(current),
        _ => {}
    }

    if tag.is_empty() || tag == "." || tag == "#" { tag = "div".to_string(); }

    TagSelectorResult { tag, classes, id, inline_text }
}

fn parse_data_dimension(s: &mut TokenStream) -> Result<Vec<DataAttr>, ParseError> {
    let mut attrs = Vec::new();
    s.skip_newlines();
    if !s.is(TK::Indent, 0) { return Ok(attrs); }
    s.consume();

    while !s.is(TK::Dedent, 0) && !s.is(TK::Eof, 0) {
        s.skip_newlines();
        if s.is(TK::Dedent, 0) || s.is(TK::Eof, 0) { break; }

        let tok = s.consume();
        let line = tok.value.trim();
        if line.is_empty() { continue; }

        if line.starts_with("...") {
            attrs.push(DataAttr::Spread { expr: line[3..].to_string(), span: Some(tok.span) });
            continue;
        }

        if line.starts_with("as ") {
            if let Some(expr) = unwrap_balanced_braces(&line[3..]) {
                attrs.push(DataAttr::As { expr, span: Some(tok.span) });
                continue;
            }
        }

        let space_idx = find_top_level_whitespace(line);
        if space_idx != -1 {
            let name = line[..space_idx as usize].to_string();
            let value = line[(space_idx + 1) as usize..].trim();
            if let Some(expr) = unwrap_balanced_braces(value) {
                attrs.push(DataAttr::Dynamic { name, expr, span: Some(tok.span) });
                continue;
            }
            if value.starts_with('"') && value.ends_with('"') {
                attrs.push(DataAttr::Static { name, value: value[1..value.len()-1].to_string(), span: Some(tok.span) });
                continue;
            }
            attrs.push(DataAttr::Static { name, value: value.to_string(), span: Some(tok.span) });
            continue;
        }

        attrs.push(DataAttr::Static { name: line.to_string(), value: String::new(), span: Some(tok.span) });
    }

    if s.is(TK::Dedent, 0) { s.consume(); }
    Ok(attrs)
}

fn parse_style_dimension(s: &mut TokenStream) -> Result<Vec<StyleRule>, ParseError> {
    let mut rules = Vec::new();
    s.skip_newlines();
    if !s.is(TK::Indent, 0) { return Ok(rules); }
    s.consume();
    rules = parse_style_rules(s)?;
    if s.is(TK::Dedent, 0) { s.consume(); }
    Ok(rules)
}

fn parse_style_rules(s: &mut TokenStream) -> Result<Vec<StyleRule>, ParseError> {
    let mut rules = Vec::new();

    while !s.is(TK::Dedent, 0) && !s.is(TK::Eof, 0) {
        s.skip_newlines();
        if s.is(TK::Dedent, 0) || s.is(TK::Eof, 0) { break; }

        let tok = s.peek(0);
        let line = tok.value.trim().to_string();
        if line.is_empty() { s.consume(); continue; }

        if line.starts_with('&') || line.starts_with('@') || line.starts_with(":global") {
            let sel_tok = s.consume();
            s.skip_newlines();
            let mut nested_rules = Vec::new();
            if s.is(TK::Indent, 0) {
                s.consume();
                nested_rules = parse_style_rules(s)?;
                if s.is(TK::Dedent, 0) { s.consume(); }
            }
            rules.push(StyleRule::Nested(NestedRule {
                span: merge_spans(vec![Some(sel_tok.span), span_from_nodes(&nested_rules)]),
                selector: line,
                rules: nested_rules,
            }));
        } else {
            let decl_tok = s.consume();
            let space_idx = find_top_level_whitespace(&line);
            if space_idx != -1 {
                rules.push(StyleRule::Decl(CSSDecl {
                    span: Some(decl_tok.span),
                    prop: line[..space_idx as usize].to_string(),
                    value: line[(space_idx + 1) as usize..].trim().to_string(),
                }));
            }
        }
    }

    Ok(rules)
}

fn parse_behavior_dimension(s: &mut TokenStream) -> Result<BehaviorBlock, ParseError> {
    let tok = s.consume();
    let raw = &tok.value[1..];
    let parts: Vec<&str> = raw.split('.').collect();
    let event = parts[0].to_string();
    let modifiers = parts.iter().skip(1).map(|s| s.to_string()).collect();

    let mut body_lines = Vec::new();
    let mut body_spans = Vec::new();
    s.skip_newlines();
    if s.is(TK::Indent, 0) {
        s.consume();
        while !s.is(TK::Dedent, 0) && !s.is(TK::Eof, 0) {
            if s.is(TK::Newline, 0) {
                body_lines.push("".to_string());
                body_spans.push(Some(s.consume().span));
                continue;
            }
            let t = s.consume();
            body_lines.push(t.value);
            body_spans.push(Some(t.span));
        }
        if s.is(TK::Dedent, 0) { s.consume(); }
    }

    let body_src = trim_trailing_blank_lines(&body_lines).join("\n");
    let span = merge_spans(vec![Some(tok.span), merge_spans(body_spans)]);
    Ok(BehaviorBlock {
        event,
        modifiers,
        body: parse_logic(&body_src, "ts", span.clone()),
        span,
    })
}

fn trim_trailing_blank_lines(lines: &[String]) -> &[String] {
    let mut end = lines.len();
    while end > 0 && lines[end - 1].trim().is_empty() {
        end -= 1;
    }
    &lines[..end]
}

// ─── Control flow parsers ─────────────────────────────────────────────────────

fn parse_if(s: &mut TokenStream) -> Result<MarkupNode, ParseError> {
    let tok = s.consume();
    let condition = tok.value.strip_prefix("if").unwrap_or(&tok.value).trim().to_string();

    s.skip_newlines();
    let mut consequent = Vec::new();
    if s.is(TK::Indent, 0) {
        s.consume();
        consequent = parse_markup_children_with_options(s, 0, true)?;
        if s.is(TK::Dedent, 0) { s.consume(); }
    }

    s.skip_newlines();
    let mut alternate = None;
    if s.is(TK::ControlElseIf, 0) {
        alternate = Some(Box::new(MarkupNode::ElseIf(parse_else_if(s)?)));
    } else if s.is(TK::ControlElse, 0) {
        alternate = Some(Box::new(MarkupNode::Else(parse_else_node(s)?)));
    }

    let span = merge_spans(vec![Some(tok.span), span_from_nodes(&consequent), alternate.as_ref().and_then(|a| a.span())]);
    Ok(MarkupNode::If(IfNode {
        span,
        condition,
        consequent,
        alternate,
    }))
}

fn parse_else_if(s: &mut TokenStream) -> Result<ElseIfNode, ParseError> {
    let tok = s.consume();
    let condition = tok.value.strip_prefix("else if").unwrap_or(&tok.value).trim().to_string();

    s.skip_newlines();
    let mut consequent = Vec::new();
    if s.is(TK::Indent, 0) {
        s.consume();
        consequent = parse_markup_children_with_options(s, 0, true)?;
        if s.is(TK::Dedent, 0) { s.consume(); }
    }

    s.skip_newlines();
    let mut alternate = None;
    if s.is(TK::ControlElseIf, 0) {
        alternate = Some(Box::new(MarkupNode::ElseIf(parse_else_if(s)?)));
    } else if s.is(TK::ControlElse, 0) {
        alternate = Some(Box::new(MarkupNode::Else(parse_else_node(s)?)));
    }

    let span = merge_spans(vec![Some(tok.span), span_from_nodes(&consequent), alternate.as_ref().and_then(|a| a.span())]);
    Ok(ElseIfNode {
        span,
        condition,
        consequent,
        alternate,
    })
}

fn parse_else_node(s: &mut TokenStream) -> Result<ElseNode, ParseError> {
    let tok = s.consume();
    s.skip_newlines();
    let mut children = Vec::new();
    if s.is(TK::Indent, 0) {
        s.consume();
        children = parse_markup_children(s, 0)?;
        if s.is(TK::Dedent, 0) { s.consume(); }
    }
    let span = merge_spans(vec![Some(tok.span), span_from_nodes(&children)]);
    Ok(ElseNode { span, children })
}

fn parse_each(s: &mut TokenStream) -> Result<MarkupNode, ParseError> {
    let tok = s.consume();
    // Simple regex replacement: ^each\s+
    let raw = tok.value.strip_prefix("each").unwrap_or(&tok.value).trim();
    // each item, index in list
    let parts: Vec<&str> = raw.split(" in ").collect();
    if parts.len() != 2 {
        return Err(ParseError { message: format!("Malformed each: \"{}\"", tok.value), span: tok.span });
    }
    
    let left = parts[0].trim();
    let list = parts[1].trim().to_string();
    
    let mut item = left.to_string();
    let mut index = None;
    if let Some(comma_idx) = left.find(',') {
        item = left[..comma_idx].trim().to_string();
        index = Some(left[comma_idx + 1..].trim().to_string());
    }

    s.skip_newlines();
    let mut children = Vec::new();
    if s.is(TK::Indent, 0) {
        s.consume();
        children = parse_markup_children(s, 0)?;
        if s.is(TK::Dedent, 0) { s.consume(); }
    }

    let span = merge_spans(vec![Some(tok.span), span_from_nodes(&children)]);
    Ok(MarkupNode::Each(EachNode {
        span,
        item,
        index,
        list,
        children,
    }))
}

fn parse_slot(s: &mut TokenStream) -> Result<MarkupNode, ParseError> {
    let tok = s.consume();
    // slot:name
    let name = if let Some(idx) = tok.value.find(':') {
        Some(tok.value[idx+1..].trim().to_string())
    } else {
        None
    };

    s.skip_newlines();
    if s.is(TK::Indent, 0) {
        s.consume();
        let children = parse_markup_children(s, 0)?;
        if s.is(TK::Dedent, 0) { s.consume(); }
        let span = merge_spans(vec![Some(tok.span), span_from_nodes(&children)]);
        Ok(MarkupNode::SlotUse(SlotUseNode { span, name, children }))
    } else {
        Ok(MarkupNode::SlotDef(SlotDefNode { span: Some(tok.span), name }))
    }
}
