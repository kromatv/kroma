#include "../DnsMessage.h"
#include "../ServiceCollector.h"

#include <cstdio>
#include <functional>
#include <source_location>
#include <string>
#include <string_view>
#include <vector>

namespace {

using namespace kroma::discovery;

constexpr std::uint16_t kResponse = 0x8400;
constexpr std::uint16_t kTypeTxt = 16;
constexpr std::uint32_t kServerAddress = 0xC0A8017C;
constexpr std::uint32_t kSenderAddress = 0xC0A80102;

int failures = 0;

void expect(bool holds, std::string_view what, std::source_location where = std::source_location::current()) {
  if (holds) return;
  ++failures;
  std::printf("line %u: expected %.*s\n", static_cast<unsigned>(where.line()), static_cast<int>(what.size()), what.data());
}

class Message {
 public:
  Message(std::uint16_t flags, std::uint16_t questions, std::uint16_t answers, std::uint16_t additional = 0) {
    u16(0).u16(flags).u16(questions).u16(answers).u16(0).u16(additional);
  }

  Message &u8(unsigned value) {
    bytes_.push_back(static_cast<std::byte>(value));
    return *this;
  }

  Message &u16(std::uint16_t value) {
    return u8(value >> 8).u8(value & 0xFF);
  }

  Message &u32(std::uint32_t value) {
    return u16(static_cast<std::uint16_t>(value >> 16)).u16(static_cast<std::uint16_t>(value & 0xFFFF));
  }

  Message &name(std::string_view dotted) {
    labels(dotted);
    return u8(0);
  }

  Message &labels(std::string_view dotted) {
    std::size_t start = 0;
    while (start < dotted.size()) {
      auto end = dotted.find('.', start);
      if (end == std::string_view::npos) end = dotted.size();
      u8(static_cast<unsigned>(end - start));
      for (const char character : dotted.substr(start, end - start)) u8(static_cast<unsigned char>(character));
      start = end + 1;
    }
    return *this;
  }

  Message &pointer(std::size_t offset) {
    return u8(0xC0 | static_cast<unsigned>(offset >> 8)).u8(offset & 0xFF);
  }

  Message &head(std::string_view owner, std::uint16_t type, std::uint16_t length) {
    return name(owner).u16(type).u16(1).u32(120).u16(length);
  }

  Message &ptr(std::string_view owner, std::string_view target) {
    return head(owner, kTypePtr, static_cast<std::uint16_t>(target.size() + 2)).name(target);
  }

  Message &srv(std::string_view owner, std::uint16_t port, std::string_view target) {
    return head(owner, kTypeSrv, static_cast<std::uint16_t>(target.size() + 8)).u16(0).u16(0).u16(port).name(target);
  }

  Message &a(std::string_view owner, std::uint32_t address) {
    return head(owner, kTypeA, 4).u32(address);
  }

  std::size_t size() const {
    return bytes_.size();
  }

  std::optional<std::vector<Record>> parsed() const {
    return parseResponse(bytes_);
  }

