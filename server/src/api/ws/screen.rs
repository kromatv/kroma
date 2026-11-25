use serde::Deserialize;

use super::message::ClientMessage;
use super::Viewer;
use crate::services::screens::{Origin, Screen, ScreenDevice, ScreenReply};
use crate::state::SharedState;

pub(super) const MAX_CLIENT_TEXT: usize = 1 << 20;

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ScreenMessage {
    #[serde(rename = "screen.hello")]
    Hello {
        #[serde(rename = "screenId")]
        screen_id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        platform: String,
    },
    #[serde(rename = "screen.reply")]
    Reply {
        #[serde(rename = "requestId")]
        request_id: String,
        screen: Screen,
    },
}

pub(super) struct ScreenSeat {
    state: SharedState,
    connection: u64,
}

impl ScreenSeat {
    pub(super) fn open(state: &SharedState) -> Self {
        Self {
            state: state.clone(),
            connection: state.screens.connection(),
        }
    }

    pub(super) fn read(&self, who: &Viewer, text: &str) -> Option<ClientMessage> {
        if text.len() > MAX_CLIENT_TEXT {
            return None;
        }
        match serde_json::from_str::<ScreenMessage>(text) {
            Ok(message) if who.is_admin => {
                self.handle(who, message);
                None
            }
            Ok(_) => None,
            Err(_) => serde_json::from_str(text).ok(),
        }
    }

    fn handle(&self, who: &Viewer, message: ScreenMessage) {
        let from = Origin {
            user_id: &who.id,
            connection: self.connection,
        };
        let screens = &self.state.screens;
        match message {
            ScreenMessage::Hello {
                screen_id,
                name,
                platform,
            } => {
                let device = ScreenDevice {
                    id: screen_id,
                    name,
                    platform,
                };
                screens.hello(from, device);
            }
            ScreenMessage::Reply { request_id, screen } => {
                screens.answer(from, ScreenReply { request_id, screen });
            }
        }
    }
}

impl Drop for ScreenSeat {
    fn drop(&mut self) {
        self.state.screens.forget(self.connection);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::test_support::test_app;

    const HELLO: &str = r#"{"type":"screen.hello","screenId":"tv-salon-01","name":"Salon"}"#;

    fn viewer(is_admin: bool) -> Viewer {
        Viewer {
            id: "alice".to_string(),
            username: "alice".to_string(),
            avatar_url: None,
            network: "LAN".to_string(),
            ip: "127.0.0.1".to_string(),
            can_cast: true,
            is_admin,
        }
    }

    #[tokio::test]
    async fn an_admin_account_lists_the_screen_that_says_hello() {
        let t = test_app();
        let seat = ScreenSeat::open(&t.state);

        let passed_on = seat.read(&viewer(true), HELLO);

        assert!(passed_on.is_none());
        assert_eq!(t.state.screens.roster("alice").len(), 1);
    }

    #[tokio::test]
    async fn an_account_with_no_admin_capability_lists_no_screen() {
        let t = test_app();
        let seat = ScreenSeat::open(&t.state);

        let passed_on = seat.read(&viewer(false), HELLO);

        assert!(passed_on.is_none());
        assert!(t.state.screens.roster("alice").is_empty());
    }
}
