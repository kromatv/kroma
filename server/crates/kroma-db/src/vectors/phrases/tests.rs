use super::*;
use crate::testing::temp_pool;

const VECTOR: Phrase = Phrase {
    module: "tv.kroma.vector",
    dim: 2,
    text: "cozy autumn drama",
};

#[test]
fn a_kept_phrase_reads_back_at_its_width() {
    let pool = temp_pool("phrases");

    keep_phrase_vector(&pool, &VECTOR, &[0.6, 0.8]).unwrap();

    assert_eq!(phrase_vector(&pool, &VECTOR).unwrap(), Some(vec![0.6, 0.8]));
}

#[test]
fn a_phrase_kept_at_another_width_reads_as_none() {
    let pool = temp_pool("phrases");
    keep_phrase_vector(&pool, &VECTOR, &[0.6, 0.8]).unwrap();

    let wider = phrase_vector(&pool, &Phrase { dim: 3, ..VECTOR }).unwrap();

    assert_eq!(wider, None);
}

#[test]
fn another_module_reads_none_of_the_phrases_one_kept() {
    let pool = temp_pool("phrases");
    keep_phrase_vector(&pool, &VECTOR, &[0.6, 0.8]).unwrap();

    let other = phrase_vector(
        &pool,
        &Phrase {
            module: "org.example.vectors",
            ..VECTOR
        },
    )
    .unwrap();

    assert_eq!(other, None);
}

#[test]
fn keeping_a_phrase_again_replaces_its_vector() {
    let pool = temp_pool("phrases");
    keep_phrase_vector(&pool, &VECTOR, &[0.6, 0.8]).unwrap();

    keep_phrase_vector(&pool, &VECTOR, &[0.0, 0.0, 1.0]).unwrap();

    let wider = Phrase { dim: 3, ..VECTOR };
    assert_eq!(
        phrase_vector(&pool, &wider).unwrap(),
        Some(vec![0.0, 0.0, 1.0])
    );
    assert_eq!(phrase_vector(&pool, &VECTOR).unwrap(), None);
}

#[test]
fn past_the_most_kept_the_oldest_phrase_leaves() {
    let pool = temp_pool("phrases");
    let texts: Vec<String> = (0..=MOST_KEPT).map(|n| format!("phrase {n}")).collect();

    for text in &texts {
        keep_phrase_vector(&pool, &Phrase { text, ..VECTOR }, &[1.0, 0.0]).unwrap();
    }

    let first = Phrase {
        text: &texts[0],
        ..VECTOR
    };
    let last = Phrase {
        text: &texts[texts.len() - 1],
        ..VECTOR
    };
    assert_eq!(phrase_vector(&pool, &first).unwrap(), None);
    assert!(phrase_vector(&pool, &last).unwrap().is_some());
}