 private:
  std::vector<std::byte> bytes_;
};

std::vector<Record> announcement(std::string_view instance, std::uint16_t port, std::string_view host) {
  return *Message(kResponse, 0, 1, 2)
              .ptr("_kroma._tcp.local", std::string(instance) + "._kroma._tcp.local")
              .srv(std::string(instance) + "._kroma._tcp.local", port, host)
              .a(host, kServerAddress)
              .parsed();
}

void aQueryCarriesEveryQuestionWithClassIn() {
  const auto query = encodeQuery({{"_kroma._tcp.local", kTypePtr}, {"KROMA._kroma._tcp.local", kTypeSrv}});

  expect(query.size() == 12 + 19 + 4 + 25 + 4, "the header and two questions");
  expect(query[5] == std::byte{2}, "a question count of two");
  expect(query[12] == std::byte{6} && query[13] == std::byte{'_'}, "a first label of six bytes");
  expect(query[31] == std::byte{0} && query[32] == std::byte{kTypePtr}, "the PTR type after the first name");
  expect(query[34] == std::byte{1}, "class IN");
}

void aQueryLeavesOutEmptyAndOverlongLabels() {
  const auto query = encodeQuery({{"a.." + std::string(64, 'b') + ".c", kTypeA}});

  expect(query.size() == 12 + 5 + 4, "only the labels a and c");
}

void aResponseGivesItsPtrSrvAndARecords() {
  const auto records = announcement("KROMA", 4040, "kroma.local");

  expect(records.size() == 3, "three records");
  expect(records[0].type == kTypePtr && records[0].target == "KROMA._kroma._tcp.local", "the PTR's target");
  expect(records[0].targetFirstLabel == "KROMA", "the instance label");
  expect(records[1].type == kTypeSrv && records[1].port == 4040 && records[1].target == "kroma.local", "the SRV");
  expect(records[2].type == kTypeA && records[2].ipv4 == kServerAddress, "the A address");
}

void aCompressedNameFollowsItsPointer() {
  Message message(kResponse, 0, 2);
  message.head("_kroma._tcp.local", kTypePtr, 8);
  const auto instanceAt = message.size();
  message.labels("KROMA").pointer(12);
  message.pointer(instanceAt).u16(kTypeSrv).u16(1).u32(120).u16(19).u16(0).u16(0).u16(4040).name("kroma.local");

  const auto records = message.parsed();

  expect(records.has_value() && records->size() == 2, "two records");
  expect((*records)[0].target == "KROMA._kroma._tcp.local", "the PTR target through the pointer");
  expect((*records)[1].name == "KROMA._kroma._tcp.local", "the SRV owner through the pointer");
}

void aResponseSkipsItsQuestions() {
  const auto records = Message(kResponse, 1, 1).name("_kroma._tcp.local").u16(kTypePtr).u16(1).a("kroma.local", 1).parsed();

  expect(records.has_value() && records->size() == 1 && (*records)[0].ipv4 == 1, "the answer after the question");
}

void anUnknownRecordKeepsOnlyItsNameAndType() {
  const auto records = Message(kResponse, 0, 1).head("KROMA._kroma._tcp.local", kTypeTxt, 3).u8(2).u8('v').u8('1').parsed();

  expect(records.has_value() && records->size() == 1, "one record");
  expect((*records)[0].type == kTypeTxt && (*records)[0].target.empty(), "a TXT record with no target");
}

void aQueryIsNotAResponse() {
  expect(!Message(0, 0, 1).a("kroma.local", 1).parsed(), "nullopt for a query");
}

void aMessageShorterThanItsHeaderDoesNotParse() {
  const std::vector<std::byte> header(11, std::byte{0});

  expect(!parseResponse(header), "nullopt for eleven bytes");
}

void aPointerLoopDoesNotParse() {
  expect(!Message(kResponse, 0, 1).pointer(12).u16(kTypeA).u16(1).u32(120).u16(4).u32(1).parsed(), "nullopt");
}

void aPointerCutShortDoesNotParse() {
  expect(!Message(kResponse, 0, 1).u8(0xC0).parsed(), "nullopt for half a pointer");
}

void aReservedLabelTypeDoesNotParse() {
  expect(!Message(kResponse, 0, 1).u8(0x40).u8(0).parsed(), "nullopt for a 0x40 label");
}

void aNameOverTwoHundredFiftyFiveBytesDoesNotParse() {
  std::string longName;
  for (int label = 0; label < 5; ++label) longName += std::string(60, 'x') + ".";
  longName += "local";

  expect(!Message(kResponse, 0, 1).a(longName, 1).parsed(), "nullopt for a 311-byte name");
}

void aNameRunningOffTheEndDoesNotParse() {
  expect(!Message(kResponse, 0, 1).u8(5).u8('k').parsed(), "nullopt for a label longer than the message");
  expect(!Message(kResponse, 0, 1).u8(1).u8('k').parsed(), "nullopt for a name with no end");
}

void aRecordLongerThanTheMessageDoesNotParse() {
  expect(!Message(kResponse, 0, 1).head("kroma.local", kTypeA, 4).u16(1).parsed(), "nullopt for two of four bytes");
  expect(!Message(kResponse, 0, 1).name("kroma.local").u16(kTypeA).parsed(), "nullopt for a cut header");
}

void malformedRecordDataDoesNotParse() {
  expect(!Message(kResponse, 0, 1).head("kroma.local", kTypeA, 2).u16(1).parsed(), "nullopt for a two-byte A");
  expect(!Message(kResponse, 0, 1).head("x.local", kTypeSrv, 6).u16(0).u16(0).u16(1).parsed(), "nullopt for a short SRV");
  expect(!Message(kResponse, 0, 1).head("x.local", kTypePtr, 1).u8(0).parsed(), "nullopt for an empty PTR");
  expect(!Message(kResponse, 0, 1).head("x.local", kTypePtr, 10).name("k.local").u8(0).parsed(), "nullopt for a PTR shorter than its length");
  expect(!Message(kResponse, 0, 1).head("x.local", kTypeSrv, 16).u16(0).u16(0).u16(1).name("k.local").u8(0).parsed(), "nullopt for an SRV shorter than its length");
}

void aMissingQuestionDoesNotParse() {
  expect(!Message(kResponse, 1, 0).name("kroma.local").u16(kTypeA).parsed(), "nullopt for a question without its class");
  expect(!Message(kResponse, 1, 0).parsed(), "nullopt for a question count with no question");
}

void foldingLowersAsciiOnly() {
  expect(foldedName("KROMA._Kroma._TCP.local") == "kroma._kroma._tcp.local", "ASCII folded");
  expect(foldedName("\xC3\x89T\xC3\x89") == "\xC3\x89t\xC3\x89", "UTF-8 bytes kept");
}

void theFirstQuestionAsksForTheServiceType() {
  const ServiceCollector collector("_kroma._tcp.local");

  const auto questions = collector.questions();

  expect(questions.size() == 1 && questions[0].type == kTypePtr && questions[0].name == "_kroma._tcp.local", "a PTR");
}

void anInstanceIsAskedForItsSrvThenItsHostsAddress() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(*Message(kResponse, 0, 1).ptr("_kroma._tcp.local", "KROMA._kroma._tcp.local").parsed(), kSenderAddress);

