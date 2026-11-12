use serde_json::json;

use super::*;
use crate::db::testing::{temp_pool, TempPool};

mod journal;
mod module_asks;
mod offers;
mod ruling;

fn network(tag: &str, vpn: Point) -> (Network, TempPool) {
    let pool = temp_pool(tag);
    let settings = Settings::load(&pool);
    (Network::new((*pool).clone(), settings, vpn), pool)
}

fn offer(name: &str, address: &str, up: bool) -> serde_json::Value {
    json!({
        "name": name,
        "endpoint": { "address": address, "username": "kroma", "password": "pw" },
        "carries": { "tcp": true, "udp": false, "dns": true },
        "health": { "up": up }
    })
}

fn offering(offers: Vec<serde_json::Value>) -> Point {
    Point::stub(NETWORK_POINT, move |_, _| Some(json!(offers)))
}

fn everything(action: &str) -> NetworkRules {
    serde_json::from_value(json!({
        "defaultAction": "allow",
        "rules": [{ "id": "all", "action": action }]
    }))
    .unwrap()
}
