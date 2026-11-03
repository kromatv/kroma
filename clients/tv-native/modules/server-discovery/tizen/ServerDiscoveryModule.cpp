#include "ServerBrowser.h"

#include "expo/ExpoModuleRegistry.h"
#include "expo/ModuleDefinition.h"
#include "src/logging/Log.h"

#include <algorithm>
#include <exception>
#include <string>
#include <thread>

namespace kroma::discovery {

namespace {

constexpr const char *kServiceType = "_kroma._tcp.local";
constexpr double kMaxTimeoutMs = 10000;

folly::dynamic browseOrNothing(double timeoutMs) {
  const auto bounded = std::clamp(timeoutMs, 0.0, kMaxTimeoutMs);
  folly::dynamic found = folly::dynamic::array();
  try {
    for (const auto &server : browseServices(kServiceType, std::chrono::milliseconds(static_cast<long>(bounded)))) {
      found.push_back(folly::dynamic::object("name", server.name)("host", server.host)("port", server.port));
    }
  } catch (const std::exception &error) {
    rntizen::log(rntizen::LogLevel::Warning, std::string("ServerDiscovery: ") + error.what());
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
