#pragma once

#include "DnsMessage.h"

#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace kroma::discovery {

/// One server, as the network described it.
struct BrowsedServer {
  std::string name;
  std::string host;
  int port = 0;
};

/// What a DNS-SD browse of one service type has learnt so far (RFC 6763,
/// sections 4 and 5): the instances a PTR record named, the host and port each
/// one's SRV record gave, and the addresses A records gave those hosts.
class ServiceCollector {
 public:
  explicit ServiceCollector(std::string serviceType);

  /// What the next query asks: the service type's PTR, the SRV of every
  /// instance not resolved yet, and the A of every resolved host without an
  /// address.
  std::vector<Question> questions() const;

  /// Takes in the records of one response that `source`, an IPv4 address in
  /// host byte order, sent.
  void add(const std::vector<Record> &records, std::uint32_t source);

  /// Every instance whose SRV record arrived with a port, at its host's A
  /// address, else at the address that sent the SRV record.
  std::vector<BrowsedServer> servers() const;

 private:
  struct Instance {
    std::string name;
    std::string label;
    std::string target;
    std::uint16_t port = 0;
    std::uint32_t source = 0;
    bool resolved = false;
  };

  std::string serviceType_;
  std::string folded_;
  std::map<std::string, Instance, std::less<>> instances_;
  std::map<std::string, std::uint32_t, std::less<>> addresses_;
};

} // namespace kroma::discovery
