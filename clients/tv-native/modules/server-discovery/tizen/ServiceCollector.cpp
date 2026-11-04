#include "ServiceCollector.h"

#include <arpa/inet.h>
#include <netinet/in.h>

#include <array>
#include <utility>

namespace kroma::discovery {

ServiceCollector::ServiceCollector(std::string serviceType)
    : serviceType_(std::move(serviceType)), folded_(foldedName(serviceType_)) {}

std::vector<Question> ServiceCollector::questions() const {
  std::vector<Question> asked{{serviceType_, kTypePtr}};
  for (const auto &[key, instance] : instances_) {
    if (!instance.resolved) {
      asked.emplace_back(instance.name, kTypeSrv);
    } else if (!addresses_.contains(foldedName(instance.target))) {
      asked.emplace_back(instance.target, kTypeA);
    }
  }
  return asked;
}

void ServiceCollector::add(const std::vector<Record> &records, std::uint32_t source) {
  for (const auto &record : records) {
    const auto owner = foldedName(record.name);
    if (record.type == kTypePtr && owner == folded_) {
      auto &instance = instances_[foldedName(record.target)];
      instance.name = record.target;
      instance.label = record.targetFirstLabel;
    } else if (record.type == kTypeA && record.ipv4 != 0) {
      addresses_.try_emplace(owner, record.ipv4);
    }
  }
  for (const auto &record : records) {
    if (record.type != kTypeSrv) continue;
    auto found = instances_.find(foldedName(record.name));
    if (found == instances_.end()) continue;
    found->second.target = record.target;
    found->second.port = record.port;
    found->second.source = source;
    found->second.resolved = true;
  }
}

std::vector<BrowsedServer> ServiceCollector::servers() const {
  std::vector<BrowsedServer> found;
  for (const auto &[key, instance] : instances_) {
    if (!instance.resolved || instance.port == 0) continue;
    const auto address = addresses_.find(foldedName(instance.target));
    const auto ipv4 = address == addresses_.end() ? instance.source : address->second;
    if (ipv4 == 0) continue;
    in_addr raw{};
    raw.s_addr = htonl(ipv4);
    std::array<char, INET_ADDRSTRLEN> text{};
    ::inet_ntop(AF_INET, &raw, text.data(), text.size());
    found.emplace_back(instance.label, text.data(), instance.port);
  }
  return found;
}

} // namespace kroma::discovery
