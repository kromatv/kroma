use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::PoisonError;

use super::reach::{host, same_network};
use super::HandoffInner;
use crate::services::direct::{is_private_client, shares_a_prefix};

/// What this server knows of the house it sits in: the public IPv4 the house
/// leaves through, and the addresses this machine holds there, the private
/// IPv4 ones and the IPv6 ones. A server that knows none of it places nobody.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Household {
    pub public_v4: Option<Ipv4Addr>,
    pub own_v4: Vec<Ipv4Addr>,
    pub own_v6: Vec<Ipv6Addr>,
}

impl Household {
    /// Whether `a` and `b` are both in this server's house although their
    /// addresses do not agree: one reached the server across its own network,
    /// and the other left the house and came back in through its public
    /// address, the way a browser on a tunnelled name does. Two addresses on
    /// the network itself are left to [`same_network`], which still wants them
    /// on one subnet.
    ///
    /// A caller on the server's own machine arrives from loopback, which is on
    /// no subnet at all. It is in the house by definition, so it shares it with
    /// a device on a subnet this machine holds an address on.
    pub fn joins(&self, a: &str, b: &str) -> bool {
        let (Some(a), Some(b)) = (host(a), host(b)) else {
            return false;
        };
        match (a.is_loopback(), b.is_loopback()) {
            (true, true) => return false,
            (true, false) => return self.beside(b),
            (false, true) => return self.beside(a),
            (false, false) => {}
        }
        match (is_private_client(a), is_private_client(b)) {
            (true, true) => false,
            (true, false) => self.faces(b),
            (false, true) => self.faces(a),
            (false, false) => self.faces(a) && self.faces(b),
        }
    }

    fn beside(&self, ip: IpAddr) -> bool {
        let IpAddr::V4(v4) = ip else {
            return false;
        };
        self.own_v4
            .iter()
            .any(|own| own.octets()[..3] == v4.octets()[..3])
    }

    fn faces(&self, ip: IpAddr) -> bool {
        match ip {
            IpAddr::V4(v4) => self.public_v4 == Some(v4),
            IpAddr::V6(v6) => shares_a_prefix(v6, &self.own_v6),
        }
    }
}

impl HandoffInner {
    /// Tell the handoff what the server currently knows of its own house, so a
    /// television on its network and a caller who came back in through the
    /// house's public address are placed together. Unknown until told.
    pub fn settle_in(&self, home: Household) {
        let mut held = self.home.write().unwrap_or_else(PoisonError::into_inner);
        if *held != home {
            *held = home;
        }
    }

    pub(super) fn reaches(&self, beacon_ip: &str, viewer_ip: &str) -> bool {
        same_network(beacon_ip, viewer_ip)
            || self
                .home
                .read()
                .unwrap_or_else(PoisonError::into_inner)
                .joins(beacon_ip, viewer_ip)
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{announce, grant, HOUSEHOLD, TV};
    use super::super::{new, Refusal};
    use super::*;

    const HOME: Household = Household {
        public_v4: Some(Ipv4Addr::new(203, 0, 113, 7)),
        own_v4: Vec::new(),
        own_v6: Vec::new(),
    };

    fn home_on_the_network() -> Household {
        Household {
            own_v4: vec![Ipv4Addr::new(192, 168, 1, 10)],
            ..HOME
        }
    }

    #[test]
    fn a_caller_on_the_servers_own_machine_shares_the_house_with_a_device_on_its_subnet() {
        let home = home_on_the_network();

        assert!(home.joins("127.0.0.1", "192.168.1.20"));
        assert!(home.joins("192.168.1.20", "::1"));
    }

    #[test]
    fn a_caller_on_the_servers_own_machine_is_not_beside_another_subnet_or_the_internet() {
        let home = home_on_the_network();

        assert!(!home.joins("127.0.0.1", "10.0.0.7"));
        assert!(!home.joins("127.0.0.1", "203.0.113.9"));
        assert!(!home.joins("127.0.0.1", "127.0.0.1"));
        assert!(!HOME.joins("127.0.0.1", "192.168.1.20"));
    }

    fn dual_stack_home() -> Household {
        Household {
            own_v6: vec!["2001:db8:1:2::10".parse().unwrap()],
            ..HOME
        }
    }

    #[test]
    fn a_device_on_the_network_and_one_back_in_through_the_public_address_share_a_house() {
        assert!(HOME.joins("192.168.1.20", "203.0.113.7"));
        assert!(HOME.joins("203.0.113.7", "192.168.1.20"));
        assert!(HOME.joins("::ffff:192.168.1.20", "203.0.113.7"));
    }

    #[test]
    fn another_public_address_is_another_house() {
        assert!(!HOME.joins("192.168.1.20", "203.0.113.9"));
        assert!(!HOME.joins("203.0.113.9", "203.0.113.7"));
    }

    #[test]
    fn a_server_that_does_not_know_its_public_address_places_nobody() {
        assert!(!Household::default().joins("192.168.1.20", "203.0.113.7"));
    }

    #[test]
    fn two_devices_on_the_network_itself_are_left_to_the_subnet_rule() {
        assert!(!HOME.joins("192.168.1.20", "10.0.0.7"));
        assert!(!HOME.joins("192.168.1.20", "192.168.1.50"));
    }

    #[test]
    fn the_house_is_joined_across_its_two_address_families() {
        let home = dual_stack_home();

        assert!(home.joins("192.168.1.20", "2001:db8:1:2::99"));
        assert!(home.joins("203.0.113.7", "2001:db8:1:2::99"));
        assert!(!home.joins("192.168.1.20", "2001:db8:1:3::99"));
    }

    #[test]
    fn an_address_that_is_not_one_joins_nothing() {
        assert!(!HOME.joins("not-an-ip", "203.0.113.7"));
        assert!(!HOME.joins("192.168.1.20", ""));
    }

    fn settled() -> Household {
        Household {
            public_v4: HOUSEHOLD.parse().ok(),
            own_v4: Vec::new(),
            own_v6: Vec::new(),
        }
    }

    #[test]
    fn a_tv_on_the_servers_network_is_listed_to_a_caller_back_in_through_its_public_address() {
        let h = new();
        h.settle_in(settled());
        let announced = announce(&h, "tv-salon-01", "Salon", TV);

        let rows = h.nearby(HOUSEHOLD);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].handle, announced.handle);
        assert!(grant(&h, &announced.handle, HOUSEHOLD).is_ok());
    }

    #[test]
    fn until_the_server_knows_its_house_that_caller_sees_nothing() {
        let h = new();
        let announced = announce(&h, "tv-salon-01", "Salon", TV);

        assert!(h.nearby(HOUSEHOLD).is_empty());
        assert!(matches!(
            grant(&h, &announced.handle, HOUSEHOLD),
            Err(Refusal::Gone)
        ));
    }

    #[test]
    fn a_house_the_server_no_longer_holds_stops_placing_anyone() {
        let h = new();
        h.settle_in(settled());
        announce(&h, "tv-salon-01", "Salon", TV);

        h.settle_in(Household::default());

        assert!(h.nearby(HOUSEHOLD).is_empty());
    }
}
