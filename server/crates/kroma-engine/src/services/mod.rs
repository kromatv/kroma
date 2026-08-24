//! Use-cases / orchestration: the domain workflows that coordinate the infra
//! adapters and the database.

pub mod activity;
pub mod auth;
pub mod backup;
pub mod cast;
pub mod demo;
pub mod embeddings;
pub mod enrich;
pub mod jobs;
pub mod library_missing;
pub mod llm;
pub mod loginguard;
pub mod markers;
pub mod notify;
pub mod pairing;
pub mod pipeline;
pub mod playback;
pub mod rematch;
pub mod request_ledger;
pub mod requests;
pub mod scan;
pub mod search;
pub mod sections;
pub mod settings;
pub mod subtitles;
