#include "ServerBrowser.h"

#include "DnsMessage.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <array>
#include <cerrno>
#include <map>
#include <system_error>

namespace kroma::discovery {

namespace {

constexpr const char *kMdnsGroup = "224.0.0.251";
constexpr std::uint16_t kMdnsPort = 5353;
constexpr int kMulticastTtl = 255;
constexpr std::size_t kMaxPacket = 9000;
constexpr int kQueryRounds = 3;

using Clock = std::chrono::steady_clock;

struct Instance {
  std::string name;
  std::string label;
  std::string target;
  std::uint16_t port = 0;
  std::uint32_t source = 0;
  bool resolved = false;
};

class Socket {
 public:
  Socket() : fd_(::socket(AF_INET, SOCK_DGRAM | SOCK_CLOEXEC, 0)) {
    if (fd_ < 0) throw std::system_error(errno, std::generic_category(), "socket");
    const int ttl = kMulticastTtl;
    ::setsockopt(fd_, IPPROTO_IP, IP_MULTICAST_TTL, &ttl, sizeof ttl);
    sockaddr_in any{};
    any.sin_family = AF_INET;
    any.sin_addr.s_addr = htonl(INADDR_ANY);
    if (::bind(fd_, reinterpret_cast<const sockaddr *>(&any), sizeof any) != 0) {
      const int error = errno;
      ::close(fd_);
      throw std::system_error(error, std::generic_category(), "bind");
    }
  }

  Socket(const Socket &) = delete;
  Socket &operator=(const Socket &) = delete;

  ~Socket() {
    ::close(fd_);
  }

  void sendQuery(const std::vector<std::uint8_t> &query) const {
    sockaddr_in group{};
    group.sin_family = AF_INET;
    group.sin_port = htons(kMdnsPort);
    ::inet_pton(AF_INET, kMdnsGroup, &group.sin_addr);
    ::sendto(fd_, query.data(), query.size(), 0, reinterpret_cast<const sockaddr *>(&group), sizeof group);
  }

  int fd() const {
    return fd_;
  }

 private:
  int fd_;
};

class Collector {
 public:
  explicit Collector(std::string serviceType) : serviceType_(std::move(serviceType)), folded_(foldedName(serviceType_)) {}

  std::vector<Question> questions() const {
    std::vector<Question> asked{{serviceType_, RecordType::Ptr}};
    for (const auto &[key, instance] : instances_) {
      if (!instance.resolved) {
        asked.push_back({instance.name, RecordType::Srv});
      } else if (!addresses_.contains(foldedName(instance.target))) {
        asked.push_back({instance.target, RecordType::A});
      }
    }
    return asked;
  }

  void add(const std::vector<Record> &records, std::uint32_t source) {
    for (const auto &record : records) {
      const auto owner = foldedName(record.name);
      if (record.type == static_cast<std::uint16_t>(RecordType::Ptr) && owner == folded_) {
        auto &instance = instances_[foldedName(record.target)];
        instance.name = record.target;
        instance.label = record.targetFirstLabel;
      } else if (record.type == static_cast<std::uint16_t>(RecordType::A) && record.ipv4 != 0) {
        addresses_.emplace(owner, record.ipv4);
      }
    }
    for (const auto &record : records) {
      if (record.type != static_cast<std::uint16_t>(RecordType::Srv)) continue;
      auto found = instances_.find(foldedName(record.name));
      if (found == instances_.end()) continue;
      found->second.target = record.target;
      found->second.port = record.port;
      found->second.source = source;
      found->second.resolved = true;
    }
  }

  std::vector<BrowsedServer> servers() const {
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
      found.push_back({instance.label, text.data(), instance.port});
    }
    return found;
  }

 private:
  std::string serviceType_;
  std::string folded_;
  std::map<std::string, Instance> instances_;
  std::map<std::string, std::uint32_t> addresses_;
};

void receive(const Socket &socket, Collector &collector, Clock::time_point until) {
  std::array<std::uint8_t, kMaxPacket> buffer{};
  for (auto now = Clock::now(); now < until; now = Clock::now()) {
    pollfd ready{.fd = socket.fd(), .events = POLLIN, .revents = 0};
    const auto wait = std::chrono::ceil<std::chrono::milliseconds>(until - now).count();
    const int polled = ::poll(&ready, 1, static_cast<int>(wait));
    if (polled < 0 && errno == EINTR) continue;
    if (polled <= 0) return;
    sockaddr_in from{};
    socklen_t fromLength = sizeof from;
    const auto size = ::recvfrom(
        socket.fd(), buffer.data(), buffer.size(), 0, reinterpret_cast<sockaddr *>(&from), &fromLength);
    if (size <= 0) continue;
    if (auto records = parseResponse(buffer.data(), static_cast<std::size_t>(size))) {
      collector.add(*records, ntohl(from.sin_addr.s_addr));
    }
  }
}

} // namespace

std::vector<BrowsedServer> browseServices(const std::string &serviceType, std::chrono::milliseconds timeout) {
  Socket socket;
  Collector collector(serviceType);
  const auto start = Clock::now();
  for (int round = 1; round <= kQueryRounds; ++round) {
    socket.sendQuery(encodeQuery(collector.questions()));
    receive(socket, collector, start + timeout * round / kQueryRounds);
  }
  return collector.servers();
}

} // namespace kroma::discovery
