pub fn scan_top_level<F>(str: &str, mut on_top_level: F) -> isize
where
    F: FnMut(char, usize) -> bool,
{
    let mut depth_paren = 0;
    let mut depth_bracket = 0;
    let mut depth_brace = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for (i, c) in str.char_indices() {
        if let Some(q) = quote {
            if escaped {
                escaped = false;
                continue;
            }
            if c == '\\' {
                escaped = true;
                continue;
            }
            if c == q {
                quote = None;
            }
            continue;
        }

        if c == '"' || c == '\'' || c == '`' {
            quote = Some(c);
            continue;
        }

        match c {
            '(' => depth_paren += 1,
            ')' => depth_paren = std::cmp::max(0, depth_paren - 1),
            '[' => depth_bracket += 1,
            ']' => depth_bracket = std::cmp::max(0, depth_bracket - 1),
            '{' => depth_brace += 1,
            '}' => depth_brace = std::cmp::max(0, depth_brace - 1),
            _ => {}
        }

        if depth_paren == 0 && depth_bracket == 0 && depth_brace == 0 && on_top_level(c, i) {
            return i as isize;
        }
    }

    -1
}

pub fn find_top_level_whitespace(str: &str) -> isize {
    scan_top_level(str, |c, _| c.is_whitespace())
}

pub fn find_top_level_colon(str: &str) -> isize {
    scan_top_level(str, |c, _| c == ':')
}

pub fn find_top_level_equals(str: &str) -> isize {
    let chars: Vec<char> = str.chars().collect();
    let mut depth_paren = 0;
    let mut depth_bracket = 0;
    let mut depth_brace = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for i in 0..chars.len() {
        let c = chars[i];

        if let Some(q) = quote {
            if escaped {
                escaped = false;
                continue;
            }
            if c == '\\' {
                escaped = true;
                continue;
            }
            if c == q {
                quote = None;
            }
            continue;
        }

        if c == '"' || c == '\'' || c == '`' {
            quote = Some(c);
            continue;
        }

        match c {
            '(' => depth_paren += 1,
            ')' => depth_paren = std::cmp::max(0, depth_paren - 1),
            '[' => depth_bracket += 1,
            ']' => depth_bracket = std::cmp::max(0, depth_bracket - 1),
            '{' => depth_brace += 1,
            '}' => depth_brace = std::cmp::max(0, depth_brace - 1),
            _ => {}
        }

        if depth_paren == 0 && depth_bracket == 0 && depth_brace == 0 && c == '=' {
            let next = chars.get(i + 1);
            let prev = if i > 0 { chars.get(i - 1) } else { None };

            let is_assignment = next != Some(&'=')
                && next != Some(&'>')
                && prev != Some(&'!')
                && prev != Some(&'<')
                && prev != Some(&'>')
                && prev != Some(&'=');

            if is_assignment {
                // Return byte offset
                return str.char_indices().nth(i).unwrap().0 as isize;
            }
        }
    }

    -1
}

pub fn unwrap_balanced_braces(str: &str) -> Option<String> {
    let trimmed = str.trim();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return None;
    }

    let mut depth = 0;
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for (i, c) in trimmed.char_indices() {
        if let Some(q) = quote {
            if escaped {
                escaped = false;
                continue;
            }
            if c == '\\' {
                escaped = true;
                continue;
            }
            if c == q {
                quote = None;
            }
            continue;
        }

        if c == '"' || c == '\'' || c == '`' {
            quote = Some(c);
            continue;
        }

        if c == '{' {
            depth += 1;
        } else if c == '}' {
            depth -= 1;
        }

        if depth == 0 && i < trimmed.len() - 1 {
            return None;
        }
    }

    if depth == 0 {
        Some(trimmed[1..trimmed.len() - 1].trim().to_string())
    } else {
        None
    }
}
