#include "DnsMessage.h"

#include <cctype>

namespace kroma::discovery {

namespace {

constexpr std::size_t kHeaderSize = 12;
constexpr std::uint16_t kResponseFlag = 0x8000;
constexpr std::uint16_t kClassIn = 1;
constexpr std::uint8_t kPointerMask = 0xC0;
constexpr int kMaxPointerJumps = 32;
constexpr std::size_t kMaxNameLength = 255;

void putUint16(std::vector<std::uint8_t> &out, std::uint16_t value) {
  out.push_back(static_cast<std::uint8_t>(value >> 8));
  out.push_back(static_cast<std::uint8_t>(value & 0xFF));
}

void putName(std::vector<std::uint8_t> &out, const std::string &name) {
  std::size_t start = 0;
  while (start < name.size()) {
    auto end = name.find('.', start);
    if (end == std::string::npos) end = name.size();
    const auto length = end - start;
    if (length > 0 && length < 64) {
      out.push_back(static_cast<std::uint8_t>(length));
      out.insert(out.end(), name.begin() + static_cast<std::ptrdiff_t>(start), name.begin() + static_cast<std::ptrdiff_t>(end));
    }
    start = end + 1;
  }
  out.push_back(0);
}

class Reader {
 public:
  Reader(const std::uint8_t *data, std::size_t size) : data_(data), size_(size) {}

  bool has(std::size_t count) const {
    return offset_ + count <= size_;
  }

  std::uint16_t uint16() {
    const auto value = static_cast<std::uint16_t>((data_[offset_] << 8) | data_[offset_ + 1]);
    offset_ += 2;
    return value;
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
    for (int jumps = 0; at < size_;) {
      const auto byte = data_[at];
      if ((byte & kPointerMask) == kPointerMask) {
        if (at + 1 >= size_ || ++jumps > kMaxPointerJumps) return std::nullopt;
        if (!resume) resume = at + 2;
        at = (static_cast<std::size_t>(byte & ~kPointerMask) << 8) | data_[at + 1];
        continue;
      }
      if (byte & kPointerMask) return std::nullopt;
      if (byte == 0) {
        offset_ = resume.value_or(at + 1);
        return labels;
      }
      length += byte + 1;
      if (at + 1 + byte > size_ || length > kMaxNameLength) return std::nullopt;
      labels.emplace_back(reinterpret_cast<const char *>(data_ + at + 1), byte);
      at += 1 + byte;
    }
    return std::nullopt;
  }

 private:
  const std::uint8_t *data_;
  std::size_t size_;
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
  switch (static_cast<RecordType>(record.type)) {
    case RecordType::A:
      if (length != 4) return false;
      record.ipv4 = reader.uint32();
      return true;
    case RecordType::Ptr: {
      auto target = reader.labels();
      if (!target || target->empty() || reader.offset() != end) return false;
      record.target = dotted(*target);
      record.targetFirstLabel = target->front();
      return true;
    }
    case RecordType::Srv: {
      if (length < 7) return false;
      reader.skip(4);
      record.port = reader.uint16();
      auto target = reader.labels();
      if (!target || reader.offset() != end) return false;
      record.target = dotted(*target);
      return true;
    }
  }
  reader.skip(length);
  return true;
}

} // namespace

std::vector<std::uint8_t> encodeQuery(const std::vector<Question> &questions) {
  std::vector<std::uint8_t> out(kHeaderSize, 0);
  out[4] = static_cast<std::uint8_t>(questions.size() >> 8);
  out[5] = static_cast<std::uint8_t>(questions.size() & 0xFF);
  for (const auto &question : questions) {
    putName(out, question.name);
    putUint16(out, static_cast<std::uint16_t>(question.type));
    putUint16(out, kClassIn);
  }
  return out;
}

std::optional<std::vector<Record>> parseResponse(const std::uint8_t *data, std::size_t size) {
  Reader reader(data, size);
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

std::string foldedName(const std::string &name) {
  std::string folded = name;
  for (auto &character : folded) {
    character = static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
  }
  return folded;
}

} // namespace kroma::discovery
