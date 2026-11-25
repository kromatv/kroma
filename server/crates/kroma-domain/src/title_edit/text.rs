pub(super) fn kept(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

pub(super) fn listed(names: Option<Vec<String>>) -> Option<Vec<String>> {
    let names: Vec<String> = names
        .into_iter()
        .flatten()
        .filter_map(|name| kept(Some(name)))
        .collect();
    (!names.is_empty()).then_some(names)
}

pub(super) fn clip_list(
    names: Option<Vec<String>>,
    count: usize,
    each: usize,
) -> Option<Vec<String>> {
    names.map(|names| {
        let kept = names.into_iter().take(count);
        kept.map(|name| cut(name, each)).collect()
    })
}

pub(super) fn list_fits(names: &Option<Vec<String>>, count: usize, each: usize) -> bool {
    let names = names.as_deref().unwrap_or_default();
    names.len() <= count && names.iter().all(|name| name.chars().count() <= each)
}

pub(super) fn put(to: &mut Option<String>, written: &Option<String>) {
    if written.is_some() {
        to.clone_from(written);
    }
}

pub(super) fn cut(text: String, max: usize) -> String {
    if text.chars().count() <= max {
        return text;
    }
    text.chars()
        .take(max)
        .collect::<String>()
        .trim_end()
        .to_string()
}
