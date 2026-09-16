use super::store::Settings;

/// How account email leaves the server: copied by the owner, through their own
/// SMTP server, or through the kroma.tv mail relay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmailDelivery {
    Manual,
    Smtp,
    Relay,
}

impl EmailDelivery {
    pub const OPTIONS: [&str; 3] = ["manual", "smtp", "relay"];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Smtp => "smtp",
            Self::Relay => "relay",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "manual" => Some(Self::Manual),
            "smtp" => Some(Self::Smtp),
            "relay" => Some(Self::Relay),
            _ => None,
        }
    }
}

/// The stored `emailDelivery`; a server configured before the relay existed
/// still has only the `smtpEnabled` toggle, which reads as `smtp`.
pub fn email_delivery(settings: &Settings) -> EmailDelivery {
    if let Some(mode) = EmailDelivery::parse(&settings.get_str("emailDelivery", "")) {
        return mode;
    }
    if settings.get_bool("smtpEnabled", false) {
        EmailDelivery::Smtp
    } else {
        EmailDelivery::Manual
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::db::testing::TempPool;

    fn settings() -> (TempPool, Settings) {
        let pool = crate::db::testing::temp_pool("email-delivery");
        let settings = Settings::load(&pool);
        (pool, settings)
    }

    #[test]
    fn a_fresh_server_delivers_by_hand() {
        let (_pool, settings) = settings();

        assert_eq!(email_delivery(&settings), EmailDelivery::Manual);
    }

    #[test]
    fn the_older_smtp_toggle_still_reads_as_smtp() {
        let (pool, settings) = settings();
        settings.set_patch(&pool, [("smtpEnabled".to_string(), json!(true))].into());

        assert_eq!(email_delivery(&settings), EmailDelivery::Smtp);
    }

    #[test]
    fn the_stored_mode_wins_over_the_older_toggle() {
        let (pool, settings) = settings();
        settings.set_patch(
            &pool,
            [
                ("smtpEnabled".to_string(), json!(true)),
                ("emailDelivery".to_string(), json!("relay")),
            ]
            .into(),
        );

        assert_eq!(email_delivery(&settings), EmailDelivery::Relay);
    }

    #[test]
    fn an_unknown_mode_falls_back_rather_than_failing() {
        let (pool, settings) = settings();
        settings.set_patch(&pool, [("emailDelivery".to_string(), json!("pigeon"))].into());

        assert_eq!(email_delivery(&settings), EmailDelivery::Manual);
    }

    #[test]
    fn every_option_the_schema_offers_parses_back() {
        for option in EmailDelivery::OPTIONS {
            assert_eq!(EmailDelivery::parse(option).map(EmailDelivery::as_str), Some(option));
        }
    }
}
