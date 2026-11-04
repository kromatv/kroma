#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace kroma::discovery {

/// The record types a browse asks for and reads: an IPv4 address (RFC 1035,
/// section 3.4.1), a pointer (section 3.3.12) and a service location (RFC 2782).
inline constexpr std::uint16_t kTypeA = 1;
inline constexpr std::uint16_t kTypePtr = 12;
inline constexpr std::uint16_t kTypeSrv = 33;

struct Question {
  std::string name;
  std::uint16_t type = 0;
};

/// One resource record of a response. `name` and `target` are dotted, without
/// the root's trailing dot, and keep their case: DNS compares names
/// case-insensitively (RFC 1035, section 2.3.3).
struct Record {
  std::string name;
  std::uint16_t type = 0;
  std::string target;
  std::string targetFirstLabel;
  std::uint16_t port = 0;
  std::uint32_t ipv4 = 0;
};

/// A DNS query asking every question, with ID 0 and no flags: an mDNS one-shot
/// query (RFC 6762, section 5.1).
std::vector<std::byte> encodeQuery(const std::vector<Question> &questions);

/// Every answer, authority and additional record of a DNS response, or nullopt
/// for a message that is a query or does not parse. Records of other types
/// than A, PTR and SRV come back with only `name` and `type`.
std::optional<std::vector<Record>> parseResponse(std::span<const std::byte> message);

/// `name` in ASCII lower case, the form two names are compared in.
std::string foldedName(std::string_view name);

} // namespace kroma::discovery
