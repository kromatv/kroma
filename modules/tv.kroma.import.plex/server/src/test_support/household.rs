use std::sync::Arc;

use kroma_module_sdk::db::testing::TempPool;

use super::recorded::{get, Recorded};
use super::{filled, mint, store};
use crate::plex::Plex;
use crate::store::{Finished, Pending, ServerKey, ServerRow, SignIn};

pub(crate) const ACCOUNT: &str = "https://plex.tv";
pub(crate) const MACHINE: &str = "machine-nas-1";
pub(crate) const OWNER: &str = "7001";
pub(crate) const LOCAL: &str = "https://192-168-1-20.examplehash.plex.direct:32400";
pub(crate) const LOCAL_PLAIN: &str = "http://192.168.1.20:32400";
pub(crate) const REMOTE: &str = "https://203-0-113-9.examplehash.plex.direct:32400";
pub(crate) const RELAY: &str = "https://198-51-100-7.examplehash.plex.direct:8443";

const USER: &str = include_str!("../../fixtures/account/user.xml");
const RESOURCES: &str = include_str!("../../fixtures/account/resources.xml");
const USERS: &str = include_str!("../../fixtures/account/users.xml");
const SHARED: &str = include_str!("../../fixtures/account/shared_servers.xml");
const IDENTITY: &str = include_str!("../../fixtures/server/identity.xml");
const SECTIONS: &str = include_str!("../../fixtures/server/sections.xml");
const FILMS: &str = include_str!("../../fixtures/server/films.xml");
const FILMS_BEN: &str = include_str!("../../fixtures/server/films_ben.xml");
const EPISODES: &str = include_str!("../../fixtures/server/episodes.xml");
const SHOWS: &str = include_str!("../../fixtures/server/shows.xml");
const HISTORY: &str = include_str!("../../fixtures/server/history.xml");
const PLAYLISTS: &str = include_str!("../../fixtures/server/playlists.xml");
const DVRS: &str = include_str!("../../fixtures/server/dvrs.xml");
const COUNT: &str = include_str!("../../fixtures/server/count.xml");

/// A Plex account and the one server it owns, answering from the recorded
/// answers in `fixtures/`: Ana owns the server, Ben is a friend who sees two
/// libraries, Chloé is a managed Home user limited by rating and label, Dan is
/// a Home user with a PIN, and Eve is a managed Home user plex.tv lists no
/// token for. Every token is made for the test that asks.
pub(crate) struct Household {
    pub web: Arc<Recorded>,
    pub plex: Plex,
    pub pool: TempPool,
    pub account_token: String,
    pub owner_token: String,
    pub ben_token: String,
    pub chloe_token: String,
    pub dan_token: String,
    pub dan_account_token: String,
    pub dan_server_token: String,
}

impl Household {
    /// plex.tv and the server answering, with nobody signed in.
    pub(crate) fn new() -> Self {
        let pool = store();
        let web = Arc::new(Recorded::default());
        let home = Self {
            plex: Plex::new(web.clone(), pool.clone()),
            web,
            pool,
            account_token: mint("account"),
            owner_token: mint("owner"),
            ben_token: mint("ben"),
            chloe_token: mint("chloe"),
            dan_token: mint("dan"),
            dan_account_token: mint("dan-account"),
            dan_server_token: mint("dan-server"),
        };
        home.record_account();
        home.record_server(LOCAL);
        home
    }

    /// The same, with Ana signed in and the server found at its local address.
    /// Answers the reference to the sign-in.
    pub(crate) fn signed_in() -> (Self, String) {
        let home = Self::new();
        let sign_in = SignIn {
            id: mint("sign-in"),
            token: home.account_token.clone(),
            account_id: OWNER.to_string(),
        };
        let server = ServerRow {
            id: MACHINE.to_string(),
            name: "NAS".to_string(),
            token: home.owner_token.clone(),
            address: None,
            route: None,
        };
        let pending = Pending {
            id: mint("pending"),
            pin_id: 4242,
            code: mint("code"),
            expires_at: 1_900,
            sign_in: None,
        };
        crate::store::open_pending(&home.pool, &pending).unwrap();
        let finished = Finished {
            pending: &pending.id,
            sign_in: &sign_in,
            servers: &[server],
            now: 1_000,
        };
        crate::store::keep_sign_in(&home.pool, &finished).unwrap();
        crate::store::set_route(&home.pool, home.key(&sign_in.id), Some(LOCAL)).unwrap();
        (home, sign_in.id)
    }

    pub(crate) fn key<'a>(&self, sign_in: &'a str) -> ServerKey<'a> {
        ServerKey {
            sign_in,
            server: MACHINE,
        }
    }

    pub(crate) fn tokens(&self) -> Vec<(&'static str, &str)> {
        vec![
            ("machine", MACHINE),
            ("owner_server_token", &self.owner_token),
            ("ben_token", &self.ben_token),
            ("chloe_token", &self.chloe_token),
            ("dan_token", &self.dan_token),
            ("dan_account_token", &self.dan_account_token),
            ("dan_server_token", &self.dan_server_token),
            ("friend_server_token", "not-used"),
            ("player_token", "not-used"),
        ]
    }

    fn record_account(&self) {
        let shared = format!("/api/servers/{MACHINE}/shared_servers");
        let answers = [
            ("/api/v2/user", USER),
            ("/api/v2/resources", RESOURCES),
            ("/api/users", USERS),
            (shared.as_str(), SHARED),
        ];
        for (path, body) in answers {
            let url = format!("{ACCOUNT}{path}");
            self.web.answers(get(&url), 401, "<errors/>");
            self.web.answers(
                get(&url).with("X-Plex-Token", &self.account_token),
                200,
                &filled(body, &self.tokens()),
            );
        }
    }

    /// Makes the server answer at `base` as it does at its local address.
    pub(crate) fn record_server(&self, base: &str) {
        let owner =
            |path: &str| get(&format!("{base}{path}")).with("X-Plex-Token", &self.owner_token);
        let count = |total: &str| filled(COUNT, &[("total", total)]);
        let none = ("X-Plex-Container-Size", "0");
        let identity = filled(IDENTITY, &[("machine", MACHINE)]);
        self.web
            .answers(get(&format!("{base}/identity")), 200, &identity);
        self.web.answers(owner("/library/sections"), 200, SECTIONS);
        let films = "/library/sections/1/all";
        let episodes = "/library/sections/2/all";
        self.web.answers(owner(films).with("type", "1"), 200, FILMS);
        self.web.answers(
            owner(films).with("type", "1").with(none.0, none.1),
            200,
            &count("3"),
        );
        self.web
            .answers(owner(films).with("type", "18"), 200, &count("1"));
        self.web.answers(
            get(&format!("{base}{films}"))
                .with("type", "1")
                .with("X-Plex-Token", &self.ben_token),
            200,
            FILMS_BEN,
        );
        self.web
            .answers(owner(episodes).with("type", "4"), 200, EPISODES);
        self.web.answers(
            owner(episodes).with("type", "4").with(none.0, none.1),
            200,
            &count("2"),
        );
        self.web
            .answers(owner(episodes).with("type", "18"), 200, &count("0"));
        self.web.answers(owner("/library/metadata/200"), 200, SHOWS);
        let history = "/status/sessions/history/all";
        self.web.answers(owner(history), 200, HISTORY);
        self.web
            .answers(owner(history).with(none.0, none.1), 200, &count("4"));
        self.web.answers(owner("/playlists"), 200, PLAYLISTS);
        self.web.answers(owner("/livetv/dvrs"), 200, DVRS);
    }
}
