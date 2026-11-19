use super::*;

use crate::test_support::{get, mint, Household, ACCOUNT, LOCAL, MACHINE};

const CLIENT: &str = "client-for-a-test";

fn account(home: &Household) -> Account<'_> {
    Account {
        web: &*home.web,
        client: CLIENT,
    }
}

fn answering(home: &Household, path: &str, status: u16, body: &str) {
    let url = format!("{ACCOUNT}{path}");
    home.web.answers(
        get(&url).with("X-Plex-Token", &home.account_token),
        status,
        body,
    );
}

#[test]
fn every_call_names_this_install_and_carries_the_token_as_a_header() {
    let home = Household::new();

    account(&home).me(&home.account_token).unwrap();

    let call = &home.web.asked(&format!("{ACCOUNT}/api/v2/user"))[0];
    assert_eq!(call.value("X-Plex-Client-Identifier"), Some(CLIENT));
    assert_eq!(call.value("X-Plex-Product"), Some("KROMA"));
    assert_eq!(
        call.value("X-Plex-Token"),
        Some(home.account_token.as_str())
    );
    assert_eq!(call.value("Accept"), Some("application/xml"));
}

#[test]
fn the_account_is_known_by_its_id_its_name_and_its_address() {
    let home = Household::new();

    let me = account(&home).me(&home.account_token).unwrap();

    assert_eq!((me.id.as_str(), me.name.as_str()), ("7001", "Ana"));
    assert_eq!(me.email.as_deref(), Some("ana@example.org"));
}

#[test]
fn a_token_plex_does_not_accept_is_a_refused_sign_in() {
    let home = Household::new();

    let me = account(&home).me(&mint("stale"));

    assert_eq!(me.err(), Some(Failure::Denied("plex.tv")));
}

#[test]
fn an_answer_that_is_not_what_plex_documents_is_unreadable() {
    let home = Household::new();
    answering(&home, "/api/v2/user", 200, "<html>Maintenance</html");

    let me = account(&home).me(&home.account_token);

    assert_eq!(me.err(), Some(Failure::Unreadable("plex.tv")));
}

#[test]
fn only_the_servers_the_account_owns_are_listed_each_with_its_own_token() {
    let home = Household::new();

    let servers = account(&home).servers(&home.account_token).unwrap();

    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].id, MACHINE);
    assert_eq!(servers[0].token, home.owner_token);
    assert_eq!(servers[0].connections.len(), 3);
    assert_eq!(servers[0].connections[2].uri, LOCAL);
}

#[test]
fn the_servers_are_asked_for_with_their_secure_and_relayed_addresses() {
    let home = Household::new();

    account(&home).servers(&home.account_token).unwrap();

    let call = &home.web.asked(&format!("{ACCOUNT}/api/v2/resources"))[0];
    let asked = ["includeHttps", "includeRelay", "includeIPv6"].map(|name| call.value(name));
    assert_eq!(asked, [Some("1"); 3]);
}

#[test]
fn a_server_is_shown_by_its_local_address_when_it_has_one() {
    let home = Household::new();
    answering(
        &home,
        "/api/v2/resources",
        200,
        r#"<resources>
             <resource name="Far" clientIdentifier="far" provides="server" owned="1" accessToken="not-used">
               <connections>
                 <connection protocol="https" address="198.51.100.7" port="8443" uri="https://198-51-100-7.h.plex.direct:8443" local="0" relay="1"/>
                 <connection protocol="https" address="2001:db8::7" port="32400" uri="https://2001-db8--7.h.plex.direct:32400" local="0" relay="0"/>
               </connections>
             </resource>
             <resource name="Bare" clientIdentifier="bare" provides="server" owned="1" accessToken="not-used"/>
           </resources>"#,
    );

    let servers = account(&home).servers(&home.account_token).unwrap();

    assert_eq!(
        servers[0].address().as_deref(),
        Some("https://[2001:db8::7]:32400")
    );
    assert_eq!(servers[1].address(), None);
}

#[test]
fn a_person_comes_with_their_pin_flag_their_filters_and_the_servers_shared_with_them() {
    let home = Household::new();

    let friends = account(&home).friends(&home.account_token).unwrap();

    let chloe = friends.iter().find(|friend| friend.id == "7003").unwrap();
    let dan = friends.iter().find(|friend| friend.id == "7004").unwrap();
    assert_eq!(friends.len(), 6);
    assert_eq!(chloe.title.as_deref(), Some("Chloé"));
    assert_eq!(chloe.username, None);
    assert_eq!(chloe.filters, ["contentRating=G%2CPG", "label=kids"]);
    assert!(chloe.servers[0].all_libraries);
    assert!(dan.protected);
    assert!(!chloe.protected);
}

#[test]
fn a_row_of_a_server_gives_a_persons_token_and_the_libraries_shared_with_them() {
    let home = Household::new();

    let shares = account(&home).shares(&home.account_token, MACHINE).unwrap();

    assert_eq!(shares.len(), 3);
    assert_eq!(shares[0].user_id, "7002");
    assert_eq!(shares[0].token.as_deref(), Some(home.ben_token.as_str()));
    assert_eq!(shares[0].libraries, ["1", "3"]);
    assert!(shares[1].all_libraries);
}

#[test]
fn a_server_id_that_is_not_one_plex_writes_is_never_put_in_an_address() {
    let home = Household::new();

    let shares = account(&home).shares(&home.account_token, "x/../../v2/user");

    assert!(shares.is_err());
    assert!(home.web.seen().is_empty());
}
