#include "ServerBrowser.h"

#include "expo/ExpoModuleRegistry.h"
#include "expo/ModuleDefinition.h"
#include "src/logging/Log.h"

#include <algorithm>
#include <string>
#include <thread>

namespace kroma::discovery {

namespace {

constexpr const char *kServiceType = "_kroma._tcp.local";
constexpr double kMaxTimeoutMs = 10000;

folly::dynamic browseOrNothing(double timeoutMs) {
  const auto bounded = std::clamp(timeoutMs, 0.0, kMaxTimeoutMs);
  const auto result = browseServices(kServiceType, std::chrono::milliseconds(static_cast<long>(bounded)));
  if (result.error) rntizen::log(rntizen::LogLevel::Warning, "ServerDiscovery: " + result.error.message());
  folly::dynamic found = folly::dynamic::array();
  for (const auto &server : result.servers) {
    found.push_back(folly::dynamic::object("name", server.name)("host", server.host)("port", server.port));
  }
  return found;
}

class ServerDiscoveryModule final : public rntizen::expo::Module {
 public:
  rntizen::expo::ModuleDefinition definition() override {
    return rntizen::expo::ModuleDefinition("ServerDiscovery")
        .asyncFunction("browse", [](double timeoutMs, rntizen::expo::Promise promise) {
          std::thread([timeoutMs, promise] { promise.resolve(browseOrNothing(timeoutMs)); }).detach();
        });
  }
};

} // namespace

} // namespace kroma::discovery

RN_TIZEN_EXPO_MODULE(ServerDiscovery, kroma::discovery::ServerDiscoveryModule);
