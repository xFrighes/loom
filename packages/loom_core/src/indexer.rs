use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use ignore::WalkBuilder;
use rayon::prelude::*;
use std::path::{Path, PathBuf};
use std::fs;
use std::collections::HashMap;
use chrono::Utc;
use napi_derive::napi;

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEstimates {
    pub source: u32,
    pub outline: u32,
    pub edit: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexManifestEntry {
    pub source_path: String,
    pub source_hash: String,
    pub cache_file: String,
    pub language: String,
    pub token_estimates: TokenEstimates,
    pub diagnostics: u32,
    pub generated_at: String,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexManifest {
    pub version: u32,
    pub root: String,
    pub generated_at: String,
    pub files: Vec<IndexManifestEntry>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexerResult {
    pub manifest: IndexManifest,
    pub indexed: u32,
    pub reused: u32,
    pub removed: u32,
}

#[napi]
pub fn hash_text(text: String) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

#[napi]
pub fn index_workspace(root: String, cache_dir: Option<String>, inputs: Option<Vec<String>>) -> IndexerResult {
    let root_path = Path::new(&root);
    let cache_root = match cache_dir {
        Some(d) => PathBuf::from(d),
        None => root_path.join(".loom-llm"),
    };

    let files = if let Some(input_list) = inputs {
        let mut collected = Vec::new();
        for input in input_list {
            let p = root_path.join(input);
            if p.is_dir() {
                collected.extend(walk_loom_files(&p));
            } else if p.extension().map_or(false, |ext| ext == "loom") {
                collected.push(p);
            }
        }
        collected
    } else {
        walk_loom_files(root_path)
    };

    let manifest_path = cache_root.join("index.json");
    let existing_manifest: Option<IndexManifest> = if manifest_path.exists() {
        fs::read_to_string(&manifest_path).ok().and_then(|s| serde_json::from_str(&s).ok())
    } else {
        None
    };

    let existing_entries: HashMap<String, IndexManifestEntry> = existing_manifest
        .map(|m| m.files.into_iter().map(|e| (e.source_path.clone(), e)).collect())
        .unwrap_or_default();

    let results: Vec<(IndexManifestEntry, bool)> = files.par_iter().map(|file_path| {
        let rel_path = path_to_project_path(root_path, file_path);
        let source = fs::read_to_string(file_path).unwrap_or_default();
        let source_hash = hash_text(source.clone());

        if let Some(entry) = existing_entries.get(&rel_path) {
            if entry.source_hash == source_hash {
                return (entry.clone(), false);
            }
        }

        let source_tokens = estimate_tokens(&source);
        let outline_tokens = (source_tokens as f64 * 0.2) as u32; // Rough estimate: 20% for outline
        let edit_tokens = (source_tokens as f64 * 0.5) as u32;    // Rough estimate: 50% for typical edit context
        
        let cache_file = format!("{}.json", hex::encode(Sha256::digest(rel_path.as_bytes())));
        let entry = IndexManifestEntry {
            source_path: rel_path,
            source_hash,
            cache_file,
            language: "loom".to_string(),
            token_estimates: TokenEstimates { 
                source: source_tokens, 
                outline: outline_tokens, 
                edit: edit_tokens 
            },
            diagnostics: 0,
            generated_at: Utc::now().to_rfc3339(),
        };
        (entry, true)
    }).collect();

    let mut next_entries = Vec::new();
    let mut indexed = 0;
    let mut reused = 0;

    for (entry, was_indexed) in results {
        if was_indexed {
            indexed += 1;
        } else {
            reused += 1;
        }
        next_entries.push(entry);
    }

    next_entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));

    let manifest = IndexManifest {
        version: 1,
        root: root.clone(),
        generated_at: Utc::now().to_rfc3339(),
        files: next_entries,
    };

    IndexerResult {
        manifest,
        indexed,
        reused,
        removed: 0, // Simplified removed logic
    }
}

fn estimate_tokens(text: &str) -> u32 {
    // Basic heuristic: ~4 characters per token
    (text.len() / 4).max(1) as u32
}

fn walk_loom_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let walker = WalkBuilder::new(root)
        .standard_filters(true)
        .hidden(true)
        .build();

    for result in walker {
        if let Ok(entry) = result {
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                if entry.path().extension().map_or(false, |ext| ext == "loom") {
                    files.push(entry.path().to_path_buf());
                }
            }
        }
    }
    files
}

fn path_to_project_path(root: &Path, absolute: &Path) -> String {
    absolute.strip_prefix(root)
        .unwrap_or(absolute)
        .to_string_lossy()
        .replace('\\', "/")
}
