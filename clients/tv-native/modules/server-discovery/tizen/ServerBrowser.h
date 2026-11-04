#pragma once

#include "ServiceCollector.h"

#include <chrono>
#include <string>
#include <system_error>
#include <vector>

namespace kroma::discovery {

/// What one browse found. `error` says why the socket could not be opened, in
/// which case `servers` is empty.
struct BrowseResult {
  std::vector<BrowsedServer> servers;
  std::error_code error;
};

/// Browses the DNS-SD service type `serviceType` (such as `_kroma._tcp.local`)
/// for `timeout` with mDNS one-shot queries (RFC 6762, sections 5.1 and 6.7)
/// and returns every instance whose SRV record arrived, its host an IPv4
/// address.
BrowseResult browseServices(const std::string &serviceType, std::chrono::milliseconds timeout);

} // namespace kroma::discovery
