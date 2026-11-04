#include "DnsMessage.h"

#include <cctype>

namespace kroma::discovery {

namespace {

constexpr std::size_t kHeaderSize = 12;
constexpr std::uint16_t kResponseFlag = 0x8000;
constexpr std::uint16_t kClassIn = 1;
constexpr std::byte kPointerMask{0xC0};
constexpr int kMaxPointerJumps = 32;
constexpr std::size_t kMaxLabelLength = 63;
constexpr std::size_t kMaxNameLength = 255;

void putUint16(std::vector<std::byte> &out, std::uint16_t value) {
  out.push_back(static_cast<std::byte>(value >> 8));
  out.push_back(static_cast<std::byte>(value & 0xFF));
}

void putName(std::vector<std::byte> &out, std::string_view name) {
  std::size_t start = 0;
  while (start < name.size()) {
    auto end = name.find('.', start);
    if (end == std::string_view::npos) end = name.size();
    if (const auto length = end - start; length > 0 && length <= kMaxLabelLength) {
      out.push_back(static_cast<std::byte>(length));
      for (const char character : name.substr(start, length)) out.push_back(static_cast<std::byte>(character));
    }
    start = end + 1;
  }
  out.push_back(std::byte{0});
}

std::string text(std::span<const std::byte> bytes) {
  std::string out;
  out.reserve(bytes.size());
  for (const auto byte : bytes) out.push_back(std::to_integer<char>(byte));
  return out;
}

class Reader {
 public:
  explicit Reader(std::span<const std::byte> data) : data_(data) {}

  bool has(std::size_t count) const {
    return offset_ + count <= data_.size();
  }

  std::uint16_t uint16() {
    const auto high = std::to_integer<std::uint16_t>(data_[offset_]);
    const auto low = std::to_integer<std::uint16_t>(data_[offset_ + 1]);
    offset_ += 2;
    return static_cast<std::uint16_t>((high << 8) | low);
  }

  std::uint32_t uint32() {
    const auto high = uint16();
    return (static_cast<std::uint32_t>(high) << 16) | uint16();
  }

  void skip(std::size_t count) {
    offset_ += count;
  }

  std::size_t offset() const {
    return offset_;
  }

  std::optional<std::vector<std::string>> labels() {
    std::vector<std::string> labels;
    std::size_t at = offset_;
    std::optional<std::size_t> resume;
    std::size_t length = 0;
    int jumps = 0;
    while (at < data_.size()) {
      const auto byte = data_[at];
      if ((byte & kPointerMask) == kPointerMask) {
        ++jumps;
        if (at + 1 >= data_.size() || jumps > kMaxPointerJumps) return std::nullopt;
        if (!resume.has_value()) resume = at + 2;
        at = (std::to_integer<std::size_t>(byte & ~kPointerMask) << 8) | std::to_integer<std::size_t>(data_[at + 1]);
        continue;
      }
      if ((byte & kPointerMask) != std::byte{0}) return std::nullopt;
      const auto size = std::to_integer<std::size_t>(byte);
      if (size == 0) {
        offset_ = resume.value_or(at + 1);
        return labels;
      }
      length += size + 1;
      if (at + 1 + size > data_.size() || length > kMaxNameLength) return std::nullopt;
      labels.emplace_back(text(data_.subspan(at + 1, size)));
      at += 1 + size;
    }
    return std::nullopt;
  }

 private:
  std::span<const std::byte> data_;
  std::size_t offset_ = 0;
};

std::string dotted(const std::vector<std::string> &labels) {
  std::string name;
  for (const auto &label : labels) {
    if (!name.empty()) name += '.';
    name += label;
  }
  return name;
}

bool readRecordData(Reader &reader, Record &record, std::uint16_t length) {
  const auto end = reader.offset() + length;
  switch (record.type) {
    case kTypeA:
      if (length != 4) return false;
      record.ipv4 = reader.uint32();
      return true;
    case kTypePtr: {
      auto target = reader.labels();
      if (!target || target->empty() || reader.offset() != end) return false;
      record.target = dotted(*target);
      record.targetFirstLabel = target->front();
      return true;
    }
    case kTypeSrv: {
      if (length < 7) return false;
      reader.skip(4);
      record.port = reader.uint16();
      auto target = reader.labels();
      if (!target || reader.offset() != end) return false;
      record.target = dotted(*target);
      return true;
    }
    default:
      reader.skip(length);
      return true;
  }
}

} // namespace

std::vector<std::byte> encodeQuery(const std::vector<Question> &questions) {
  std::vector out(kHeaderSize, std::byte{0});
  out[4] = static_cast<std::byte>(questions.size() >> 8);
  out[5] = static_cast<std::byte>(questions.size() & 0xFF);
  for (const auto &question : questions) {
    putName(out, question.name);
    putUint16(out, question.type);
    putUint16(out, kClassIn);
  }
  return out;
}

std::optional<std::vector<Record>> parseResponse(std::span<const std::byte> message) {
  Reader reader(message);
  if (!reader.has(kHeaderSize)) return std::nullopt;
  reader.skip(2);
  if ((reader.uint16() & kResponseFlag) == 0) return std::nullopt;
  const auto questions = reader.uint16();
  const std::size_t records = std::size_t{reader.uint16()} + reader.uint16() + reader.uint16();
  for (std::uint16_t index = 0; index < questions; ++index) {
    if (!reader.labels() || !reader.has(4)) return std::nullopt;
    reader.skip(4);
  }
  std::vector<Record> parsed;
  for (std::size_t index = 0; index < records; ++index) {
    auto name = reader.labels();
    if (!name || !reader.has(10)) return std::nullopt;
    Record record{.name = dotted(*name)};
    record.type = reader.uint16();
    reader.skip(6);
    const auto length = reader.uint16();
    if (!reader.has(length)) return std::nullopt;
    if (!readRecordData(reader, record, length)) return std::nullopt;
    parsed.push_back(std::move(record));
  }
  return parsed;
}

std::string foldedName(std::string_view name) {
  std::string folded(name);
  for (auto &character : folded) {
    character = static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
  }
  return folded;
}

} // namespace kroma::discovery