  const auto beforeSrv = collector.questions();
  collector.add(*Message(kResponse, 0, 1).srv("KROMA._kroma._tcp.local", 4040, "kroma.local").parsed(), kSenderAddress);
  const auto afterSrv = collector.questions();

  expect(beforeSrv.size() == 2 && beforeSrv[1].type == kTypeSrv && beforeSrv[1].name == "KROMA._kroma._tcp.local", "an SRV question");
  expect(afterSrv.size() == 2 && afterSrv[1].type == kTypeA && afterSrv[1].name == "kroma.local", "an A question");
}

void aResolvedHostWithAnAddressIsNotAskedAgain() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(announcement("KROMA", 4040, "kroma.local"), kSenderAddress);

  expect(collector.questions().size() == 1, "the PTR question alone");
}

void aServerIsTheInstanceAtItsHostsAddress() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(announcement("KROMA", 4040, "kroma.local"), kSenderAddress);

  const auto servers = collector.servers();

  expect(servers.size() == 1, "one server");
  expect(servers[0].name == "KROMA" && servers[0].host == "192.168.1.124" && servers[0].port == 4040, "its name, host and port");
}

void namesMatchWhateverTheirCase() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(*Message(kResponse, 0, 3)
                     .ptr("_KROMA._tcp.local", "Salon._kroma._tcp.local")
                     .srv("SALON._kroma._tcp.local", 4040, "Salon.local")
                     .a("salon.LOCAL", kServerAddress)
                     .parsed(),
                kSenderAddress);

  const auto servers = collector.servers();

  expect(servers.size() == 1 && servers[0].name == "Salon" && servers[0].host == "192.168.1.124", "one server");
}

void aHostWithoutAnAddressIsReachedWhereItsSrvCameFrom() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(*Message(kResponse, 0, 2)
                     .ptr("_kroma._tcp.local", "KROMA._kroma._tcp.local")
                     .srv("KROMA._kroma._tcp.local", 4040, "kroma.local")
                     .parsed(),
                kSenderAddress);

  const auto servers = collector.servers();

  expect(servers.size() == 1 && servers[0].host == "192.168.1.2", "the sender's address");
}

