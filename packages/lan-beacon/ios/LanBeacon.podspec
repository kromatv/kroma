Pod::Spec.new do |s|
  s.name           = 'LanBeacon'
  s.version        = '1.0.0'
  s.summary        = 'Publishes and finds waiting KROMA televisions over DNS-SD'
  s.description    = 'Advertises _kroma-tv._tcp from a television and browses for it from a phone, so a handoff can be authorized by having heard the record rather than by an address the server had to reason about.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
