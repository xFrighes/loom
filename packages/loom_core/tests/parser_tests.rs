use loom_core::parser::parse;
use loom_core::ast::*;

#[test]
fn test_simple_element() {
    let src = "div\n  : class \"foo\"\n  p Hello world";
    let res = parse(src).unwrap();
    
    assert!(res.markup.is_some());
    let markup = res.markup.unwrap();
    assert_eq!(markup.len(), 1);
    
    if let MarkupNode::Element(elem) = &markup[0] {
        assert_eq!(elem.tag, "div");
        assert_eq!(elem.children.len(), 1);
        if let MarkupNode::Element(child) = &elem.children[0] {
            assert_eq!(child.tag, "p");
            assert_eq!(child.children.len(), 1);
        }
    } else {
        panic!("Expected element node");
    }
}

#[test]
fn test_top_level_zones() {
    let src = "- props\n  name: string = \"world\"\n\n- pug\nh1 Hello {name}";
    let res = parse(src).unwrap();
    
    assert!(res.props.is_some());
    let props = res.props.unwrap();
    assert_eq!(props.len(), 1);
    assert_eq!(props[0].name, "name");
    assert_eq!(props[0].r#type, "string");
    assert_eq!(props[0].default_value, Some("\"world\"".to_string()));
    
    assert!(res.markup.is_some());
    let markup = res.markup.unwrap();
    assert_eq!(markup.len(), 1);
}

#[test]
fn test_control_flow() {
    let src = "if show\n  p Shown\nelse\n  p Hidden";
    let res = parse(src).unwrap();
    
    let markup = res.markup.unwrap();
    if let MarkupNode::If(if_node) = &markup[0] {
        assert_eq!(if_node.condition, "show");
        assert_eq!(if_node.consequent.len(), 1);
        assert!(if_node.alternate.is_some());
    } else {
        panic!("Expected if node");
    }
}
