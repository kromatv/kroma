#pragma once

#include <chrono>
#include <string>
#include <vector>

namespace kroma::discovery {

/// One server, as the network described it.
struct BrowsedServer {
  std::string name;
  std::string host;
  int port = 0;
};

/// Browses the DNS-SD service type `serviceType` (such as `_kroma._tcp.local`)
/// for `timeout` with mDNS one-shot queries (RFC 6762, sections 5.1 and 6.7)
/// and returns every instance whose SRV record arrived, its host an IPv4
/// address. Throws `std::system_error` when the socket cannot be opened.
std::vector<BrowsedServer> browseServices(const std::string &serviceType, std::chrono::milliseconds timeout);

} // namespace kroma::discovery
