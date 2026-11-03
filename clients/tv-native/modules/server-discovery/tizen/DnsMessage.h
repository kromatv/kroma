#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace kroma::discovery {

enum class RecordType : std::uint16_t {
  A = 1,
  Ptr = 12,
  Srv = 33,
};

struct Question {
  std::string name;
  RecordType type;
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
std::vector<std::uint8_t> encodeQuery(const std::vector<Question> &questions);

/// Every answer, authority and additional record of a DNS response, or nullopt
/// for a message that is a query or does not parse. Records of other types
/// than A, PTR and SRV come back with only `name` and `type`.
std::optional<std::vector<Record>> parseResponse(const std::uint8_t *data, std::size_t size);

/// `name` in ASCII lower case, the form two names are compared in.
std::string foldedName(const std::string &name);

} // namespace kroma::discovery
