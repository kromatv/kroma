use crate::metadata::CrewMember;

const DIRECTING: [&str; 2] = ["Director", "Creator"];

pub(super) fn directed_by(crew: &mut Vec<CrewMember>, names: &[String]) {
    let (directing, rest): (Vec<CrewMember>, Vec<CrewMember>) = std::mem::take(crew)
        .into_iter()
        .partition(|member| DIRECTING.contains(&member.job.as_str()));
    let written = names
        .iter()
        .map(|name| known(&directing, name).unwrap_or_else(|| director(name)));
    *crew = written.chain(rest).collect();
}

fn known(directing: &[CrewMember], name: &str) -> Option<CrewMember> {
    directing
        .iter()
        .find(|member| member.name.eq_ignore_ascii_case(name))
        .cloned()
}

fn director(name: &str) -> CrewMember {
    CrewMember {
        name: name.to_string(),
        tmdb_id: None,
        job: DIRECTING[0].to_string(),
        profile_url: None,
    }
}
