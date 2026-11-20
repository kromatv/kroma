Pod::Spec.new do |s|
  s.name           = 'LanReach'
  s.version        = '1.0.0'
  s.summary        = 'Presses a Samsung remote key and sends a Wake-on-LAN packet on the local network'
  s.description    = 'What a KROMA app does to a television on its own network that HTTP cannot: the power key over the set\'s own remote service, and a Wake-on-LAN packet.'
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
