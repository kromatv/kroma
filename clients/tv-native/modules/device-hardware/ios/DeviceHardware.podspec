Pod::Spec.new do |s|
  s.name           = 'DeviceHardware'
  s.version        = '1.0.0'
  s.summary        = "The set's own CPU and memory counts for the About screen"
  s.description    = 'Reads ProcessInfo activeProcessorCount and physicalMemory, which Hermes has no Web API to reach.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
