use loom_core::{tokenize, TK};

#[test]
fn test_basic_tokens() {
    let src = "div.card\n  p hello world";
    let result = tokenize(src);
    
    assert!(result.errors.is_empty());
    
    let types: Vec<TK> = result.tokens.iter().map(|t| t.r#type).collect();
    // Expected: TAG(div.card), INDENT, TAG(p hello world), DEDENT, EOF
    assert!(types.contains(&TK::Tag));
    assert!(types.contains(&TK::Indent));
    assert!(types.contains(&TK::Eof));
}

#[test]
fn test_context_switch() {
    let src = "- ts\n  const x = 1";
    let result = tokenize(src);
    
    assert!(result.errors.is_empty());
    let types: Vec<TK> = result.tokens.iter().map(|t| t.r#type).collect();
    assert!(types.contains(&TK::ContextSwitch));
    assert!(types.contains(&TK::RawLine));
}
