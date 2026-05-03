pub mod ast;
pub mod expr;
pub mod lexer;
pub mod parser;
pub mod indexer;

pub use ast::{SourcePosition, SourceSpan, LoomFile};
pub use lexer::{TK, Token, LexError, LexerResult, tokenize};
pub use parser::{parse, ParseError};
pub use indexer::{index_workspace, hash_text};

use napi_derive::napi;
use wasm_bindgen::prelude::*;

#[napi]
pub fn napi_tokenize(src: String) -> LexerResult {
    tokenize(&src)
}

#[wasm_bindgen]
pub fn wasm_tokenize(src: String) -> JsValue {
    serde_wasm_bindgen::to_value(&tokenize(&src)).unwrap()
}

#[napi]
pub fn napi_parse(src: String) -> serde_json::Value {
    match parse(&src) {
        Ok(file) => serde_json::to_value(file).unwrap(),
        Err(err) => {
            serde_json::json!({ "error": err.message, "line": err.span.start.line })
        }
    }
}

#[wasm_bindgen]
pub fn wasm_parse(src: String) -> JsValue {
    match parse(&src) {
        Ok(file) => serde_wasm_bindgen::to_value(&file).unwrap(),
        Err(err) => {
            serde_wasm_bindgen::to_value(&serde_json::json!({ "error": err.message, "line": err.span.start.line })).unwrap()
        }
    }
}
