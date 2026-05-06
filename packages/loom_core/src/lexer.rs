use serde::{Deserialize, Serialize};
use napi_derive::napi;
use crate::ast::{SourcePosition, SourceSpan};
use regex::Regex;
use std::sync::OnceLock;

#[napi]
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TK {
    ContextSwitch,
    Indent,
    Dedent,
    Newline,
    DimensionData,
    DimensionStyle,
    DimensionBehavior,
    ControlIf,
    ControlElseIf,
    ControlElse,
    ControlEach,
    Slot,
    Tag,
    Component,
    Text,
    Comment,
    RawLine,
    Eof,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub r#type: TK,
    pub value: String,
    pub line: u32,
    pub col: u32,
    pub indent: u32,
    pub span: SourceSpan,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LexError {
    pub message: String,
    pub line: u32,
    pub span: Option<SourceSpan>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LexerResult {
    pub tokens: Vec<Token>,
    pub errors: Vec<LexError>,
}

fn measure_indent(line: &str) -> usize {
    let mut i = 0;
    for c in line.chars() {
        if c == ' ' {
            i += 1;
        } else if c == '\t' {
            i += 2;
        } else {
            break;
        }
    }
    i
}

fn strip_indent(line: &str, amount: usize) -> String {
    let mut removed = 0;
    let mut i = 0;
    let bytes = line.as_bytes();
    while i < bytes.len() && removed < amount {
        if bytes[i] == b' ' {
            removed += 1;
            i += 1;
        } else if bytes[i] == b'\t' {
            removed += 2;
            i += 1;
        } else {
            break;
        }
    }
    line[i..].to_string()
}

static CTX_RE: OnceLock<Regex> = OnceLock::new();
static BEHAVIOR_RE: OnceLock<Regex> = OnceLock::new();
static EACH_RE: OnceLock<Regex> = OnceLock::new();
static SLOT_RE: OnceLock<Regex> = OnceLock::new();
static TAG_RE: OnceLock<Regex> = OnceLock::new();
static COMPONENT_RE: OnceLock<Regex> = OnceLock::new();

fn classify_line(trimmed: &str) -> TK {
    if trimmed.starts_with("//") {
        return TK::Comment;
    }
    if trimmed == "::" {
        return TK::DimensionStyle;
    }
    if trimmed == ":" {
        return TK::DimensionData;
    }

    let behavior_re = BEHAVIOR_RE.get_or_init(|| Regex::new(r"^@[\w]").unwrap());
    if behavior_re.is_match(trimmed) {
        return TK::DimensionBehavior;
    }

    if trimmed.starts_with("if ") || trimmed == "if" {
        return TK::ControlIf;
    }
    if trimmed.starts_with("else if ") {
        return TK::ControlElseIf;
    }
    if trimmed == "else" {
        return TK::ControlElse;
    }

    let each_re = EACH_RE.get_or_init(|| Regex::new(r"^each\s+\w+(\s*,\s*\w+)?\s+in\s+").unwrap());
    if each_re.is_match(trimmed) {
        return TK::ControlEach;
    }

    let slot_re = SLOT_RE.get_or_init(|| Regex::new(r"^slot(:[a-zA-Z][\w-]*)?$").unwrap());
    if slot_re.is_match(trimmed) {
        return TK::Slot;
    }

    if let Some(first_char) = trimmed.chars().next() {
        if first_char.is_uppercase() {
            let selector = trimmed.split_whitespace().next().unwrap_or(trimmed);
            let remainder = trimmed[selector.len()..].trim();
            let component_re = COMPONENT_RE.get_or_init(|| Regex::new(r"^[A-Z][A-Za-z0-9]*([.#][a-zA-Z0-9_-]*)*$").unwrap());
            if remainder.is_empty() && component_re.is_match(selector) {
                return TK::Component;
            }
            return TK::Text;
        }
    }

    let tag_re = TAG_RE.get_or_init(|| Regex::new(r"^[a-z][a-zA-Z0-9]*([.#][a-zA-Z0-9_-]*)*(\s|$)").unwrap());
    if tag_re.is_match(trimmed) {
        return TK::Tag;
    }

    if trimmed == "element" || trimmed.starts_with("element ") {
        return TK::Tag;
    }
    
    TK::Text
}

pub fn tokenize(src: &str) -> LexerResult {
    let lines: Vec<&str> = src.split('\n').collect();
    let mut tokens = Vec::new();
    let mut errors = Vec::new();
    let mut indent_stack = vec![0];
    
    let mut zone: Option<String> = None;
    let mut zone_base_indent: isize = -1;
    let mut line_offset = 0;

    let ctx_re = CTX_RE.get_or_init(|| {
        Regex::new(r"^- (generics|props|state|computed|meta|schema|server|tokens|onMount|onUpdate|onUnmount|ts|js|pug)(\s|$)").unwrap()
    });

    for (i, raw_line) in lines.iter().enumerate() {
        let line_num = (i + 1) as u32;
        let trimmed = raw_line.trim();

        if trimmed.is_empty() {
             if let Some(z) = &zone {
                if z != "pug" {
                    tokens.push(Token {
                        r#type: TK::RawLine,
                        value: "".to_string(),
                        line: line_num,
                        col: 1,
                        indent: 0,
                        span: span(line_num as usize, 1, 1, line_offset),
                    });
                } else {
                    tokens.push(Token {
                        r#type: TK::Newline,
                        value: "".to_string(),
                        line: line_num,
                        col: 1,
                        indent: 0,
                        span: span(line_num as usize, 1, 1, line_offset),
                    });
                }
             }
             line_offset += raw_line.len() + 1;
             continue;
        }
        
        let indent = measure_indent(raw_line);
        
        if indent == 0 {
            if let Some(caps) = ctx_re.captures(trimmed) {
                while indent_stack.len() > 1 {
                    indent_stack.pop();
                    tokens.push(Token {
                        r#type: TK::Dedent,
                        value: "".to_string(),
                        line: line_num,
                        col: 1,
                        indent: *indent_stack.last().unwrap() as u32,
                        span: span(line_num as usize, 1, 1, line_offset),
                    });
                }
                let zone_name = caps.get(1).unwrap().as_str();
                zone = Some(zone_name.to_string());
                zone_base_indent = -1;
                tokens.push(Token {
                    r#type: TK::ContextSwitch,
                    value: zone_name.to_string(),
                    line: line_num,
                    col: (indent + 1) as u32,
                    indent: 0,
                    span: span(line_num as usize, indent + 1, raw_line.len() + 1, line_offset),
                });
                line_offset += raw_line.len() + 1;
                continue;
            }
        }
        
        if let Some(z) = &zone {
            if z != "pug" {
                if zone_base_indent == -1 {
                    zone_base_indent = indent as isize;
                }
                let stripped = strip_indent(raw_line, zone_base_indent as usize);
                tokens.push(Token {
                    r#type: TK::RawLine,
                    value: stripped,
                    line: line_num,
                    col: std::cmp::max(1, zone_base_indent as usize + 1) as u32,
                    indent: indent as u32,
                    span: span(line_num as usize, std::cmp::max(1, zone_base_indent as usize + 1), raw_line.len() + 1, line_offset),
                });
                line_offset += raw_line.len() + 1;
                continue;
            }
        }
        
        // Pug zone (or pre-zone text)
        let current_indent = *indent_stack.last().unwrap();
        if indent > current_indent {
            indent_stack.push(indent);
            tokens.push(Token {
                r#type: TK::Indent,
                value: "".to_string(),
                line: line_num,
                col: (indent + 1) as u32,
                indent: indent as u32,
                span: span(line_num as usize, indent + 1, indent + 1, line_offset),
            });
        } else {
             while indent < *indent_stack.last().unwrap() {
                 indent_stack.pop();
                 tokens.push(Token {
                    r#type: TK::Dedent,
                    value: "".to_string(),
                    line: line_num,
                    col: (indent + 1) as u32,
                    indent: *indent_stack.last().unwrap() as u32,
                    span: span(line_num as usize, indent + 1, indent + 1, line_offset),
                });
             }
             if indent != *indent_stack.last().unwrap() {
                 errors.push(LexError {
                     message: "Inconsistent indentation".to_string(),
                     line: line_num,
                     span: Some(span(line_num as usize, 1, std::cmp::max(1, indent + 1), line_offset)),
                 });
             }
        }
        
        let tk = classify_line(trimmed);
        let value = if tk == TK::Comment { trimmed[2..].trim().to_string() } else { trimmed.to_string() };
        
        tokens.push(Token {
            r#type: tk,
            value,
            line: line_num,
            col: (indent + 1) as u32,
            indent: indent as u32,
            span: span(line_num as usize, indent + 1, raw_line.len() + 1, line_offset),
        });
        
        line_offset += raw_line.len() + 1;
    }
    
    while indent_stack.len() > 1 {
        indent_stack.pop();
        tokens.push(Token {
            r#type: TK::Dedent,
            value: "".to_string(),
            line: lines.len() as u32,
            col: 1,
            indent: *indent_stack.last().unwrap() as u32,
            span: span(lines.len(), 1, 1, line_offset),
        });
    }

    tokens.push(Token {
        r#type: TK::Eof,
        value: "".to_string(),
        line: (lines.len() + 1) as u32,
        col: 1,
        indent: 0,
        span: SourceSpan {
            start: SourcePosition { line: (lines.len() + 1) as u32, column: 1, offset: src.len() as u32 },
            end: SourcePosition { line: (lines.len() + 1) as u32, column: 1, offset: src.len() as u32 },
        },
    });
    
    LexerResult { tokens, errors }
}

fn span(line: usize, start_col: usize, end_col: usize, offset: usize) -> SourceSpan {
    let start_col = std::cmp::max(1, start_col);
    let end_col = std::cmp::max(start_col, end_col);
    SourceSpan {
        start: SourcePosition { line: line as u32, column: start_col as u32, offset: (offset + start_col - 1) as u32 },
        end: SourcePosition { line: line as u32, column: end_col as u32, offset: (offset + end_col - 1) as u32 },
    }
}