void anInstanceWithoutAUsableSrvIsLeftOut() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(*Message(kResponse, 0, 3)
                     .ptr("_kroma._tcp.local", "Pending._kroma._tcp.local")
                     .ptr("_kroma._tcp.local", "NoPort._kroma._tcp.local")
                     .srv("NoPort._kroma._tcp.local", 0, "kroma.local")
                     .parsed(),
                kSenderAddress);
  collector.add(*Message(kResponse, 0, 2)
                     .ptr("_kroma._tcp.local", "Nowhere._kroma._tcp.local")
                     .srv("Nowhere._kroma._tcp.local", 4040, "nowhere.local")
                     .parsed(),
                0);

  expect(collector.servers().empty(), "no server");
}

void recordsOfOtherServicesAreIgnored() {
  ServiceCollector collector("_kroma._tcp.local");
  collector.add(*Message(kResponse, 0, 4)
                     .ptr("_airplay._tcp.local", "Living._airplay._tcp.local")
                     .srv("Living._airplay._tcp.local", 7000, "living.local")
                     .srv("Stray._kroma._tcp.local", 4040, "stray.local")
                     .a("unused.local", 0)
                     .parsed(),
                kSenderAddress);

  expect(collector.servers().empty() && collector.questions().size() == 1, "nothing learnt");
}

struct Case {
  const char *name;
  void (*run)();
};

constexpr Case kCases[] = {
    {"a query carries every question with class IN", aQueryCarriesEveryQuestionWithClassIn},
    {"a query leaves out empty and overlong labels", aQueryLeavesOutEmptyAndOverlongLabels},
    {"a response gives its PTR, SRV and A records", aResponseGivesItsPtrSrvAndARecords},
    {"a compressed name follows its pointer", aCompressedNameFollowsItsPointer},
    {"a response skips its questions", aResponseSkipsItsQuestions},
    {"an unknown record keeps only its name and type", anUnknownRecordKeepsOnlyItsNameAndType},
    {"a query is not a response", aQueryIsNotAResponse},
    {"a message shorter than its header does not parse", aMessageShorterThanItsHeaderDoesNotParse},
    {"a pointer loop does not parse", aPointerLoopDoesNotParse},
    {"a pointer cut short does not parse", aPointerCutShortDoesNotParse},
    {"a reserved label type does not parse", aReservedLabelTypeDoesNotParse},
    {"a name over 255 bytes does not parse", aNameOverTwoHundredFiftyFiveBytesDoesNotParse},
    {"a name running off the end does not parse", aNameRunningOffTheEndDoesNotParse},
    {"a record longer than the message does not parse", aRecordLongerThanTheMessageDoesNotParse},
    {"malformed record data does not parse", malformedRecordDataDoesNotParse},
    {"a missing question does not parse", aMissingQuestionDoesNotParse},
    {"folding lowers ASCII only", foldingLowersAsciiOnly},
    {"the first question asks for the service type", theFirstQuestionAsksForTheServiceType},
    {"an instance is asked for its SRV, then its host's address", anInstanceIsAskedForItsSrvThenItsHostsAddress},
    {"a resolved host with an address is not asked again", aResolvedHostWithAnAddressIsNotAskedAgain},
    {"a server is the instance at its host's address", aServerIsTheInstanceAtItsHostsAddress},
    {"names match whatever their case", namesMatchWhateverTheirCase},
    {"a host without an address is reached where its SRV came from", aHostWithoutAnAddressIsReachedWhereItsSrvCameFrom},
    {"an instance without a usable SRV is left out", anInstanceWithoutAUsableSrvIsLeftOut},
    {"records of other services are ignored", recordsOfOtherServicesAreIgnored},
};

} // namespace

int main(int argc, char **argv) {
  const std::vector<std::string_view> args(argv + 1, argv + argc);
  if (args.empty()) {
    for (const auto &each : kCases) std::printf("%s\n", each.name);
    return 0;
  }
  for (const auto &each : kCases) {
    if (each.name != args.front()) continue;
    each.run();
    return failures == 0 ? 0 : 1;
  }
  std::printf("no case named %.*s\n", static_cast<int>(args.front().size()), args.front().data());
  return 2;
}
