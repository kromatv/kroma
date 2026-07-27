Pod::Spec.new do |s|
  s.name           = 'ServerDiscovery'
  s.version        = '1.0.0'
  s.summary        = 'Finds KROMA servers on the local network over DNS-SD'
  s.description    = 'Browses _kroma._tcp with NWBrowser so the app can be told where the server is instead of sweeping the subnet for it.'
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
