#include "ServerBrowser.h"

#include "DnsMessage.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <array>
#include <bit>
#include <cerrno>
#include <span>

namespace kroma::discovery {

namespace {

constexpr const char *kMdnsGroup = "224.0.0.251";
constexpr std::uint16_t kMdnsPort = 5353;
constexpr int kMulticastTtl = 255;
constexpr std::size_t kMaxPacket = 9000;
constexpr int kQueryRounds = 3;

using Clock = std::chrono::steady_clock;

std::error_code lastError() {
  return {errno, std::generic_category()};
}

class Socket {
 public:
  Socket() {
    if (fd_ < 0) {
      error_ = lastError();
      return;
    }
    const int ttl = kMulticastTtl;
    ::setsockopt(fd_, IPPROTO_IP, IP_MULTICAST_TTL, &ttl, sizeof ttl);
    sockaddr_in any{};
    any.sin_family = AF_INET;
    any.sin_addr.s_addr = htonl(INADDR_ANY);
    const auto address = std::bit_cast<sockaddr>(any);
    if (::bind(fd_, &address, sizeof address) != 0) {
      error_ = lastError();
      ::close(fd_);
      fd_ = -1;
    }
  }

  Socket(const Socket &) = delete;
  Socket &operator=(const Socket &) = delete;

  ~Socket() {
    if (fd_ >= 0) ::close(fd_);
  }

  std::error_code error() const {
    return error_;
  }

  void sendQuery(std::span<const std::byte> query) const {
    sockaddr_in group{};
    group.sin_family = AF_INET;
    group.sin_port = htons(kMdnsPort);
    ::inet_pton(AF_INET, kMdnsGroup, &group.sin_addr);
    const auto address = std::bit_cast<sockaddr>(group);
    ::sendto(fd_, query.data(), query.size(), 0, &address, sizeof address);
  }

  int fd() const {
    return fd_;
  }

 private:
  int fd_ = ::socket(AF_INET, SOCK_DGRAM | SOCK_CLOEXEC, 0);
  std::error_code error_;
};

void receive(const Socket &socket, ServiceCollector &collector, Clock::time_point until) {
  std::array<std::byte, kMaxPacket> buffer{};
  for (auto now = Clock::now(); now < until; now = Clock::now()) {
    pollfd ready{.fd = socket.fd(), .events = POLLIN, .revents = 0};
    const auto wait = std::chrono::ceil<std::chrono::milliseconds>(until - now).count();
    const int polled = ::poll(&ready, 1, static_cast<int>(wait));
    if (polled < 0 && errno == EINTR) continue;
    if (polled <= 0) return;
    sockaddr from{};
    socklen_t fromLength = sizeof from;
    const auto size = ::recvfrom(socket.fd(), buffer.data(), buffer.size(), 0, &from, &fromLength);
    if (size <= 0) continue;
    if (auto records = parseResponse(std::span(buffer).first(static_cast<std::size_t>(size)))) {
      collector.add(*records, ntohl(std::bit_cast<sockaddr_in>(from).sin_addr.s_addr));
    }
  }
}

} // namespace

BrowseResult browseServices(const std::string &serviceType, std::chrono::milliseconds timeout) {
  const Socket socket;
  if (socket.error()) return {.servers = {}, .error = socket.error()};
  ServiceCollector collector(serviceType);
  const auto start = Clock::now();
  for (int round = 1; round <= kQueryRounds; ++round) {
    socket.sendQuery(encodeQuery(collector.questions()));
    receive(socket, collector, start + timeout * round / kQueryRounds);
  }
  return {.servers = collector.servers(), .error = {}};
}

} // namespace kroma::discovery
