pub mod ast;
pub mod expr;
pub mod indexer;
pub mod lexer;
pub mod parser;

pub use ast::{LoomFile, SourcePosition, SourceSpan};
pub use indexer::{hash_text, index_workspace};
pub use lexer::{tokenize, LexError, LexerResult, Token, TK};
pub use parser::{parse, ParseError};

use napi_derive::napi;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[napi(object)]
pub struct BridgeStats {
    pub source_bytes: u32,
    pub token_count: u32,
    pub ast_json_bytes: u32,
}

fn parse_json_string(src: &str) -> String {
    match parse(src) {
        Ok(file) => to_json_string(&file),
        Err(err) => serde_json::json!({
            "error": err.message,
            "line": err.span.start.line,
            "column": err.span.start.column
        })
        .to_string(),
    }
}

fn tokenize_json_string(src: &str) -> String {
    to_json_string(&tokenize(src))
}

fn to_json_string<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|err| {
        serde_json::json!({
            "error": format!("serialization failed: {err}")
        })
        .to_string()
    })
}

fn to_json_value<T: Serialize>(value: T) -> serde_json::Value {
    serde_json::to_value(value).unwrap_or_else(|err| {
        serde_json::json!({
            "error": format!("serialization failed: {err}")
        })
    })
}

fn to_js_value<T: Serialize>(value: &T) -> JsValue {
    serde_wasm_bindgen::to_value(value).unwrap_or_else(|err| {
        serde_wasm_bindgen::to_value(&serde_json::json!({
            "error": format!("serialization failed: {err}")
        }))
        .unwrap_or(JsValue::NULL)
    })
}

#[napi]
pub fn napi_tokenize(src: String) -> LexerResult {
    tokenize(&src)
}

#[napi]
pub fn napi_tokenize_json(src: String) -> String {
    tokenize_json_string(&src)
}

#[napi]
pub fn napi_tokenize_many_json(inputs: Vec<String>) -> Vec<String> {
    inputs.iter().map(|src| tokenize_json_string(src)).collect()
}

#[wasm_bindgen]
pub fn wasm_tokenize(src: String) -> JsValue {
    to_js_value(&tokenize(&src))
}

#[wasm_bindgen]
pub fn wasm_tokenize_json(src: String) -> String {
    tokenize_json_string(&src)
}

#[napi]
pub fn napi_parse(src: String) -> serde_json::Value {
    match parse(&src) {
        Ok(file) => to_json_value(file),
        Err(err) => {
            serde_json::json!({ "error": err.message, "line": err.span.start.line })
        }
    }
}

#[napi]
pub fn napi_parse_json(src: String) -> String {
    parse_json_string(&src)
}

#[napi]
pub fn napi_parse_many_json(inputs: Vec<String>) -> Vec<String> {
    inputs.iter().map(|src| parse_json_string(src)).collect()
}

#[napi]
pub fn napi_bridge_stats(src: String) -> BridgeStats {
    let tokens = tokenize(&src).tokens.len() as u32;
    let ast_json_bytes = parse_json_string(&src).len() as u32;
    BridgeStats {
        source_bytes: src.len() as u32,
        token_count: tokens,
        ast_json_bytes,
    }
}

#[wasm_bindgen]
pub fn wasm_parse(src: String) -> JsValue {
    match parse(&src) {
        Ok(file) => to_js_value(&file),
        Err(err) => to_js_value(
            &serde_json::json!({ "error": err.message, "line": err.span.start.line }),
        ),
    }
}

#[wasm_bindgen]
pub fn wasm_parse_json(src: String) -> String {
    parse_json_string(&src)
}

#[cfg(test)]
mod fuzz_tests {
    use super::{parse, tokenize};

    fn lcg(seed: &mut u64) -> u64 {
        *seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        *seed
    }

    fn generated_case(seed: &mut u64, len: usize) -> String {
        const CHUNKS: &[&str] = &[
            "- props\n",
            "- state\n",
            "- computed\n",
            "- pug\n",
            "- ts\n",
            "div",
            "  ",
            "\t",
            "\n",
            ":",
            "::",
            "@click",
            "if ",
            "else if ",
            "else",
            "each item in ",
            "slot:header",
            "{",
            "}",
            "\"",
            "'",
            "`",
            "[]",
            "<script>alert(1)</script>",
            "\u{0}",
            "\u{2028}",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ];

        let mut out = String::new();
        while out.len() < len {
            let idx = (lcg(seed) as usize) % CHUNKS.len();
            out.push_str(CHUNKS[idx]);
        }
        out
    }

    #[test]
    fn parser_handles_malformed_corpus_without_panics() {
        let cases = [
            "",
            "\0\0\0",
            "- pug\n  div\n    :\n      class {unterminated",
            "- props\n  name: Array<{ id: string } = [",
            "- computed\n  total",
            "if show\n  p ok\nelse if\n  p bad\nelse\n  p fallback",
            "div\n     p uneven\n   span back",
            "- ts\n  const x = `unterminated\n- pug\np after",
            "each item, index in\n  div",
            "slot:123\n  p bad-slot-name",
        ];

        for src in cases {
            let _ = tokenize(src);
            let _ = parse(src);
        }
    }

    #[test]
    fn parser_handles_generated_edge_cases_without_panics() {
        let mut seed = 0x5eed_f00d_cafe_babe;
        for len in [1, 8, 32, 128, 512, 2048] {
            for _ in 0..25 {
                let src = generated_case(&mut seed, len);
                let _ = tokenize(&src);
                let _ = parse(&src);
            }
        }
    }
}
